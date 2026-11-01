const nativeFetch = typeof globalThis.fetch === 'function'
    ? globalThis.fetch.bind(globalThis)
    : null;

const CACHE_PREFIX = 'tt:v1';

function playlistPlayableKey(playlistId) {
    return `${CACHE_PREFIX}:playlist:${String(playlistId).trim()}:playable`;
}

function playlistRawFallbackKey(playlistId) {
    return `${CACHE_PREFIX}:playlist:${String(playlistId).trim()}:raw`;
}

const UK_TOP_40_PLAYABLE_KEY = playlistPlayableKey('2868476282');
const UK_TOP_40_RAW_FALLBACK_KEY = playlistRawFallbackKey('2868476282');
const DEFAULT_PLAYABLE_KEY = playlistPlayableKey('13650203641');
const DEFAULT_RAW_FALLBACK_KEY = playlistRawFallbackKey('13650203641');
const WARM_LOCK_KEY = `${CACHE_PREFIX}:warm-lock`;

const TTL = {
    SUGGEST_SECONDS: 7 * 24 * 60 * 60,        // 7 days in Redis
    TRACK_LIST_SECONDS: 7 * 24 * 60 * 60,     // 7 days in Redis (preview URLs stripped)
    LYRICS_SECONDS: 7 * 24 * 60 * 60,         // 7 days rolling cache for verified lyrics
    PLAYLIST_PLAYABLE_SECONDS: 2 * 24 * 60 * 60, // 48 hours rolling cache for pre-warmed playlist manifests
    LYRICS_MISS_SECONDS: 24 * 60 * 60,        // 24 hours negative cache for 404 lyrics
    TRACK_DETAILS_SECONDS: 10 * 60,           // 10 mins (contains fresh signed audio preview URL)
    OG_IMAGE_SECONDS: 30 * 24 * 60 * 60,      // 30 days immutable edge and L1 cache for generated song OG images
    RAW_PLAYLIST_FALLBACK_SECONDS: 15 * 60,   // 15 mins before first cron warm completes
    DEFAULT_L1_SECONDS: 60 * 60               // 1 hour max in warm serverless RAM for keys without explicit TTL
};

function normalizeCachePart(value) {
    return String(value || '')
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[\u2018\u2019\u201A\u201B`]/g, "'")
        .replace(/[^a-z0-9']+/g, ' ')
        .trim();
}

function stripTrackDecorations(title) {
    const raw = String(title || '').trim();
    if (!raw) return '';
    return raw
        .replace(/\s*\((?:feat\.?|ft\.?|featuring|with|from|live|radio edit|remaster(?:ed)?|version|deluxe)[^)]*\)/gi, '')
        .replace(/\s*\[(?:feat\.?|ft\.?|featuring|with|from|live|radio edit|remaster(?:ed)?|version|deluxe)[^\]]*\]/gi, '')
        .replace(/\s+-\s+(?:radio edit|remaster(?:ed)?.*|live.*|single version|album version)$/i, '')
        .replace(/\s+(?:feat\.?|ft\.?|featuring)\s+.+$/i, '')
        .trim();
}

function lyricsCacheKey(artist, track) {
    return `${CACHE_PREFIX}:lyrics:${normalizeCachePart(artist)}::${normalizeCachePart(track)}`;
}

function suggestCacheKey(query) {
    return `${CACHE_PREFIX}:suggest:${normalizeCachePart(query)}`;
}

function tracksSearchCacheKey(query) {
    return `${CACHE_PREFIX}:tracks:${normalizeCachePart(query)}`;
}

function topTracksCacheKey(artistId, limit) {
    return `${CACHE_PREFIX}:top-tracks:${String(artistId).trim()}:${Number(limit) || 50}`;
}

function trackDetailsCacheKey(trackId) {
    return `${CACHE_PREFIX}:track-details:${String(trackId).trim()}`;
}

function ogSongImageCacheKey(trackId) {
    return `${CACHE_PREFIX}:og-song:v4:${String(trackId).trim()}`;
}

const UNWANTED_ARTIST_PATTERNS = [
    /\b(piano covers?|piano version)\b/i,
    /\bkaraoke\b/i,
    /\binstrumental\b/i,
    /\bbacking tracks?\b/i,
    /\btribute\b/i,
    /\b(?:lullaby|rockabye)\b/i,
    /\b(?:string quartet)\b/i,
    /\b(?:covers? club|covers? band)\b/i
];

const UNWANTED_TITLE_PATTERNS = [
    /\b(?:piano covers?|piano version)\b/i,
    /\b(?:karaoke|karaoke version)\b/i,
    /\b(?:instrumental|instrumental version)\b/i,
    /\bbacking tracks?\b/i,
    /\b(?:originally performed by|in the style of|tribute to)\b/i,
    /\b(?:guitar covers?|drum covers?|bass covers?)\b/i,
    /\b(?:lullaby version|8[- ]?bit version)\b/i,
    /\b(?:orchestral cover|orchestral version)\b/i
];

/**
 * Identifies instrumental, piano cover, karaoke, and tribute tracks that
 * do not have published vocal lyrics in lyrics databases.
 */
function isUnwantedTrack(track) {
    if (!track) return false;
    const artist = (track.artist && (typeof track.artist === 'object' ? track.artist.name : track.artist)) || '';
    const title = track.title || '';
    const titleVersion = track.title_version || '';

    if (UNWANTED_ARTIST_PATTERNS.some((p) => p.test(artist))) return true;
    if (UNWANTED_TITLE_PATTERNS.some((p) => p.test(title) || p.test(titleVersion))) return true;
    return false;
}

/**
 * Strips short-lived signed Deezer MP3 preview tokens (`hdnea=exp=...`) and unused fields
 * so artist/song lists and the UK Top 40 manifest can be safely cached 24/7 in Redis & Edge CDN.
 */
function sanitizeTrackForCache(track) {
    if (!track || typeof track !== 'object') return null;
    const sanitized = {
        id: track.id,
        title: track.title,
        title_short: track.title_short || track.title,
        duration: track.duration,
        artist: track.artist
            ? {
                id: track.artist.id,
                name: track.artist.name,
                picture_small: track.artist.picture_small || '',
                picture_medium: track.artist.picture_medium || ''
            }
            : undefined,
        album: track.album
            ? {
                id: track.album.id,
                title: track.album.title,
                cover_small: track.album.cover_small || '',
                cover_medium: track.album.cover_medium || ''
            }
            : undefined
    };

    if (Array.isArray(track.contributors) && track.contributors.length > 0) {
        sanitized.contributors = track.contributors.map((c) => ({
            id: c.id,
            name: c.name
        }));
    }

    return sanitized;
}

function resolveRedisConfig(env = process.env) {
    if (!env) return null;
    const url = String(env.UPSTASH_REDIS_REST_URL || env.KV_REST_API_URL || '')
        .trim()
        .replace(/\/+$/, '');
    const token = String(env.UPSTASH_REDIS_REST_TOKEN || env.KV_REST_API_TOKEN || '').trim();
    if (!url || !token) return null;
    return { url, token };
}

function createCacheClient(options = {}) {
    const maxL1Entries = options.maxL1Entries || 500;
    const fetchImpl = options.fetchImpl || nativeFetch;
    const getEnv = options.getEnv || (() => process.env);

    const l1 = new Map();
    const inflight = new Map();

    function getL1(key) {
        const entry = l1.get(key);
        if (!entry) return undefined;
        if (entry.expiresAt !== null && Date.now() > entry.expiresAt) {
            l1.delete(key);
            return undefined;
        }
        // Refresh LRU order
        l1.delete(key);
        l1.set(key, entry);
        return entry.value;
    }

    function setL1(key, value, ttlSeconds = null) {
        if (l1.has(key)) l1.delete(key);
        while (l1.size >= maxL1Entries) {
            const oldestKey = l1.keys().next().value;
            if (oldestKey === undefined) break;
            l1.delete(oldestKey);
        }
        const effectiveTtl = (typeof ttlSeconds === 'number' && ttlSeconds > 0)
            ? ttlSeconds
            : TTL.DEFAULT_L1_SECONDS;
        l1.set(key, {
            value,
            expiresAt: Date.now() + effectiveTtl * 1000
        });
    }

    function deleteL1(key) {
        l1.delete(key);
    }

    function clearMemory() {
        l1.clear();
        inflight.clear();
    }

    function isRedisConfigured() {
        return Boolean(resolveRedisConfig(getEnv()) && fetchImpl);
    }

    async function redisCommand(commandArray) {
        const cfg = resolveRedisConfig(getEnv());
        if (!cfg || !fetchImpl) return undefined;

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 3500);
        try {
            const res = await fetchImpl(cfg.url, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${cfg.token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(commandArray),
                signal: controller.signal
            });
            if (!res.ok) {
                throw new Error(`Upstash HTTP ${res.status}`);
            }
            const body = await res.json();
            if (body && body.error) {
                throw new Error(body.error);
            }
            return body ? body.result : null;
        } finally {
            clearTimeout(timeout);
        }
    }

    async function get(key, optionsObj = {}) {
        const { skipRedis = false, l1TtlSeconds = null } = optionsObj;
        const memVal = getL1(key);
        if (memVal !== undefined) return memVal;

        if (skipRedis || !isRedisConfigured()) return undefined;

        try {
            const raw = await redisCommand(['GET', key]);
            if (raw === null || raw === undefined) return undefined;
            const parsed = JSON.parse(raw);
            setL1(key, parsed, l1TtlSeconds);
            return parsed;
        } catch (err) {
            console.warn(`Cache GET warning for ${key}:`, err.message);
            return undefined;
        }
    }

    async function mget(keys) {
        if (!Array.isArray(keys) || keys.length === 0) return [];
        const results = new Array(keys.length).fill(undefined);
        const missingIndices = [];
        const missingKeys = [];

        for (let i = 0; i < keys.length; i++) {
            const memVal = getL1(keys[i]);
            if (memVal !== undefined) {
                results[i] = memVal;
            } else {
                missingIndices.push(i);
                missingKeys.push(keys[i]);
            }
        }

        if (missingKeys.length === 0 || !isRedisConfigured()) {
            return results;
        }

        try {
            const rawList = await redisCommand(['MGET', ...missingKeys]);
            if (Array.isArray(rawList)) {
                for (let j = 0; j < missingKeys.length; j++) {
                    const raw = rawList[j];
                    if (raw !== null && raw !== undefined) {
                        try {
                            const parsed = JSON.parse(raw);
                            results[missingIndices[j]] = parsed;
                            setL1(missingKeys[j], parsed);
                        } catch (_) {}
                    }
                }
            }
        } catch (err) {
            console.warn('Cache MGET warning:', err.message);
        }

        return results;
    }

    async function set(key, value, ttlSeconds = null, optionsObj = {}) {
        const { skipRedis = false } = optionsObj;
        setL1(key, value, ttlSeconds);

        if (skipRedis || !isRedisConfigured()) return true;

        try {
            const serialized = JSON.stringify(value);
            const cmd = (typeof ttlSeconds === 'number' && ttlSeconds > 0)
                ? ['SET', key, serialized, 'EX', Math.round(ttlSeconds)]
                : ['SET', key, serialized];
            await redisCommand(cmd);
            return true;
        } catch (err) {
            console.warn(`Cache SET warning for ${key}:`, err.message);
            return false;
        }
    }

    /**
     * Atomic SET NX EX lock in Redis (falls back to L1 check when Redis is unconfigured).
     */
    async function acquireLock(key, ttlSeconds = 900) {
        if (getL1(key)) return false;
        if (!isRedisConfigured()) {
            setL1(key, true, ttlSeconds);
            return true;
        }
        try {
            const res = await redisCommand(['SET', key, '1', 'EX', Math.round(ttlSeconds), 'NX']);
            if (res === 'OK') {
                setL1(key, true, ttlSeconds);
                return true;
            }
            return false;
        } catch (err) {
            console.warn(`Cache lock warning for ${key}:`, err.message);
            return true;
        }
    }

    async function del(key) {
        deleteL1(key);
        if (!isRedisConfigured()) return;
        try {
            await redisCommand(['DEL', key]);
        } catch (err) {
            console.warn(`Cache DEL warning for ${key}:`, err.message);
        }
    }

    /**
     * Coalesces concurrent identical async lookups in the same process so traffic bursts
     * on a cache miss only trigger 1 upstream Deezer / lyrics.ovh request.
     */
    function coalesce(key, fn) {
        if (inflight.has(key)) {
            return inflight.get(key);
        }
        const promise = Promise.resolve()
            .then(() => fn())
            .finally(() => {
                inflight.delete(key);
            });
        inflight.set(key, promise);
        return promise;
    }

    return {
        get,
        mget,
        set,
        del,
        acquireLock,
        coalesce,
        clearMemory,
        isRedisConfigured,
        _l1Size: () => l1.size
    };
}

const defaultCache = createCacheClient();

module.exports = {
    CACHE_PREFIX,
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
    ogSongImageCacheKey,
    sanitizeTrackForCache,
    isUnwantedTrack,
    UNWANTED_ARTIST_PATTERNS,
    UNWANTED_TITLE_PATTERNS,
    resolveRedisConfig,
    createCacheClient,
    defaultCache
};
