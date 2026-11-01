const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const axios = require('axios');

const { isUnwantedTrack } = require('../cache');
const app = require('../server');
const { requestApp } = require('./helpers/http');
const { setupMockDom } = require('./helpers/dom');

test('Unwanted track & cover filter detection', async (t) => {
    await t.test('Identifies piano covers, karaoke, and instrumental versions as unwanted', () => {
        const coverTracks = [
            { title: 'expectations - piano cover', artist: { name: 'Olivia Rodrigo - Piano Covers' } },
            { title: 'expectations (Karaoke Version)', artist: { name: 'karaoke SESH' } },
            { title: 'expectations (Piano Karaoke Version)', artist: { name: 'Sing2Piano' }, title_version: '(Piano Karaoke Version)' },
            { title: 'Cruel Summer (Instrumental)', artist: { name: 'Taylor Swift' } },
            { title: 'Feather', artist: { name: 'The Piano Tribute Players' } },
            { title: 'Good Luck, Babe! (Backing Track)', artist: { name: 'Custom Backing Tracks' } },
            { title: 'Bad Guy (Lullaby Version)', artist: { name: 'Rockabye Baby!' } },
            { title: 'In the End (String Quartet Cover)', artist: { name: 'Vitamin String Quartet' } },
            { title: 'Flowers (Guitar Cover)', artist: { name: 'Acoustic Guitar Club' } }
        ];

        for (const track of coverTracks) {
            assert.equal(
                isUnwantedTrack(track),
                true,
                `Expected "${track.title}" by "${track.artist.name}" to be flagged as unwanted`
            );
        }
    });

    await t.test('Preserves valid original tracks and legitimate titles containing piano/tribute/acoustic', () => {
        const validTracks = [
            { title: 'expectations', artist: { name: 'Olivia Rodrigo' } },
            { title: 'Piano Man', artist: { name: 'Billy Joel' } },
            { title: 'Tribute', artist: { name: 'Tenacious D' } },
            { title: 'Mr. Blue Sky', artist: { name: 'Electric Light Orchestra' } },
            { title: 'Everlong (Acoustic Version)', artist: { name: 'Foo Fighters' } },
            { title: 'Enchanted (Taylor\'s Version)', artist: { name: 'Taylor Swift' } },
            { title: 'Espresso', artist: { name: 'Sabrina Carpenter' } }
        ];

        for (const track of validTracks) {
            assert.equal(
                isUnwantedTrack(track),
                false,
                `Expected original track "${track.title}" by "${track.artist.name}" NOT to be flagged as unwanted`
            );
        }
    });
});

test('Server-side Deezer cover filtering on /suggest and /tracks', async (t) => {
    const server = app.listen(0);
    t.after(() => server.close());

    await t.test('GET /suggest strips piano covers and cover artists from search suggestions', async () => {
        const origGet = axios.get;
        axios.get = async () => ({
            data: {
                data: [
                    {
                        id: 4078105041,
                        title: 'expectations',
                        title_short: 'expectations',
                        title_version: '',
                        artist: { id: 111, name: 'Olivia Rodrigo', picture_small: 'https://cdn/pic.jpg' },
                        album: { id: 222, title: 'SOUR', cover_small: 'https://cdn/cover.jpg' }
                    },
                    {
                        id: 4287872752,
                        title: 'expectations - piano cover',
                        title_short: 'expectations - piano cover',
                        title_version: '',
                        artist: { id: 999, name: 'Olivia Rodrigo - Piano Covers', picture_small: 'https://cdn/junk.jpg' },
                        album: { id: 888, title: 'Piano Covers', cover_small: 'https://cdn/cover.jpg' }
                    },
                    {
                        id: 4123568311,
                        title: 'expectations (Originally Performed by Olivia Rodrigo) (Karaoke Version)',
                        title_short: 'expectations (Karaoke Version)',
                        title_version: '(Karaoke Version)',
                        artist: { id: 777, name: 'karaoke SESH', picture_small: 'https://cdn/karaoke.jpg' },
                        album: { id: 666, title: 'Karaoke', cover_small: 'https://cdn/cover.jpg' }
                    }
                ]
            }
        });

        try {
            const res = await requestApp(server, '/suggest?q=olivia%20rodrigo%20expectations');
            assert.equal(res.statusCode, 200);
            const data = JSON.parse(res.body);

            // Cover artist accounts should be stripped
            assert.ok(!data.artists.some(a => a.name.includes('Piano Covers')));
            assert.ok(!data.artists.some(a => a.name.includes('karaoke')));
            assert.equal(data.artists[0].name, 'Olivia Rodrigo');

            // Cover and karaoke tracks should be stripped
            assert.ok(!data.tracks.some(t => t.title.includes('piano cover')));
            assert.ok(!data.tracks.some(t => t.title.includes('Karaoke Version')));
            assert.equal(data.tracks.length, 1);
            assert.equal(data.tracks[0].title, 'expectations');
            assert.equal(data.tracks[0].artist, 'Olivia Rodrigo');
        } finally {
            axios.get = origGet;
        }
    });

    await t.test('GET /tracks filters out cover versions when original versions are returned', async () => {
        const origGet = axios.get;
        axios.get = async () => ({
            data: {
                data: [
                    {
                        id: 4078105041,
                        title: 'expectations',
                        title_short: 'expectations',
                        duration: 180,
                        artist: { id: 111, name: 'Olivia Rodrigo' },
                        album: { id: 222, title: 'SOUR' }
                    },
                    {
                        id: 4287872752,
                        title: 'expectations - piano cover',
                        title_short: 'expectations - piano cover',
                        duration: 180,
                        artist: { id: 999, name: 'Olivia Rodrigo - Piano Covers' },
                        album: { id: 888, title: 'Piano Covers' }
                    }
                ]
            }
        });

        try {
            const res = await requestApp(server, '/tracks?artist=olivia%20rodrigo%20expectations');
            assert.equal(res.statusCode, 200);
            const data = JSON.parse(res.body);
            assert.equal(data.data.length, 1);
            assert.equal(data.data[0].title, 'expectations');
            assert.equal(data.data[0].artist.name, 'Olivia Rodrigo');
        } finally {
            axios.get = origGet;
        }
    });
});

test('Toast notifications UI and alert replacement', async (t) => {
    const htmlContent = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf-8');

    await t.test('public/index.html includes accessible #toast-container', () => {
        assert.ok(
            htmlContent.includes('id="toast-container"'),
            'index.html must include #toast-container'
        );
        assert.ok(
            htmlContent.includes('aria-live="polite"'),
            '#toast-container should have aria-live="polite" for screen reader accessibility'
        );
    });

    await t.test('showToast renders non-intrusive toast with icon, message, and close button in mock DOM', () => {
        const { getOrCreateElement } = setupMockDom();
        const container = getOrCreateElement('toast-container');

        delete require.cache[require.resolve('../public/script')];
        const scriptModule = require('../public/script');

        const toast = scriptModule.showToast('Lyrics not found for "expectations". Try another track.', 'error', 0);
        assert.ok(toast, 'showToast should return a toast element');
        assert.ok(container.children.includes(toast), 'Toast should be appended to container');
        assert.ok(toast.classList.contains('toast-error'), 'Toast should have toast-error class');

        const msgEl = toast.querySelector('.toast-message');
        assert.ok(msgEl, 'Toast should contain .toast-message');
        assert.equal(msgEl.textContent, 'Lyrics not found for "expectations". Try another track.');

        const closeBtn = toast.querySelector('.toast-close-btn');
        assert.ok(closeBtn, 'Toast should have .toast-close-btn');

        closeBtn.click();
        assert.ok(toast.classList.contains('toast-hiding'), 'Toast should receive toast-hiding class on close');
    });

    await t.test('Client search failure uses showToast instead of native window.alert', async () => {
        let alertCalled = false;
        let lastToastMsg = null;
        let lastToastType = null;

        const origAlert = global.alert;
        global.alert = () => { alertCalled = true; };

        // Save original scriptModule
        delete require.cache[require.resolve('../public/script')];
        const scriptModule = require('../public/script');

        // Test that handleSongSearch throws the improved friendly error
        const origFetch = global.fetch;
        global.fetch = async () => ({
            ok: true,
            json: async () => ({ data: [] })
        });

        try {
            await assert.rejects(
                async () => {
                    await scriptModule.handleSongSearch('Olivia Rodrigo - expectations - piano cover');
                },
                /Lyrics not found for "Olivia Rodrigo - expectations - piano cover"\. Try another track or artist\./
            );

            assert.equal(alertCalled, false, 'Native alert must not be called');
        } finally {
            global.fetch = origFetch;
            global.alert = origAlert;
        }
    });
});
