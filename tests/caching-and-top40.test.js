const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const axios = require('axios');

const {
    UK_TOP_40_PLAYABLE_KEY,
    createCacheClient,
    resolveRedisConfig,
    stripTrackDecorations,
    sanitizeTrackForCache,
    lyricsCacheKey
} = require('../cache');

const app = require('../server');
const { requestApp } = require('./helpers/http');

/**
 * In-memory mock of Upstash Redis HTTP REST API (`GET`, `MGET`, `SET`, `DEL`)
 */
function createMockUpstashFetch() {
    const store = new Map();
    const commands = [];

    const fetchImpl = async (_url, init) => {
        const cmd = JSON.parse(init.body);
        commands.push(cmd);
        const op = String(cmd[0]).toUpperCase();

        if (op === 'GET') {
            const entry = store.get(cmd[1]);
            return {
                ok: true,
                status: 200,
                json: async () => ({ result: entry ? entry.value : null })
            };
        }

        if (op === 'MGET') {
            const keys = cmd.slice(1);
            const values = keys.map((k) => {
                const entry = store.get(k);
                return entry ? entry.value : null;
            });
            return {
                ok: true,
                status: 200,
                json: async () => ({ result: values })
            };
        }

        if (op === 'SET') {
            const key = cmd[1];
            const val = cmd[2];
            const flags = cmd.slice(3).map((x) => String(x).toUpperCase());
            const isNx = flags.includes('NX');
            if (isNx && store.has(key)) {
                return { ok: true, status: 200, json: async () => ({ result: null }) };
            }
            const exIdx = flags.indexOf('EX');
            const ttl = exIdx !== -1 ? Number(cmd[3 + exIdx + 1]) : null;
            store.set(key, { value: val, ttl });
            return { ok: true, status: 200, json: async () => ({ result: 'OK' }) };
        }

        if (op === 'DEL') {
            const deleted = store.delete(cmd[1]) ? 1 : 0;
            return { ok: true, status: 200, json: async () => ({ result: deleted }) };
        }

        return { ok: false, status: 400, json: async () => ({ error: `Unsupported op ${op}` }) };
    };

    return { store, commands, fetchImpl };
}

test('Upstash Redis REST client, env auto-detection, MGET batching & request coalescing', async (t) => {
    await t.test('resolveRedisConfig supports both KV_REST_API_* and UPSTASH_REDIS_REST_* env vars', () => {
        const kvCfg = resolveRedisConfig({
            KV_REST_API_URL: 'https://green-horizon.upstash.io/',
            KV_REST_API_TOKEN: 'secret-kv-token'
        });
        assert.deepEqual(kvCfg, {
            url: 'https://green-horizon.upstash.io',
            token: 'secret-kv-token'
        });

        const upstashCfg = resolveRedisConfig({
            UPSTASH_REDIS_REST_URL: 'https://direct.upstash.io',
            UPSTASH_REDIS_REST_TOKEN: 'secret-upstash-token'
        });
        assert.deepEqual(upstashCfg, {
            url: 'https://direct.upstash.io',
            token: 'secret-upstash-token'
        });

        assert.equal(resolveRedisConfig({}), null);
    });

    await t.test('L1 + L2 Upstash read-through, permanent vs TTL SET, and single-command MGET', async () => {
        const mockUpstash = createMockUpstashFetch();
        const client = createCacheClient({
            fetchImpl: mockUpstash.fetchImpl,
            getEnv: () => ({
                KV_REST_API_URL: 'https://green-horizon.upstash.io',
                KV_REST_API_TOKEN: 'tok_123'
            })
        });

        // Permanent SET (no EX flag) for verified lyrics
        await client.set('tt:v1:lyrics:queen::bohemian rhapsody', { lyrics: 'Is this the real life?' }, null);
        assert.deepEqual(mockUpstash.commands[0].slice(0, 2), ['SET', 'tt:v1:lyrics:queen::bohemian rhapsody']);
        assert.equal(mockUpstash.commands[0].length, 3, 'Permanent lyrics SET must omit EX expiration');

        // Expiring SET (with EX)
        await client.set('tt:v1:suggest:queen', { artists: ['Queen'] }, 86400);
        assert.equal(mockUpstash.commands[1][3], 'EX');
        assert.equal(mockUpstash.commands[1][4], 86400);

        // L1 hit should NOT issue a network GET to Upstash
        const cmdCountBeforeL1 = mockUpstash.commands.length;
        const l1Hit = await client.get('tt:v1:lyrics:queen::bohemian rhapsody');
        assert.equal(l1Hit.lyrics, 'Is this the real life?');
        assert.equal(mockUpstash.commands.length, cmdCountBeforeL1, 'L1 hit must consume 0 Redis commands');

        // Simulate serverless cold start by clearing L1 memory -> should read from L2 Upstash
        client.clearMemory();
        const l2Hit = await client.get('tt:v1:lyrics:queen::bohemian rhapsody');
        assert.equal(l2Hit.lyrics, 'Is this the real life?');

        // MGET across cold keys issues a single batch command
        client.clearMemory();
        const batchBefore = mockUpstash.commands.length;
        const batch = await client.mget([
            'tt:v1:lyrics:queen::bohemian rhapsody',
            'tt:v1:suggest:queen',
            'tt:v1:lyrics:missing::song'
        ]);
        assert.equal(mockUpstash.commands.length, batchBefore + 1, 'MGET must batch all keys into 1 Redis command');
        assert.equal(batch[0].lyrics, 'Is this the real life?');
        assert.deepEqual(batch[1], { artists: ['Queen'] });
        assert.equal(batch[2], undefined);
    });

    await t.test('coalesce deduplicates concurrent misses into 1 upstream call', async () => {
        const client = createCacheClient({ getEnv: () => ({}) });
        let upstreamCalls = 0;

        const work = () => client.coalesce('inflight:key', async () => {
            upstreamCalls++;
            await new Promise((r) => setTimeout(r, 25));
            return 'shared-result';
        });

        const results = await Promise.all([work(), work(), work(), work()]);
        assert.deepEqual(results, ['shared-result', 'shared-result', 'shared-result', 'shared-result']);
        assert.equal(upstreamCalls, 1);
    });

    await t.test('stripTrackDecorations & sanitizeTrackForCache clean titles and remove expiring preview URLs', () => {
        assert.equal(stripTrackDecorations('I Had Some Help (feat. Morgan Wallen)'), 'I Had Some Help');
        assert.equal(stripTrackDecorations('Espresso - Radio Edit'), 'Espresso');
        assert.equal(stripTrackDecorations('Guess featuring billie eilish'), 'Guess');

        const cleaned = sanitizeTrackForCache({
            id: 55,
            title: 'Espresso',
            duration: 175,
            preview: 'https://cdnt-preview.dzcdn.net/expiring?hdnea=exp=123',
            md5_image: 'unused',
            artist: { id: 9, name: 'Sabrina Carpenter', picture_small: 'pic.jpg' },
            album: { id: 8, title: "Short n' Sweet", cover_medium: 'cov.jpg' }
        });
        assert.equal(cleaned.preview, undefined);
        assert.equal(cleaned.md5_image, undefined);
        assert.equal(cleaned.artist.name, 'Sabrina Carpenter');
        assert.equal(cleaned.album.cover_medium, 'cov.jpg');
    });
});

test('Express Edge headers, read-through lyrics/Deezer caching & 24/7 UK Top 40 pre-warming', async (t) => {
    const server = app.listen(0);
    const origGet = axios.get;
    const origCronSecret = process.env.CRON_SECRET;

    t.after(() => {
        axios.get = origGet;
        if (origCronSecret === undefined) delete process.env.CRON_SECRET;
        else process.env.CRON_SECRET = origCronSecret;
        app._cache.clearMemory();
        server.close();
    });

    await t.test('GET /lyrics caches hits permanently (30d Edge), retries stripped feat. titles, and caches 404s for 24h', async () => {
        app._cache.clearMemory();
        let ovhCalls = 0;

        axios.get = async (url) => {
            ovhCalls++;
            if (url.includes(encodeURIComponent('I Had Some Help (feat. Morgan Wallen)'))) {
                const err = new Error('Not Found');
                err.response = { status: 404 };
                throw err;
            }
            if (url.includes(encodeURIComponent('I Had Some Help'))) {
                return { data: { lyrics: 'I had some help, it aint like I can make this kind of mess all by myself' } };
            }
            const err = new Error('Not Found');
            err.response = { status: 404 };
            throw err;
        };

        // 1. Collaboration title falls back to stripped base title and caches under both keys
        const first = await requestApp(
            server,
            '/lyrics?artist=Post%20Malone&track=I%20Had%20Some%20Help%20(feat.%20Morgan%20Wallen)'
        );
        assert.equal(first.statusCode, 200);
        assert.match(first.headers['cache-control'], /s-maxage=2592000/);
        assert.equal(first.headers['x-cache'], 'MISS');
        assert.match(JSON.parse(first.body).lyrics, /make this kind of mess/);
        assert.equal(ovhCalls, 2, '1st call tries raw feat. title then stripped base title');

        // 2. Repeat request with different casing hits cache with 0 OVH calls
        const second = await requestApp(
            server,
            '/lyrics?artist=post%20malone&track=i%20had%20some%20help%20(feat.%20morgan%20wallen)'
        );
        assert.equal(second.statusCode, 200);
        assert.equal(second.headers['x-cache'], 'HIT');
        assert.equal(ovhCalls, 2, 'Cached song must make 0 additional OVH calls');

        // 3. Missing track returns 404 with 24h negative cache and does not re-hit OVH
        const miss1 = await requestApp(server, '/lyrics?artist=Unknown&track=Nonexistent');
        assert.equal(miss1.statusCode, 404);
        assert.match(miss1.headers['cache-control'], /s-maxage=86400/);
        const callsAfterFirstMiss = ovhCalls;

        const miss2 = await requestApp(server, '/lyrics?artist=unknown&track=nonexistent');
        assert.equal(miss2.statusCode, 404);
        assert.equal(miss2.headers['x-cache'], 'HIT-MISS');
        assert.equal(ovhCalls, callsAfterFirstMiss, 'Negative-cached 404 must not hammer lyrics.ovh again');
    });

    await t.test('GET /tracks, /top-tracks, and /track-details decouple expiring preview tokens & serve Edge Cache-Control', async () => {
        app._cache.clearMemory();
        let deezerCalls = 0;

        axios.get = async (url) => {
            deezerCalls++;
            if (url.includes('api.deezer.com/artist/99/top')) {
                return {
                    data: {
                        data: [{
                            id: 101,
                            title: 'Espresso',
                            duration: 175,
                            preview: 'https://cdnt-preview.dzcdn.net/expiring.mp3?hdnea=exp=9999999999',
                            artist: { id: 99, name: 'Sabrina Carpenter' },
                            album: { id: 50, title: "Short n' Sweet", cover_medium: 'cover.jpg' }
                        }]
                    }
                };
            }
            if (url.includes('api.deezer.com/track/101')) {
                return {
                    data: {
                        id: 101,
                        release_date: '2024-04-11',
                        bpm: 104,
                        duration: 175,
                        preview: 'https://cdnt-preview.dzcdn.net/fresh.mp3?hdnea=exp=9999999999'
                    }
                };
            }
            throw new Error(`Unexpected URL ${url}`);
        };

        const top1 = await requestApp(server, '/top-tracks?artistId=99&limit=100');
        assert.equal(top1.statusCode, 200);
        assert.match(top1.headers['cache-control'], /s-maxage=86400/);
        const topData = JSON.parse(top1.body);
        assert.equal(topData.data[0].preview, undefined, '/top-tracks must strip expiring preview token');

        const top2 = await requestApp(server, '/top-tracks?artistId=99&limit=100');
        assert.equal(top2.headers['x-cache'], 'HIT');
        assert.equal(deezerCalls, 1);

        const details = await requestApp(server, '/track-details?trackId=101');
        assert.equal(details.statusCode, 200);
        assert.match(details.headers['cache-control'], /s-maxage=600/);
        assert.equal(
            JSON.parse(details.body).preview,
            'https://cdnt-preview.dzcdn.net/fresh.mp3?hdnea=exp=9999999999',
            '/track-details must supply fresh signed preview URL'
        );
    });

    await t.test('24/7 UK Top 40 cron warmer pre-filters playable OVH songs & serves /default + /lyrics with 0 live API calls', async () => {
        app._cache.clearMemory();
        process.env.CRON_SECRET = 'test-cron-secret';
        let deezerPlaylistCalls = 0;
        let ovhCalls = 0;

        axios.get = async (url) => {
            if (url.includes('api.deezer.com/playlist/')) {
                deezerPlaylistCalls++;
                return {
                    data: {
                        tracks: {
                            data: [
                                {
                                    id: 1,
                                    title: 'Espresso',
                                    duration: 175,
                                    preview: 'https://cdnt-preview.dzcdn.net/temp1.mp3',
                                    artist: { id: 99, name: 'Sabrina Carpenter' },
                                    album: { id: 10, title: "Short n' Sweet", cover_medium: 'c1.jpg' }
                                },
                                {
                                    id: 2,
                                    title: 'Instrumental Dub (No Lyrics)',
                                    duration: 180,
                                    preview: 'https://cdnt-preview.dzcdn.net/temp2.mp3',
                                    artist: { id: 88, name: 'DJ Test' },
                                    album: { id: 11, title: 'Club Mix', cover_medium: 'c2.jpg' }
                                },
                                {
                                    id: 3,
                                    title: 'BIRDS OF A FEATHER',
                                    duration: 210,
                                    preview: 'https://cdnt-preview.dzcdn.net/temp3.mp3',
                                    artist: { id: 77, name: 'Billie Eilish' },
                                    album: { id: 12, title: 'HIT ME HARD AND SOFT', cover_medium: 'c3.jpg' }
                                }
                            ]
                        }
                    }
                };
            }

            if (url.includes('api.lyrics.ovh')) {
                ovhCalls++;
                if (url.includes(encodeURIComponent('Espresso'))) {
                    return { data: { lyrics: 'Now he is thinking bout me every night oh' } };
                }
                if (url.includes(encodeURIComponent('BIRDS OF A FEATHER'))) {
                    return { data: { lyrics: 'Birds of a feather, we should stick together' } };
                }
                const err = new Error('Not Found');
                err.response = { status: 404 };
                throw err;
            }

            throw new Error(`Unexpected URL: ${url}`);
        };

        // Unauthorized cron call rejected when CRON_SECRET is set
        const unauth = await requestApp(server, '/api/cron/warm-cache');
        assert.equal(unauth.statusCode, 401);

        // Authorized cron warm
        const warmRes = await requestApp(server, '/api/cron/warm-cache', {
            Authorization: 'Bearer test-cron-secret'
        });
        assert.equal(warmRes.statusCode, 200);
        const summary = JSON.parse(warmRes.body);
        assert.equal(summary.ok, true);
        assert.equal(summary.ukTop40Total, 3);
        assert.equal(summary.ukTop40Playable, 2, 'Track missing on OVH must be filtered out of playable Top 40');

        // Now freeze counters: live user traffic to /default + /lyrics must make ZERO upstream calls!
        const playlistCallsAfterWarm = deezerPlaylistCalls;
        const ovhCallsAfterWarm = ovhCalls;

        const defaultRes = await requestApp(server, '/default');
        assert.equal(defaultRes.statusCode, 200);
        assert.equal(defaultRes.headers['x-cache'], 'HIT-PREWARMED');
        const defaultBody = JSON.parse(defaultRes.body);
        assert.equal(defaultBody.prewarmed, true);
        assert.equal(defaultBody.tracks.data.length, 2);
        assert.equal(defaultBody.tracks.data[0].preview, undefined);

        for (const track of defaultBody.tracks.data) {
            const lyrRes = await requestApp(
                server,
                `/lyrics?artist=${encodeURIComponent(track.artist.name)}&track=${encodeURIComponent(track.title)}`
            );
            assert.equal(lyrRes.statusCode, 200);
            assert.equal(lyrRes.headers['x-cache'], 'HIT');
        }

        assert.equal(deezerPlaylistCalls, playlistCallsAfterWarm, '/default must make 0 live Deezer calls when pre-warmed');
        assert.equal(ovhCalls, ovhCallsAfterWarm, '/lyrics for UK Top 40 tracks must make 0 live OVH calls');

        // Second daily cron run skips already-cached Top 40 lyrics via MGET
        const warmAgain = await app._warmUkTop40Cache({ featuredBatchLimit: 0 });
        assert.equal(warmAgain.newlyFetchedLyrics, 0, 'Subsequent daily warm must not re-fetch already cached Top 40 lyrics');
        assert.equal(ovhCalls, ovhCallsAfterWarm, 'Already-cached chart tracks + 24h negative-cached misses require 0 OVH calls');
    });

    await t.test('vercel.json configures a Hobby-compatible daily cron schedule for /api/cron/warm-cache', () => {
        const vercelCfg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'vercel.json'), 'utf8'));
        assert.ok(Array.isArray(vercelCfg.crons) && vercelCfg.crons.length === 1);
        assert.equal(vercelCfg.crons[0].path, '/api/cron/warm-cache');
        assert.equal(vercelCfg.crons[0].schedule, '0 6 * * *');
    });
});

test('Client-side preview token freshness & single-call artist search deduplication', async (t) => {
    const scriptModule = require('../public/script');

    await t.test('isPreviewUrlFresh detects expired vs active Deezer hdnea=exp tokens', () => {
        const nowSec = Math.floor(Date.now() / 1000);
        assert.equal(scriptModule.isPreviewUrlFresh(''), false);
        assert.equal(scriptModule.isPreviewUrlFresh(null), false);
        assert.equal(
            scriptModule.isPreviewUrlFresh(`https://cdnt-preview.dzcdn.net/a.mp3?hdnea=exp=${nowSec - 10}~acl=*`),
            false
        );
        assert.equal(
            scriptModule.isPreviewUrlFresh(`https://cdnt-preview.dzcdn.net/a.mp3?hdnea=exp=${nowSec + 600}~acl=*`),
            true
        );
        assert.equal(scriptModule.isPreviewUrlFresh('https://example.com/static-sample.mp3'), true);
    });

    await t.test('handleArtistSearch with knownArtistId skips /tracks and deduplicates /top-tracks', async () => {
        const origFetch = global.fetch;
        const calledUrls = [];

        global.fetch = async (url) => {
            calledUrls.push(url);
            if (url.startsWith('/top-tracks')) {
                return {
                    ok: true,
                    json: async () => ({
                        data: [{
                            id: 501,
                            title: 'Espresso',
                            duration: 175,
                            artist: { id: 99, name: 'Sabrina Carpenter' },
                            album: { id: 10, title: "Short n' Sweet", cover_medium: 'c.jpg' }
                        }]
                    })
                };
            }
            if (url.startsWith('/lyrics')) {
                return {
                    ok: true,
                    json: async () => ({ lyrics: 'Now he is thinking bout me every night oh' })
                };
            }
            if (url.startsWith('/track-details')) {
                return {
                    ok: true,
                    json: async () => ({
                        id: 501,
                        release_date: '2024-04-11',
                        duration: 175,
                        preview: 'https://cdnt-preview.dzcdn.net/fresh-501.mp3'
                    })
                };
            }
            return { ok: false };
        };

        try {
            scriptModule.trackDetailsCache.clear();
            scriptModule._setState({
                previousArtist: '',
                artistTracks: [],
                artistCandidateCache: {}
            });

            await scriptModule.handleArtistSearch('Sabrina Carpenter', 99);

            const tracksSearchCalls = calledUrls.filter((u) => u.startsWith('/tracks?'));
            const topTracksCalls = calledUrls.filter((u) => u.startsWith('/top-tracks'));
            assert.equal(tracksSearchCalls.length, 0, 'Known artistId from omnibox must skip /tracks lookup');
            assert.equal(topTracksCalls.length, 1, 'handleArtistSearch + ensureSelectedArtistCandidates must only call /top-tracks once');

            const state = scriptModule._getState();
            assert.equal(
                state.selectedTrack.preview,
                'https://cdnt-preview.dzcdn.net/fresh-501.mp3',
                'Selected track preview should be hydrated from /track-details'
            );
        } finally {
            global.fetch = origFetch;
        }
    });
});
