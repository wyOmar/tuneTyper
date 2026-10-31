const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const app = require('../server');
const {
    DEFAULT_PLAYLIST_ID,
    CURATED_PLAYLISTS,
    getCuratedPlaylist,
    getDefaultPlaylist,
    buildCuratedPlaylistsShelfHtml
} = require('../playlists');
const {
    playlistPlayableKey,
    playlistRawFallbackKey,
    createCacheClient
} = require('../cache');
const clientScript = require('../public/script');

function requestApp(server, urlPath, headers = {}) {
    return new Promise((resolve, reject) => {
        const http = require('http');
        const addr = server.address();
        const req = http.request(
            {
                hostname: '127.0.0.1',
                port: addr.port,
                path: urlPath,
                method: 'GET',
                headers
            },
            (res) => {
                let body = '';
                res.setEncoding('utf8');
                res.on('data', (chunk) => (body += chunk));
                res.on('end', () => resolve({ statusCode: res.statusCode, headers: res.headers, body }));
            }
        );
        req.on('error', reject);
        req.end();
    });
}

test('Curated Playlists Registry & Metadata Verification', async (t) => {
    await t.test('Registry defines exactly 5 curated playlists with 20s Pop as default', () => {
        assert.equal(CURATED_PLAYLISTS.length, 5);
        assert.equal(DEFAULT_PLAYLIST_ID, '13650203641');

        const defaultPlaylist = getDefaultPlaylist();
        assert.equal(defaultPlaylist.id, '13650203641');
        assert.equal(defaultPlaylist.name, '20s Pop');
        assert.equal(defaultPlaylist.isDefault, true);

        const expectedPlaylists = [
            { id: '13650203641', slug: '20s-pop', name: '20s Pop' },
            { id: '8282573142', slug: '10s-pop', name: '10s Pop' },
            { id: '248297032', slug: '00s-hits', name: '00s Hits' },
            { id: '2868476282', slug: 'uk-top-40', name: 'UK Top 40' },
            { id: '1306931615', slug: 'rock-essentials', name: 'Rock Essentials' }
        ];

        expectedPlaylists.forEach(expected => {
            const found = CURATED_PLAYLISTS.find(p => p.id === expected.id);
            assert.ok(found, `Playlist ${expected.name} (${expected.id}) must exist in registry`);
            assert.equal(found.slug, expected.slug);
            assert.ok(found.trackCount > 0, `${expected.name} must specify trackCount`);
            assert.ok(found.cover.startsWith('https://cdn-images.dzcdn.net/images/playlist/'), `${expected.name} must use valid Deezer CDN cover`);
        });
    });

    await t.test('getCuratedPlaylist resolves both playlist ID and slug case-insensitively', () => {
        assert.equal(getCuratedPlaylist('13650203641')?.name, '20s Pop');
        assert.equal(getCuratedPlaylist('20s-pop')?.name, '20s Pop');
        assert.equal(getCuratedPlaylist('20S-POP')?.name, '20s Pop');
        assert.equal(getCuratedPlaylist('1306931615')?.name, 'Rock Essentials');
        assert.equal(getCuratedPlaylist('rock-essentials')?.name, 'Rock Essentials');
        assert.equal(getCuratedPlaylist('uk-top-40')?.id, '2868476282');
        assert.equal(getCuratedPlaylist('non-existent-playlist'), null);
    });

    await t.test('buildCuratedPlaylistsShelfHtml renders 5 cards with active state on target playlist', () => {
        const html = buildCuratedPlaylistsShelfHtml('13650203641');
        assert.match(html, /id="curated-playlists-shelf"/);
        assert.match(html, /Popular Playlists/);

        // 5 cards rendered
        const cardMatches = html.match(/class="playlist-card/g) || [];
        assert.equal(cardMatches.length, 5);

        // Default playlist has active class and Active overlay
        assert.match(html, /class="playlist-card active"[^>]*data-playlist-id="13650203641"/);
        assert.match(html, /✓ Active/);

        // When switching active playlist to Rock Essentials
        const rockHtml = buildCuratedPlaylistsShelfHtml('1306931615');
        assert.match(rockHtml, /class="playlist-card active"[^>]*data-playlist-id="1306931615"/);
    });
});

test('Express Curated Playlists Routes & Redis Caching', async (t) => {
    const server = app.listen(0);
    t.after(() => server.close());

    await t.test('GET /playlists returns 200 with all 5 playlists and Edge Cache headers', async () => {
        const res = await requestApp(server, '/playlists');
        assert.equal(res.statusCode, 200);
        assert.match(res.headers['content-type'], /application\/json/);
        assert.match(res.headers['cache-control'], /s-maxage=86400/);

        const data = JSON.parse(res.body);
        assert.equal(data.defaultPlaylistId, '13650203641');
        assert.equal(data.playlists.length, 5);
        assert.equal(data.playlists[0].name, '20s Pop');
    });

    await t.test('GET /default defaults to 20s Pop and serves pre-warmed tracks when available', async () => {
        const testCache = app._cache;
        const key = playlistPlayableKey('13650203641');
        await testCache.set(key, {
            updatedAt: '2026-10-31T23:00:00Z',
            tracks: [
                { id: 101, title: 'Cruel Summer', artist: { id: 1, name: 'Taylor Swift' } },
                { id: 102, title: 'Espresso', artist: { id: 2, name: 'Sabrina Carpenter' } }
            ]
        });

        const res = await requestApp(server, '/default');
        assert.equal(res.statusCode, 200);
        assert.equal(res.headers['x-cache'], 'HIT-PREWARMED');
        assert.match(res.headers['cache-control'], /public, s-maxage=3600/);

        const data = JSON.parse(res.body);
        assert.equal(data.prewarmed, true);
        assert.equal(data.playlist.id, '13650203641');
        assert.equal(data.playlist.name, '20s Pop');
        assert.equal(data.tracks.data.length, 2);
    });

    await t.test('GET /default?id=1306931615 or /playlist/rock-essentials serves specific curated playlist', async () => {
        const testCache = app._cache;
        const key = playlistPlayableKey('1306931615');
        await testCache.set(key, {
            updatedAt: '2026-10-31T23:00:00Z',
            tracks: [
                { id: 201, title: 'Back In Black', artist: { id: 10, name: 'AC/DC' } }
            ]
        });

        // Test ?id= query param
        const resQuery = await requestApp(server, '/default?id=1306931615');
        assert.equal(resQuery.statusCode, 200);
        const dataQuery = JSON.parse(resQuery.body);
        assert.equal(dataQuery.playlist.name, 'Rock Essentials');
        assert.equal(dataQuery.tracks.data[0].title, 'Back In Black');

        // Test /playlist/:id route
        const resRoute = await requestApp(server, '/playlist/rock-essentials');
        assert.equal(resRoute.statusCode, 200);
        const dataRoute = JSON.parse(resRoute.body);
        assert.equal(dataRoute.playlist.id, '1306931615');
        assert.equal(dataRoute.tracks.data[0].title, 'Back In Black');
    });
});

test('Curated Playlists UI Integration & Shelf Switching', async (t) => {
    await t.test('public/index.html includes static 5-card curated playlists shelf with 20s Pop active', () => {
        const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
        assert.match(html, /id="curated-playlists-slot"/);
        assert.match(html, /id="curated-playlists-shelf"/);
        assert.match(html, /Popular Playlists/);

        // Must contain all 5 playlist buttons with their Deezer IDs
        assert.match(html, /data-playlist-id="13650203641"/);
        assert.match(html, /data-playlist-id="8282573142"/);
        assert.match(html, /data-playlist-id="248297032"/);
        assert.match(html, /data-playlist-id="2868476282"/);
        assert.match(html, /data-playlist-id="1306931615"/);

        // 20s Pop button is initially marked active
        assert.match(html, /class="playlist-card active"\s+data-playlist-id="13650203641"/);
    });

    await t.test('Client-side syncShelfVisibility displays playlists shelf when no artist is selected and hides it when artist is active', () => {
        // Setup mock DOM elements
        const elements = {};
        function createMockElement(id, attrs = {}) {
            return {
                id,
                style: { display: '' },
                getAttribute: (k) => attrs[k] || null,
                querySelectorAll: () => []
            };
        }

        const artistShelf = createMockElement('artist-tracks-shelf', { 'data-artist-name': 'Taylor Swift' });
        const playlistShelf = createMockElement('curated-playlists-shelf');

        const doc = {
            getElementById: (id) => {
                if (id === 'artist-tracks-shelf') return artistShelf;
                if (id === 'curated-playlists-shelf') return playlistShelf;
                return null;
            },
            querySelectorAll: () => []
        };

        const originalDoc = global.document;
        global.document = doc;

        try {
            // Case 1: No artist selected (default/home view)
            clientScript.syncShelfVisibility('');
            assert.equal(artistShelf.style.display, 'none', 'Artist shelf must be hidden on home/default view');
            assert.equal(playlistShelf.style.display, '', 'Curated playlists shelf must be visible on home/default view');

            // Case 2: User selects or lands on Taylor Swift
            clientScript.syncShelfVisibility('taylor swift');
            assert.equal(artistShelf.style.display, '', 'Artist shelf must be visible for active artist');
            assert.equal(playlistShelf.style.display, 'none', 'Curated playlists shelf must be hidden when artist is active');

            // Case 3: Search is cleared, returns to default
            clientScript.syncShelfVisibility('');
            assert.equal(artistShelf.style.display, 'none');
            assert.equal(playlistShelf.style.display, '');
        } finally {
            global.document = originalDoc;
        }
    });

    await t.test('updatePlaylistCardsActiveState sets active class on selected playlist card and removes it from others', () => {
        const cards = [
            {
                getAttribute: (k) => k === 'data-playlist-id' ? '13650203641' : null,
                classList: {
                    add: () => { cards[0]._active = true; },
                    remove: () => { cards[0]._active = false; }
                },
                querySelector: () => ({ textContent: '' }),
                _active: true
            },
            {
                getAttribute: (k) => k === 'data-playlist-id' ? '1306931615' : null,
                classList: {
                    add: () => { cards[1]._active = true; },
                    remove: () => { cards[1]._active = false; }
                },
                querySelector: () => ({ textContent: '' }),
                _active: false
            }
        ];

        const originalDoc = global.document;
        global.document = {
            querySelectorAll: (sel) => sel === '.playlist-card' ? cards : []
        };

        try {
            clientScript.updatePlaylistCardsActiveState('1306931615');
            assert.equal(cards[0]._active, false);
            assert.equal(cards[1]._active, true);
        } finally {
            global.document = originalDoc;
        }
    });
});
