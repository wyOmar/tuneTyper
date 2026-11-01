const express = require('express');
const axios = require('axios');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const {
    FEATURED_ARTISTS,
    resolveArtistFromSlug,
    renderArtistHtml,
    generateSitemapXml
} = require('./artists');
const {
    DEFAULT_PLAYLIST_ID,
    CURATED_PLAYLISTS,
    getCuratedPlaylist,
    getDefaultPlaylist
} = require('./playlists');
const {
    playlistPlayableKey,
    playlistRawFallbackKey,
    UK_TOP_40_PLAYABLE_KEY,
    UK_TOP_40_RAW_FALLBACK_KEY,
    DEFAULT_PLAYABLE_KEY,
    DEFAULT_RAW_FALLBACK_KEY,
    WARM_LOCK_KEY,
    TTL,
    normalizeCachePart,
    stripTrackDecorations,
    lyricsCacheKey,
    suggestCacheKey,
    tracksSearchCacheKey,
    topTracksCacheKey,
    trackDetailsCacheKey,
    sanitizeTrackForCache,
    isUnwantedTrack,
    defaultCache
} = require('./cache');

const UK_TOP_40_PLAYLIST_ID = '2868476282';

const app = express();
const PORT = 3000;
app.use(cors());

const publicDir = path.join(__dirname, 'public');
const indexHtmlPath = path.join(publicDir, 'index.html');
const baseIndexHtml = fs.readFileSync(indexHtmlPath, 'utf-8');

// Helper: run async tasks with bounded concurrency
async function mapWithConcurrency(items, concurrency, worker) {
    const results = new Array(items.length);
    let cursor = 0;

    async function next() {
        while (cursor < items.length) {
            const index = cursor++;
            results[index] = await worker(items[index], index);
        }
    }

    const runners = Array.from(
        { length: Math.min(concurrency, items.length) },
        () => next()
    );
    await Promise.all(runners);
    return results;
}

async function queryOvhSingle(artist, trackTitle) {
    try {
        const response = await axios.get(
            `https://api.lyrics.ovh/v1/${encodeURIComponent(artist)}/${encodeURIComponent(trackTitle)}`,
            { timeout: 8000 }
        );
        const lyrics = response && response.data && typeof response.data.lyrics === 'string'
            ? response.data.lyrics.trim()
            : '';
        if (lyrics) {
            return { found: true, lyrics: response.data.lyrics };
        }
        return { found: false };
    } catch (error) {
        if (error && error.response && error.response.status === 404) {
            return { found: false };
        }
        throw error;
    }
}

/**
 * Read-through lyrics resolver:
 * - 7-day rolling Redis cache on hit (automatically refreshed upon re-play or re-warm)
 * - 24h negative cache on genuine 404 / empty lyrics so missing songs don't hammer lyrics.ovh
 * - Automatic stripped-title retry when Deezer titles include "(feat. ...)" / "- Radio Edit"
 */
async function fetchAndCacheLyrics(artist, track, cache = defaultCache) {
    const primaryKey = lyricsCacheKey(artist, track);
    const cached = await cache.get(primaryKey);
    if (cached && typeof cached === 'object') {
        if (typeof cached.lyrics === 'string' && cached.lyrics.trim()) {
            return { status: 'hit', lyrics: cached.lyrics, cached: true };
        }
        if (cached.notFound) {
            return { status: 'not_found', lyrics: null, cached: true };
        }
    }

    return cache.coalesce(primaryKey, async () => {
        const recheck = await cache.get(primaryKey);
        if (recheck && typeof recheck === 'object') {
            if (typeof recheck.lyrics === 'string' && recheck.lyrics.trim()) {
                return { status: 'hit', lyrics: recheck.lyrics, cached: true };
            }
            if (recheck.notFound) {
                return { status: 'not_found', lyrics: null, cached: true };
            }
        }

        let lookup = await queryOvhSingle(artist, track);
        let usedFallbackKey = null;

        if (!lookup.found) {
            const stripped = stripTrackDecorations(track);
            if (stripped && normalizeCachePart(stripped) !== normalizeCachePart(track)) {
                const altKey = lyricsCacheKey(artist, stripped);
                const altCached = await cache.get(altKey);
                if (altCached && typeof altCached.lyrics === 'string' && altCached.lyrics.trim()) {
                    lookup = { found: true, lyrics: altCached.lyrics };
                } else {
                    lookup = await queryOvhSingle(artist, stripped);
                    if (lookup.found) {
                        usedFallbackKey = altKey;
                    }
                }
            }
        }

        if (lookup.found) {
            const payload = { lyrics: lookup.lyrics };
            await cache.set(primaryKey, payload, TTL.LYRICS_SECONDS); // 7-day rolling cache in Redis
            if (usedFallbackKey && usedFallbackKey !== primaryKey) {
                await cache.set(usedFallbackKey, payload, TTL.LYRICS_SECONDS);
            }
            return { status: 'fresh', lyrics: lookup.lyrics, cached: false };
        }

        await cache.set(primaryKey, { notFound: true }, TTL.LYRICS_MISS_SECONDS);
        return { status: 'not_found', lyrics: null, cached: false };
    });
}

/**
 * Pre-warms a single playlist into persistent Redis by verifying playable lyrics with lyrics.ovh.
 */
async function warmSinglePlaylist(playlistId, options = {}) {
    const cache = options.cache || defaultCache;
    const concurrency = options.concurrency || 5;

    const playlistRes = await axios.get(
        `https://api.deezer.com/playlist/${encodeURIComponent(playlistId)}`,
        { timeout: 10000 }
    );
    const rawTracks = (playlistRes.data && playlistRes.data.tracks && Array.isArray(playlistRes.data.tracks.data))
        ? playlistRes.data.tracks.data
        : [];

    const sanitizedTracks = rawTracks
        .map(sanitizeTrackForCache)
        .filter((t) => t && t.title && t.artist && t.artist.name);

    const trackKeys = sanitizedTracks.map((t) => lyricsCacheKey(t.artist.name, t.title));
    const existingEntries = await cache.mget(trackKeys);

    let newlyFetchedLyrics = 0;
    const playableTracks = [];

    await mapWithConcurrency(sanitizedTracks, concurrency, async (track, idx) => {
        const existing = existingEntries[idx];
        if (existing && typeof existing.lyrics === 'string' && existing.lyrics.trim()) {
            playableTracks[idx] = { ...track, lyrics: existing.lyrics };
            return;
        }
        if (existing && existing.notFound && !options.forceRecheckMissing) {
            return;
        }

        try {
            const result = await fetchAndCacheLyrics(track.artist.name, track.title, cache);
            if (result.lyrics) {
                if (!result.cached) newlyFetchedLyrics++;
                playableTracks[idx] = { ...track, lyrics: result.lyrics };
            }
        } catch (err) {
            console.warn(`Warm skip for "${track.title}" by ${track.artist.name}:`, err.message);
        }
    });

    const verified = playableTracks.filter(Boolean);
    const updatedAt = new Date().toISOString();
    const playableKey = playlistPlayableKey(playlistId);

    // Only overwrite manifest when at least 1 track succeeded so upstream OVH outages never wipe cache
    if (verified.length > 0) {
        await cache.set(playableKey, {
            updatedAt,
            playlistId,
            totalChartTracks: sanitizedTracks.length,
            totalTracks: sanitizedTracks.length,
            playableCount: verified.length,
            tracks: verified
        }, TTL.PLAYLIST_PLAYABLE_SECONDS);
    }

    return {
        playlistId,
        total: sanitizedTracks.length,
        playable: verified.length,
        newlyFetchedLyrics,
        updatedAt
    };
}

/**
 * Pre-warms curated playlists (default 20s Pop + other curated playlists) and SEO artist tracks.
 */
async function warmCuratedPlaylistsCache(options = {}) {
    const cache = options.cache || defaultCache;
    const concurrency = options.concurrency || 5;
    const playlistIds = Array.isArray(options.playlistIds) && options.playlistIds.length > 0
        ? options.playlistIds
        : (options.playlistId ? [options.playlistId] : [DEFAULT_PLAYLIST_ID, UK_TOP_40_PLAYLIST_ID]);

    const playlistSummaries = [];
    let totalNewlyFetchedLyrics = 0;

    for (const id of playlistIds) {
        try {
            const res = await warmSinglePlaylist(id, { ...options, cache, concurrency });
            playlistSummaries.push(res);
            totalNewlyFetchedLyrics += res.newlyFetchedLyrics;
        } catch (err) {
            console.warn(`Failed warming playlist ${id}:`, err.message);
        }
    }

    // Progressively pre-warm curated SEO artist tracks (up to featuredBatchLimit uncached songs per run)
    let featuredWarmed = 0;
    const featuredBatchLimit = options.featuredBatchLimit !== undefined ? options.featuredBatchLimit : 30;
    if (featuredBatchLimit > 0 && Array.isArray(FEATURED_ARTISTS)) {
        const allFeaturedPairs = [];
        for (const artist of FEATURED_ARTISTS) {
            if (!artist || !Array.isArray(artist.tracks)) continue;
            for (const t of artist.tracks) {
                if (t && t.title) {
                    allFeaturedPairs.push({ artist: artist.name, title: t.title });
                }
            }
        }

        const featuredKeys = allFeaturedPairs.map((p) => lyricsCacheKey(p.artist, p.title));
        const existingFeatured = await cache.mget(featuredKeys);
        const uncachedFeatured = allFeaturedPairs.filter((_, i) => !existingFeatured[i]).slice(0, featuredBatchLimit);

        await mapWithConcurrency(uncachedFeatured, concurrency, async (pair) => {
            try {
                const res = await fetchAndCacheLyrics(pair.artist, pair.title, cache);
                if (res.lyrics && !res.cached) featuredWarmed++;
            } catch (_) {}
        });
    }

    const defaultSummary = playlistSummaries.find(p => p.playlistId === DEFAULT_PLAYLIST_ID) || playlistSummaries[0] || {};
    const ukSummary = playlistSummaries.find(p => p.playlistId === UK_TOP_40_PLAYLIST_ID) || defaultSummary;

    return {
        ok: true,
        redisConfigured: cache.isRedisConfigured(),
        defaultTotal: defaultSummary.total || 0,
        defaultPlayable: defaultSummary.playable || 0,
        ukTop40Total: ukSummary.total !== undefined ? ukSummary.total : 0,
        ukTop40Playable: ukSummary.playable !== undefined ? ukSummary.playable : 0,
        playlists: playlistSummaries,
        newlyFetchedLyrics: totalNewlyFetchedLyrics,
        featuredWarmed,
        updatedAt: new Date().toISOString()
    };
}

async function warmUkTop40Cache(options = {}) {
    return warmCuratedPlaylistsCache(options);
}

// Dynamic XML Sitemap Route (served before static middleware so it is always fresh)
app.get('/sitemap.xml', (req, res) => {
    res.header('Content-Type', 'application/xml; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800');
    res.setHeader('Vary', 'Accept-Encoding');
    res.send(generateSitemapXml());
});

// Serve root /favicon.ico from /public/favicon/favicon.ico
app.get('/favicon.ico', (req, res) => {
    res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=604800, stale-while-revalidate=86400');
    res.sendFile(path.join(publicDir, 'favicon', 'favicon.ico'));
});

app.use(express.static(publicDir, {
    maxAge: '1d',
    setHeaders: (res, filePath) => {
        if (filePath.endsWith('.html')) {
            res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=86400, stale-while-revalidate=604800');
            res.setHeader('Vary', 'Accept-Encoding');
        } else if (filePath.match(/\.(css|js|png|jpg|jpeg|gif|ico|svg|woff2?|webmanifest)$/)) {
            res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=604800, stale-while-revalidate=86400');
        }
    }
}));

// Serve the frontend
app.get('/', (req, res) => {
    res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=86400, stale-while-revalidate=604800');
    res.setHeader('Vary', 'Accept-Encoding');
    res.sendFile(indexHtmlPath);
});

// Daily Vercel Cron Route: Pre-warms UK Top 40 + curated artist lyrics 24/7
app.get('/api/cron/warm-cache', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const cronSecret = (process.env.CRON_SECRET || '').trim();
    const isAuthorized = cronSecret && req.headers.authorization === `Bearer ${cronSecret}`;

    if (cronSecret && !isAuthorized) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    const force = req.query.force === '1' && isAuthorized;
    if (!force) {
        const locked = await defaultCache.acquireLock(WARM_LOCK_KEY, 900);
        if (!locked) {
            return res.json({
                ok: true,
                skipped: true,
                reason: 'Cache was already warmed within the last 15 minutes.'
            });
        }
    }

    try {
        const summary = await warmUkTop40Cache({
            forceRecheckMissing: force
        });
        res.json(summary);
    } catch (error) {
        console.error('Error warming UK Top 40 cache:', error.message);
        await defaultCache.del(WARM_LOCK_KEY);
        res.status(500).json({ ok: false, error: 'Failed to warm cache.' });
    }
});

/**
 * Guard middleware for internal game APIs:
 * - Direct browser address-bar navigation (Sec-Fetch-Dest: document, Sec-Fetch-Mode: navigate)
 *   is redirected back to the game UI rather than dumping raw JSON.
 * - Cross-origin hotlinking from unauthorized external domains is rejected.
 * - Requires in-app request header (X-Requested-With: TuneTyper) to prevent external scraping.
 */
function requireGameClient(req, res, next) {
    const fetchDest = req.headers['sec-fetch-dest'];
    const fetchMode = req.headers['sec-fetch-mode'];
    const accept = req.headers['accept'] || '';

    // Direct browser URL bar navigation (e.g. typing /default or /lyrics into address bar)
    if (fetchDest === 'document' || fetchMode === 'navigate' || (accept.includes('text/html') && !req.headers['x-requested-with'])) {
        return res.redirect(302, '/');
    }

    // Disallow cross-origin hotlinking from unauthorized third-party domains
    const origin = req.headers['origin'];
    const referer = req.headers['referer'];
    const host = req.headers['host'];

    if (origin) {
        try {
            const originHost = new URL(origin).host;
            if (host && originHost !== host && !originHost.includes('localhost') && !originHost.includes('127.0.0.1')) {
                return res.status(403).json({ error: 'Forbidden: cross-origin API access is disabled.' });
            }
        } catch (_) {}
    }

    if (referer) {
        try {
            const refererHost = new URL(referer).host;
            if (host && refererHost !== host && !refererHost.includes('localhost') && !refererHost.includes('127.0.0.1')) {
                return res.status(403).json({ error: 'Forbidden: unauthorized referer.' });
            }
        } catch (_) {}
    }

    // Require internal game client header
    const requestedWith = req.headers['x-requested-with'];
    if (requestedWith !== 'TuneTyper') {
        return res.status(403).json({
            error: 'Forbidden: direct API access is disabled. Play TuneTyper at https://type.vincentchan.uk'
        });
    }

    // Ensure downstream Edge CDNs (Vercel) partition cache entries by client verification headers
    res.setHeader('Vary', 'X-Requested-With, Sec-Fetch-Dest, Accept');

    next();
}

// Deezer API Route: Track / Artist Search (sanitized & cached 24h at Edge, 7d in Redis)
app.get('/tracks', requireGameClient, async (req, res) => {
    const artist = typeof req.query.artist === 'string' ? req.query.artist.trim() : '';
    if (!artist) return res.status(400).send('Artist name is required.');

    const key = tracksSearchCacheKey(artist);

    try {
        let cacheHit = true;
        let payload = await defaultCache.get(key);

        if (!payload) {
            cacheHit = false;
            payload = await defaultCache.coalesce(key, async () => {
                const response = await axios.get(
                    `https://api.deezer.com/search?limit=50&q=${encodeURIComponent(artist)}`,
                    { timeout: 8000 }
                );
                const rawList = (response.data && Array.isArray(response.data.data))
                    ? response.data.data
                    : [];
                const filteredList = rawList.filter((t) => !isUnwantedTrack(t));
                const listToUse = filteredList.length > 0 ? filteredList : rawList;
                const data = {
                    data: listToUse.map(sanitizeTrackForCache).filter(Boolean)
                };
                await defaultCache.set(key, data, TTL.TRACK_LIST_SECONDS);
                return data;
            });
        }

        res.setHeader('Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=604800');
        res.setHeader('X-Cache', cacheHit ? 'HIT' : 'MISS');
        res.json(payload);
    } catch (error) {
        console.error('Error fetching tracks:', error.message);
        res.setHeader('Cache-Control', 'no-store');
        res.status(500).send('Failed to fetch tracks.');
    }
});

// Lightweight Edge + Redis cached omnibox autocomplete route (omits expiring audio preview URLs)
app.get('/suggest', requireGameClient, async (req, res) => {
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    if (!q) return res.status(400).send('Query parameter q is required.');

    const key = suggestCacheKey(q);

    try {
        let cacheHit = true;
        let payload = await defaultCache.get(key, { skipRedis: true });

        if (!payload) {
            cacheHit = false;
            payload = await defaultCache.coalesce(key, async () => {
                const response = await axios.get(
                    `https://api.deezer.com/search?limit=20&q=${encodeURIComponent(q)}`,
                    { timeout: 8000 }
                );
                const items = (response.data && Array.isArray(response.data.data)) ? response.data.data : [];

                const seenArtists = new Set();
                const artists = [];
                const seenTracks = new Set();
                const tracks = [];

                for (const item of items) {
                    if (isUnwantedTrack(item)) {
                        continue;
                    }

                    if (item.artist && item.artist.name) {
                        const artistKey = item.artist.name.toLowerCase();
                        if (!seenArtists.has(artistKey) && artists.length < 5) {
                            seenArtists.add(artistKey);
                            artists.push({
                                id: item.artist.id,
                                name: item.artist.name,
                                picture: item.artist.picture_small || ''
                            });
                        }
                    }

                    const rawTitle = (item.title_short || item.title || '').trim();
                    const artistName = (item.artist && item.artist.name) ? item.artist.name.trim() : '';
                    if (rawTitle && artistName) {
                        const trackKey = `${artistName.toLowerCase()}::${rawTitle.toLowerCase()}`;
                        if (!seenTracks.has(trackKey) && tracks.length < 8) {
                            seenTracks.add(trackKey);
                            tracks.push({
                                id: item.id,
                                title: rawTitle,
                                artist: artistName,
                                cover: (item.album && item.album.cover_small) || ''
                            });
                        }
                    }
                }

                const result = { artists, tracks };
                await defaultCache.set(key, result, TTL.SUGGEST_SECONDS, { skipRedis: true });
                return result;
            });
        }

        // Safe to cache at Vercel CDN Edge for 24h (7d SWR) since no expiring audio tokens are returned
        res.setHeader('Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=604800');
        res.setHeader('X-Cache', cacheHit ? 'HIT' : 'MISS');
        res.json(payload);
    } catch (error) {
        console.error('Error fetching search suggestions:', error.message);
        res.setHeader('Cache-Control', 'no-store');
        res.status(500).send('Failed to fetch suggestions.');
    }
});

// Deezer API: Get top tracks for an artist (sanitized & cached 24h at Edge, 7d in Redis)
app.get('/top-tracks', requireGameClient, async (req, res) => {
    const artistId = typeof req.query.artistId === 'string' ? req.query.artistId.trim() : '';
    if (!artistId) return res.status(400).send('Artist ID is required.');
    const parsedLimit = parseInt(req.query.limit, 10);
    const limit = (!isNaN(parsedLimit) && parsedLimit > 0) ? Math.min(100, parsedLimit) : 50;

    const key = topTracksCacheKey(artistId, limit);

    try {
        let cacheHit = true;
        let payload = await defaultCache.get(key);

        if (!payload) {
            cacheHit = false;
            payload = await defaultCache.coalesce(key, async () => {
                const response = await axios.get(
                    `https://api.deezer.com/artist/${encodeURIComponent(artistId)}/top?limit=${limit}`,
                    { timeout: 8000 }
                );
                const rawList = (response.data && Array.isArray(response.data.data))
                    ? response.data.data
                    : [];
                const data = {
                    data: rawList.map(sanitizeTrackForCache).filter(Boolean)
                };
                await defaultCache.set(key, data, TTL.TRACK_LIST_SECONDS);
                return data;
            });
        }

        res.setHeader('Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=604800');
        res.setHeader('X-Cache', cacheHit ? 'HIT' : 'MISS');
        res.json(payload);
    } catch (error) {
        console.error('Error fetching top tracks:', error.message);
        res.setHeader('Cache-Control', 'no-store');
        res.status(500).send('Failed to fetch top tracks.');
    }
});

async function getPlaylistTracks(playlistId, options = {}) {
    const cache = options.cache || defaultCache;
    const resolvedId = String(playlistId || DEFAULT_PLAYLIST_ID).trim();
    const playableKey = playlistPlayableKey(resolvedId);
    const rawKey = playlistRawFallbackKey(resolvedId);

    const prewarmed = await cache.get(playableKey);
    if (prewarmed && Array.isArray(prewarmed.tracks) && prewarmed.tracks.length > 0) {
        // Strip embedded full lyrics from track list manifest so bulk song texts are never exposed over the wire
        const sanitizedTracks = prewarmed.tracks.map((t) => {
            if (!t) return t;
            const { lyrics, ...rest } = t;
            return rest;
        });
        return {
            tracks: { data: sanitizedTracks },
            prewarmed: true,
            updatedAt: prewarmed.updatedAt,
            cacheStatus: 'HIT-PREWARMED'
        };
    }

    let fallback = await cache.get(rawKey);
    let cacheHit = true;
    if (!fallback) {
        cacheHit = false;
        fallback = await cache.coalesce(rawKey, async () => {
            const response = await axios.get(
                `https://api.deezer.com/playlist/${encodeURIComponent(resolvedId)}`,
                { timeout: 8000 }
            );
            const rawTracks = (response.data && response.data.tracks && Array.isArray(response.data.tracks.data))
                ? response.data.tracks.data
                : [];
            const data = {
                tracks: { data: rawTracks.map(sanitizeTrackForCache).filter(Boolean) },
                prewarmed: false
            };
            await cache.set(rawKey, data, TTL.RAW_PLAYLIST_FALLBACK_SECONDS);
            return data;
        });
    }

    return {
        ...fallback,
        cacheStatus: cacheHit ? 'HIT' : 'MISS'
    };
}

// Curated Playlists metadata route (Edge cached 24h)
app.get('/playlists', requireGameClient, (req, res) => {
    res.setHeader('Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=604800');
    res.json({
        defaultPlaylistId: DEFAULT_PLAYLIST_ID,
        playlists: CURATED_PLAYLISTS
    });
});

// Curated Playlist Default Pool (serves 24/7 pre-warmed verified OVH tracks when available)
app.get('/default', requireGameClient, async (req, res) => {
    try {
        const queryId = req.query.id || req.query.playlist;
        const target = queryId ? getCuratedPlaylist(queryId) : getDefaultPlaylist();
        const playlistId = target ? target.id : (queryId || DEFAULT_PLAYLIST_ID);

        const result = await getPlaylistTracks(playlistId);
        if (result.cacheStatus === 'HIT-PREWARMED') {
            res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
            res.setHeader('X-Cache', 'HIT-PREWARMED');
        } else {
            res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=900');
            res.setHeader('X-Cache', result.cacheStatus);
        }

        res.json({
            playlist: target || { id: playlistId },
            tracks: result.tracks,
            prewarmed: result.prewarmed,
            updatedAt: result.updatedAt
        });
    } catch (error) {
        console.error('Error fetching tracks:', error.message);
        res.setHeader('Cache-Control', 'no-store');
        res.status(500).send('Failed to fetch tracks.');
    }
});

// Curated Playlist by ID / Slug route
app.get('/playlist/:id', requireGameClient, async (req, res) => {
    try {
        const target = getCuratedPlaylist(req.params.id);
        const playlistId = target ? target.id : req.params.id;

        const result = await getPlaylistTracks(playlistId);
        if (result.cacheStatus === 'HIT-PREWARMED') {
            res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
            res.setHeader('X-Cache', 'HIT-PREWARMED');
        } else {
            res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=900');
            res.setHeader('X-Cache', result.cacheStatus);
        }

        res.json({
            playlist: target || { id: playlistId },
            tracks: result.tracks,
            prewarmed: result.prewarmed,
            updatedAt: result.updatedAt
        });
    } catch (error) {
        console.error('Error fetching playlist:', error.message);
        res.setHeader('Cache-Control', 'no-store');
        res.status(500).send('Failed to fetch playlist.');
    }
});

// Deezer API: Get track details + fresh signed 30s audio preview URL (10m Edge + L1 cache)
app.get('/track-details', requireGameClient, async (req, res) => {
    const trackId = typeof req.query.trackId === 'string' ? req.query.trackId.trim() : '';
    if (!trackId) return res.status(400).send('Track ID is required.');

    const key = trackDetailsCacheKey(trackId);

    try {
        let cacheHit = true;
        let payload = await defaultCache.get(key, { skipRedis: true });

        if (!payload) {
            cacheHit = false;
            payload = await defaultCache.coalesce(key, async () => {
                const response = await axios.get(
                    `https://api.deezer.com/track/${encodeURIComponent(trackId)}`,
                    { timeout: 8000 }
                );
                if (response.data.error || !response.data.id) {
                    const err = new Error(response.data.error ? response.data.error.message : 'Track not found');
                    err.statusCode = 404;
                    throw err;
                }
                const data = {
                    id: response.data.id,
                    title: response.data.title,
                    title_short: response.data.title_short || response.data.title,
                    release_date: response.data.release_date,
                    bpm: response.data.bpm,
                    duration: response.data.duration,
                    preview: response.data.preview || '',
                    artist: response.data.artist ? {
                        id: response.data.artist.id,
                        name: response.data.artist.name,
                        picture_small: response.data.artist.picture_small,
                        picture_medium: response.data.artist.picture_medium
                    } : null,
                    album: response.data.album ? {
                        id: response.data.album.id,
                        title: response.data.album.title,
                        cover_small: response.data.album.cover_small,
                        cover_medium: response.data.album.cover_medium
                    } : null
                };
                await defaultCache.set(key, data, TTL.TRACK_DETAILS_SECONDS, { skipRedis: true });
                return data;
            });
        }

        // 10m Edge TTL keeps Deezer signed hdnea= preview URLs fresh while deduplicating bursts
        res.setHeader('Cache-Control', 'public, s-maxage=600, stale-while-revalidate=300');
        res.setHeader('X-Cache', cacheHit ? 'HIT' : 'MISS');
        res.json(payload);
    } catch (error) {
        console.error('Error fetching track details:', error.message);
        res.setHeader('Cache-Control', 'no-store');
        const status = error.statusCode || 500;
        res.status(status).json({ error: error.message || 'Failed to fetch track details.' });
    }
});

// OVH Lyrics API Route (cached 7-day rolling in Redis & 30d at Vercel CDN Edge)
app.get('/lyrics', requireGameClient, async (req, res) => {
    const artist = typeof req.query.artist === 'string' ? req.query.artist.trim() : '';
    const track = typeof req.query.track === 'string' ? req.query.track.trim() : '';
    if (!artist || !track) return res.status(400).send('Artist and track name are required.');

    try {
        const result = await fetchAndCacheLyrics(artist, track, defaultCache);
        if (!result.lyrics) {
            res.setHeader('Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=86400');
            res.setHeader('X-Cache', result.cached ? 'HIT-MISS' : 'MISS');
            return res.status(404).json({ error: 'Lyrics not found.' });
        }

        res.setHeader('Cache-Control', 'public, s-maxage=2592000, stale-while-revalidate=2592000');
        res.setHeader('X-Cache', result.cached ? 'HIT' : 'MISS');
        res.json({ lyrics: result.lyrics });
    } catch (error) {
        console.error('Error fetching lyrics:', error.message);
        res.setHeader('Cache-Control', 'no-store');
        res.status(500).send('Failed to fetch lyrics.');
    }
});

// Support /artist/:slug by 301-redirecting to canonical /:slug
app.get('/artist/:slug', (req, res, next) => {
    const artist = resolveArtistFromSlug(req.params.slug);
    if (!artist) return next();
    return res.redirect(301, `/${artist.slug}`);
});

// Programmatic SEO Artist Landing Route (e.g. /taylor-swift, /sabrina-carpenter)
app.get('/:slug', (req, res, next) => {
    const rawSlug = req.params.slug;
    if (!rawSlug || rawSlug.includes('.')) return next();

    const artist = resolveArtistFromSlug(rawSlug);
    if (!artist) return next();

    // Canonicalize uppercase, unhyphenated, or messy slugs via 301 redirect
    if (rawSlug !== artist.slug) {
        return res.redirect(301, `/${artist.slug}`);
    }

    res.header('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=86400, stale-while-revalidate=604800');
    res.setHeader('Vary', 'Accept-Encoding');
    res.send(renderArtistHtml(artist, baseIndexHtml));
});

// Start the server locally when run directly
if (require.main === module) {
    app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
}

// Expose internals on handler function for deterministic testing without changing default export type
app._cache = defaultCache;
app._warmUkTop40Cache = warmUkTop40Cache;
app._warmCuratedPlaylistsCache = warmCuratedPlaylistsCache;
app._getPlaylistTracks = getPlaylistTracks;
app._fetchAndCacheLyrics = fetchAndCacheLyrics;
app._requireGameClient = requireGameClient;

// @vercel/node requires the default export of server.js to be a request handler function or http.Server
module.exports = app;
