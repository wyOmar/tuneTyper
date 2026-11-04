const test = require('node:test');
const assert = require('node:assert/strict');
const axios = require('axios');

const {
    CACHE_PREFIX,
    normalizeCachePart,
    lyricsCacheKey,
    suggestCacheKey,
    playlistPlayableKey,
    createCacheClient
} = require('../cache');

const app = require('../server');
const { requestApp } = require('./helpers/http');

function notFound() {
    const err = new Error('Not Found');
    err.response = { status: 404 };
    return err;
}

test('cache keys preserve non-Latin titles and use the v2 prefix', () => {
    assert.equal(CACHE_PREFIX, 'tt:v2');
    assert.ok(lyricsCacheKey('BTS', 'Dynamite').startsWith('tt:v2:lyrics:'));

    // Hangul / Japanese / Cyrillic titles must not collapse into the same key
    assert.notEqual(lyricsCacheKey('BTS', '다이너마이트'), lyricsCacheKey('BTS', '봄날'));
    assert.notEqual(lyricsCacheKey('YOASOBI', '夜に駆ける'), lyricsCacheKey('YOASOBI', 'アイドル'));
    assert.notEqual(suggestCacheKey('кино'), suggestCacheKey('ддт'));
    assert.equal(normalizeCachePart('봄날'), '봄날');
    assert.equal(normalizeCachePart('ガラガラ'), 'ガラガラ', 'NFKD-decomposed kana is recomposed');

    // Existing Latin normalization behaviour is unchanged
    assert.equal(normalizeCachePart('Beyoncé'), 'beyonce');
    assert.equal(normalizeCachePart('  Don’t   Stop Me Now! '), "don't stop me now");
    assert.equal(lyricsCacheKey('Queen', 'Bohemian Rhapsody'), 'tt:v2:lyrics:queen::bohemian rhapsody');

    // Symbol-only input falls back to a stable short hash instead of an empty segment
    const a = normalizeCachePart('★☆★');
    const b = normalizeCachePart('♥♥');
    assert.match(a, /^h[0-9a-f]{12}$/);
    assert.notEqual(a, b);
    assert.equal(a, normalizeCachePart('★☆★'));
    assert.equal(normalizeCachePart(''), '');
    assert.equal(normalizeCachePart('   '), '');
});

test('fetchAndCacheLyrics does not re-query lyrics.ovh when the stripped title is negative-cached', async () => {
    const cache = createCacheClient({ getEnv: () => ({}) });
    const origGet = axios.get;
    let ovhCalls = 0;
    axios.get = async () => {
        ovhCalls++;
        throw notFound();
    };
    try {
        const first = await app._fetchAndCacheLyrics('Some Artist', 'Ghost Song (feat. Nobody)', cache);
        assert.equal(first.status, 'not_found');
        assert.equal(ovhCalls, 2, 'raw title then stripped title');

        // Another decorated variant reuses the stripped-title miss instead of hitting OVH again
        const second = await app._fetchAndCacheLyrics('Some Artist', 'Ghost Song - Radio Edit', cache);
        assert.equal(second.status, 'not_found');
        assert.equal(ovhCalls, 3, 'only the new raw title is queried');
    } finally {
        axios.get = origGet;
    }
});

test('warm cron honours its time budget and stores metadata-only playlist manifests', async () => {
    const cache = createCacheClient({ getEnv: () => ({}) });
    const origGet = axios.get;
    const tracks = Array.from({ length: 6 }, (_, i) => ({
        id: 100 + i,
        title: `Song ${i}`,
        duration: 180,
        preview: 'https://cdnt-preview.dzcdn.net/x.mp3',
        artist: { id: 1, name: 'Budget Artist' },
        album: { id: 2, title: 'Album', cover_medium: 'c.jpg' }
    }));

    axios.get = async (url) => {
        if (url.includes('api.deezer.com/playlist/')) {
            return { data: { tracks: { data: tracks } } };
        }
        if (url.includes('api.lyrics.ovh')) {
            await new Promise((r) => setTimeout(r, 40));
            return { data: { lyrics: 'la la la' } };
        }
        throw new Error(`Unexpected URL: ${url}`);
    };

    try {
        const summary = await app._warmCuratedPlaylistsCache({
            cache,
            playlistIds: ['555'],
            concurrency: 1,
            featuredBatchLimit: 0,
            deadline: Date.now() + 60
        });
        assert.equal(summary.timedOut, true);
        const playlist = summary.playlists[0];
        assert.ok(playlist.playable >= 1 && playlist.playable < tracks.length,
            `expected partial warm, got ${playlist.playable}`);

        const manifest = await cache.get(playlistPlayableKey('555'));
        assert.ok(manifest, 'partial results are still saved');
        assert.equal(manifest.tracks.length, playlist.playable);
        for (const t of manifest.tracks) {
            assert.equal(t.lyrics, undefined, 'manifest must not embed full lyrics');
            assert.ok(t.title && t.artist && t.artist.name);
        }

        // Lyrics themselves live under per-song keys
        const lyricsEntry = await cache.get(lyricsCacheKey('Budget Artist', manifest.tracks[0].title));
        assert.equal(lyricsEntry.lyrics, 'la la la');
    } finally {
        axios.get = origGet;
    }
});

test('HTTP hardening: ID validation, status propagation, origin guard, static headers, OG caching', async (t) => {
    const server = app.listen(0);
    const origGet = axios.get;
    t.after(() => {
        axios.get = origGet;
        app._cache.clearMemory();
        server.close();
    });

    await t.test('non-numeric IDs are rejected with 400', async () => {
        axios.get = async (url) => { throw new Error(`Unexpected upstream call: ${url}`); };
        for (const p of [
            '/playlist/abc..def',
            '/default?id=../../user',
            '/top-tracks?artistId=12;drop',
            '/track-details?trackId=1e5'
        ]) {
            const res = await requestApp(server, p, { headers: {} });
            assert.equal(res.statusCode, 400, p);
        }
    });

    await t.test('curated slugs are still accepted by /playlist/:id', async () => {
        const { CURATED_PLAYLISTS } = require('../playlists');
        const curated = CURATED_PLAYLISTS[0];
        axios.get = async () => ({ data: { tracks: { data: [] } } });
        app._cache.clearMemory();
        const res = await requestApp(server, `/playlist/${encodeURIComponent(curated.slug)}`, { headers: {} });
        assert.equal(res.statusCode, 200);
    });

    await t.test('upstream statusCode is propagated instead of a blanket 500', async () => {
        app._cache.clearMemory();
        axios.get = async () => ({ data: { error: { code: 4, message: 'Quota limit exceeded' } } });
        const playlistRes = await requestApp(server, '/playlist/424242', { headers: {} });
        assert.equal(playlistRes.statusCode, 429);
        const defaultRes = await requestApp(server, '/default?id=434343', { headers: {} });
        assert.equal(defaultRes.statusCode, 429);

        const detailsQuota = await requestApp(server, '/track-details?trackId=777001', { headers: {} });
        assert.equal(detailsQuota.statusCode, 429, 'Deezer quota error is not a 404');

        axios.get = async () => ({ data: { error: { type: 'DataException', code: 800, message: 'no data' } } });
        const detailsMissing = await requestApp(server, '/track-details?trackId=777002', { headers: {} });
        assert.equal(detailsMissing.statusCode, 404);
    });

    await t.test('origin guard uses exact localhost matching', async () => {
        axios.get = async () => { throw notFound(); };
        const evil = await requestApp(server, '/lyrics?artist=a&track=b', {
            headers: { origin: 'https://localhost.evil.com' }
        });
        assert.equal(evil.statusCode, 403);
        const evilReferer = await requestApp(server, '/lyrics?artist=a&track=b', {
            headers: { referer: 'https://evil-127.0.0.1.example.com/page' }
        });
        assert.equal(evilReferer.statusCode, 403);

        const local = await requestApp(server, '/lyrics?artist=a&track=b', {
            headers: { origin: 'http://localhost:5173' }
        });
        assert.equal(local.statusCode, 404, 'localhost dev origin passes the guard');
        assert.equal(local.headers['access-control-allow-origin'], undefined, 'no global CORS headers');
    });

    await t.test('unversioned JS/CSS revalidate while images keep long caching', async () => {
        const js = await requestApp(server, '/script.js', { headers: {} });
        assert.equal(js.statusCode, 200);
        assert.equal(js.headers['cache-control'], 'public, max-age=0, must-revalidate');
        const css = await requestApp(server, '/styles.css', { headers: {} });
        assert.equal(css.statusCode, 200);
        assert.equal(css.headers['cache-control'], 'public, max-age=0, must-revalidate');
        const img = await requestApp(server, '/og-image.png', { headers: {} });
        assert.equal(img.statusCode, 200);
        assert.match(img.headers['cache-control'], /max-age=86400/);
    });

    await t.test('SSR only uses dynamic og:image for numeric track IDs', async () => {
        axios.get = async () => { throw new Error('offline'); };
        const res = await requestApp(server, '/?id=not-a-number&artist=Queen&track=Bohemian%20Rhapsody', { headers: {} });
        assert.equal(res.statusCode, 200);
        assert.ok(!res.body.includes('/api/og/track?id=not-a-number'));
        assert.ok(res.body.includes('content="https://type.vincentchan.uk/og-image.png"'));
    });

    await t.test('degraded OG renders get a short cache header and are not memoized', async () => {
        app._cache.clearMemory();
        const l1Before = app._cache._l1Size();
        axios.get = async (url) => {
            if (url.includes('api.deezer.com/track/')) {
                return {
                    data: {
                        id: 880001,
                        title: 'Outage Song',
                        artist: { id: 1, name: 'Outage Artist' },
                        album: { id: 2, title: 'Album', cover_big: 'https://cdn.example.com/cover.jpg' }
                    }
                };
            }
            if (url.includes('api.lyrics.ovh')) {
                const err = new Error('timeout of 8000ms exceeded');
                err.code = 'ECONNABORTED';
                throw err;
            }
            throw new Error('cover offline');
        };

        const first = await requestApp(server, '/api/og/track?id=880001', { headers: {} });
        assert.equal(first.statusCode, 200);
        assert.equal(first.headers['cache-control'], 'public, max-age=300, s-maxage=3600');
        const second = await requestApp(server, '/api/og/track?id=880001', { headers: {} });
        assert.equal(second.headers['x-cache'], 'MISS', 'degraded PNG must not be memoized');

        // PNG buffers never land in the shared data LRU
        const keys = app._cache._l1Size() - l1Before;
        assert.ok(keys <= 2, `only track details/lyrics entries expected in shared L1, got ${keys}`);
    });

    await t.test('failed cover download inside the renderer also gets the short cache header', async () => {
        app._cache.clearMemory();
        axios.get = async (url) => {
            if (url.includes('api.deezer.com/track/')) {
                return {
                    data: {
                        id: 880002,
                        title: 'Cover Outage Song',
                        artist: { id: 1, name: 'Cover Outage Artist' },
                        album: { id: 2, title: 'Album', cover_big: 'https://cdn.example.com/cover2.jpg' }
                    }
                };
            }
            if (url.includes('api.lyrics.ovh')) {
                return { data: { lyrics: 'some words to show on the card' } };
            }
            throw new Error('cover offline');
        };

        const res = await requestApp(server, '/api/og/track?id=880002', { headers: {} });
        assert.equal(res.statusCode, 200);
        assert.equal(res.headers['cache-control'], 'public, max-age=300, s-maxage=3600');
    });
});

test('Cron warms every curated playlist, default first, rotating the rest daily', () => {
    const app = require('../server');
    const { CURATED_PLAYLISTS, DEFAULT_PLAYLIST_ID } = require('../playlists');
    const day = 86400000;
    const a = app._getWarmPlaylistOrder(0);
    const b = app._getWarmPlaylistOrder(day);

    assert.equal(a[0], DEFAULT_PLAYLIST_ID);
    assert.equal(b[0], DEFAULT_PLAYLIST_ID);
    for (const p of CURATED_PLAYLISTS) {
        assert.ok(a.includes(p.id), `${p.name} must be warmed`);
    }
    assert.equal(new Set(a).size, a.length, 'no playlist warmed twice');
    assert.notEqual(a[1], b[1], 'second slot rotates between days');
});
