const test = require('node:test');
const assert = require('node:assert/strict');
const { setupMockDom, createMockElement } = require('./helpers/dom');

const trackCards = [];
let scrollCalls = [];
let lyricsFetchCalls = [];

const MOCK_LYRICS_CRUEL_SUMMER = [
    'Fever dream high in the quiet of the night',
    'You know that I caught it bad bad boy',
    'Shiny toy with a price you know that I bought it',
    'Killing me slow out the window',
    'I am always waiting for you to be waiting below',
    'Devils roll the dice angels roll their eyes',
    'What does not kill me makes me want you more'
].join('\n');

const MOCK_LYRICS_ANTI_HERO = [
    'I have this thing where I get older but just never wiser',
    'Midnights become my afternoons when my depression works the graveyard shift',
    'All of the people I have ghosted stand there in the room',
    'I should not be left to my own devices they come with prices and vices',
    'It is me hi I am the problem it is me at tea time everybody agrees'
].join('\n');

const { getOrCreateElement } = setupMockDom({
    trackCards,
    scrollTo: (opts) => scrollCalls.push(opts),
    window: {
        __INITIAL_ARTIST__: { slug: 'taylor-swift', name: 'Taylor Swift' },
        location: {
            origin: 'https://type.vincentchan.uk',
            pathname: '/taylor-swift',
            search: '',
            hash: ''
        }
    }
});

global.getComputedStyle = () => ({ paddingTop: '10px' });

function createTrackCard(artist, track) {
    const card = createMockElement(`card-${track}`, {
        attrs: { 'data-artist': artist, 'data-track': track }
    });
    card.setAttribute('data-artist', artist);
    card.setAttribute('data-track', track);
    return card;
}

global.fetch = async (url) => {
    const urlStr = String(url);
    if (urlStr.startsWith('/default')) {
        return {
            ok: true,
            json: async () => ({
                tracks: {
                    data: [
                        {
                            id: 999,
                            title: 'UK Chart Topper',
                            artist: { id: 777, name: 'Chart Artist' },
                            album: { title: 'Hits 2026', cover_medium: 'https://example.com/art.jpg' }
                        }
                    ]
                }
            })
        };
    }
    if (urlStr.startsWith('/lyrics?')) {
        const params = new URLSearchParams(urlStr.split('?')[1]);
        const artist = params.get('artist');
        const track = params.get('track');
        lyricsFetchCalls.push({ artist, track });
        if (track && track.includes('anti-hero')) {
            return { ok: true, json: async () => ({ lyrics: MOCK_LYRICS_ANTI_HERO }) };
        }
        return { ok: true, json: async () => ({ lyrics: MOCK_LYRICS_CRUEL_SUMMER }) };
    }
    if (urlStr.startsWith('/track-details?')) {
        return { ok: true, json: async () => ({ preview: 'https://example.com/preview.mp3?exp=9999999999' }) };
    }
    if (urlStr.startsWith('/tracks?')) {
        const params = new URLSearchParams(urlStr.split('?')[1]);
        const q = params.get('artist') || '';
        const isAntiHero = q.includes('anti-hero');
        return {
            ok: true,
            json: async () => ({
                data: [
                    {
                        id: isAntiHero ? 202 : 101,
                        title: isAntiHero ? 'Anti-Hero' : 'Cruel Summer',
                        title_short: isAntiHero ? 'Anti-Hero' : 'Cruel Summer',
                        artist: { id: 12246, name: 'Taylor Swift' },
                        album: { title: isAntiHero ? 'Midnights' : 'Lover', cover_medium: 'https://example.com/cover.jpg' },
                        preview: 'https://example.com/preview.mp3?exp=9999999999'
                    }
                ]
            })
        };
    }
    return { ok: false, status: 404, json: async () => ({}) };
};

const scriptModule = require('../public/script');

test('Dynamic Artist Popular Tracks Generation & UK Top 40 suppression', async (t) => {
    await t.test('renderArtistPopularTracksShelf builds up to 5 unique cards with album covers and metadata for any artist', () => {
        const slot = getOrCreateElement('artist-tracks-slot');
        slot.innerHTML = '';

        const mockTracks = [
            {
                id: 1,
                title: 'Karma Police',
                album: { title: 'OK Computer', cover_medium: 'https://example.com/ok.jpg' },
                release_date: '1997-05-21'
            },
            {
                id: 2,
                title: 'Creep',
                album: { title: 'Pablo Honey', cover_medium: 'https://example.com/pablo.jpg' },
                release_date: '1993-02-22'
            },
            {
                id: 3,
                title: 'No Surprises',
                album: { title: 'OK Computer', cover_medium: 'https://example.com/ok.jpg' },
                release_date: '1997-05-21'
            },
            {
                id: 4,
                title: 'Paranoid Android',
                album: { title: 'OK Computer', cover_medium: 'https://example.com/ok.jpg' },
                release_date: '1997-05-21'
            },
            {
                id: 5,
                title: 'High and Dry',
                album: { title: 'The Bends', cover_medium: 'https://example.com/bends.jpg' },
                release_date: '1995-03-13'
            },
            {
                id: 6,
                title: 'Fake Plastic Trees',
                album: { title: 'The Bends', cover_medium: 'https://example.com/bends.jpg' },
                release_date: '1995-03-13'
            }
        ];

        scriptModule.renderArtistPopularTracksShelf('Radiohead', mockTracks);

        assert.ok(slot.innerHTML.includes('artist-track-card'), 'Should render artist-track-card buttons');
        assert.ok(slot.innerHTML.includes('data-artist-name="Radiohead"'), 'Should contain data-artist-name');
        assert.ok(slot.innerHTML.includes('Radiohead'), 'Should display artist title');
        assert.ok(slot.innerHTML.includes('Karma Police'), 'Should include first track');
        assert.equal(slot.innerHTML.includes('track-card-meta'), false, 'Should omit track-card-meta so titles have more room and no truncation');
        assert.ok(slot.innerHTML.includes('Creep'), 'Should include second track');
        assert.ok(slot.innerHTML.includes('No Surprises'), 'Should include third track');
        assert.ok(slot.innerHTML.includes('Paranoid Android'), 'Should include fourth track');
        assert.ok(slot.innerHTML.includes('High and Dry'), 'Should include fifth track');
        assert.equal(slot.innerHTML.includes('Fake Plastic Trees'), false, 'Should cap shelf at exactly 5 tracks');
    });

    await t.test('loadDefaultPlaylist hides the popular tracks shelf so UK Top 40 mystery song is never given away', async () => {
        const shelf = getOrCreateElement('artist-tracks-shelf');
        shelf.style.display = 'block';

        await scriptModule.loadDefaultPlaylist();
        assert.equal(shelf.style.display, 'none', 'Artist tracks shelf should be hidden in UK Top 40 mode');
    });

    await t.test('syncShelfVisibility displays shelf only when targetArtistName matches the shelf artist', () => {
        const shelf = getOrCreateElement('artist-tracks-shelf');
        shelf.setAttribute('data-artist-name', 'Sabrina Carpenter');

        scriptModule.syncShelfVisibility('Sabrina Carpenter');
        assert.equal(shelf.style.display, '', 'Shelf should remain visible when selecting same artist');

        scriptModule.syncShelfVisibility('Olivia Rodrigo');
        assert.equal(shelf.style.display, 'none', 'Shelf should hide immediately when switching to another artist');
    });
});

test('Popular tracks search-bar typing effect & Go replay behavior', async (t) => {
    await t.test('fakeTypeValue types from empty character-by-character into an input element', async () => {
        const mockInput = { value: '' };
        const observedFrames = [];

        const origSetTimeout = global.setTimeout;
        global.setTimeout = (fn, delay) => origSetTimeout(() => {
            observedFrames.push(mockInput.value);
            fn();
        }, Math.min(delay, 2));

        try {
            const typingPromise = scriptModule.fakeTypeValue(mockInput, 'Queen - Killer Queen', 5);
            assert.equal(mockInput.value, 'Q');
            await typingPromise;
            assert.equal(mockInput.value, 'Queen - Killer Queen');
            assert.ok(observedFrames.includes('Qu'), 'Should step through progressive prefixes');
            assert.ok(observedFrames.includes('Queen - '), 'Should include intermediate typed prefix');
        } finally {
            global.setTimeout = origSetTimeout;
        }
    });

    await t.test('fakeTypeValue smartly backspaces only mismatched suffix and types the new suffix (Sabrina Carpenter - Feather -> Espresso)', async () => {
        const mockInput = { value: 'Sabrina Carpenter - Feather' };
        const frames = [];

        const origSetTimeout = global.setTimeout;
        global.setTimeout = (fn, delay) => origSetTimeout(() => {
            frames.push(mockInput.value);
            fn();
        }, Math.min(delay, 2));

        try {
            const typingPromise = scriptModule.fakeTypeValue(mockInput, 'Sabrina Carpenter - Espresso', 4);
            assert.equal(mockInput.value, 'Sabrina Carpenter - Feathe');
            frames.unshift(mockInput.value);
            await typingPromise;

            assert.equal(mockInput.value, 'Sabrina Carpenter - Espresso');

            for (const frame of frames) {
                assert.ok(
                    frame.startsWith('Sabrina Carpenter - '),
                    `Expected frame "${frame}" to keep shared prefix "Sabrina Carpenter - "`
                );
            }

            const pivotIdx = frames.indexOf('Sabrina Carpenter - ');
            assert.ok(pivotIdx > 0, 'Should backspace cleanly down to "Sabrina Carpenter - "');
            assert.ok(frames.indexOf('Sabrina Carpenter - Feath') < pivotIdx, 'Should backspace Feather before pivot');
            assert.ok(frames.indexOf('Sabrina Carpenter - E') > pivotIdx, 'Should type Espresso after pivot');
            assert.ok(frames.indexOf('Sabrina Carpenter - Espr') > pivotIdx, 'Should progressively type Espresso');
        } finally {
            global.setTimeout = origSetTimeout;
        }
    });

    await t.test('fakeTypeValue appends " - Track" directly when input already contains the artist name', async () => {
        const mockInput = { value: 'Taylor Swift' };
        const frames = [];

        const origSetTimeout = global.setTimeout;
        global.setTimeout = (fn, delay) => origSetTimeout(() => {
            frames.push(mockInput.value);
            fn();
        }, Math.min(delay, 2));

        try {
            const typingPromise = scriptModule.fakeTypeValue(mockInput, 'Taylor Swift - Cruel Summer', 4);
            assert.equal(mockInput.value, 'Taylor Swift ');
            frames.unshift(mockInput.value);
            await typingPromise;

            assert.equal(mockInput.value, 'Taylor Swift - Cruel Summer');
            for (const frame of frames) {
                assert.ok(
                    frame.startsWith('Taylor Swift'),
                    `Expected frame "${frame}" to preserve artist name without deletion`
                );
            }
        } finally {
            global.setTimeout = origSetTimeout;
        }
    });

    await t.test('fakeTypeValue leaves input untouched with zero flicker when selecting the exact same song again', async () => {
        const mockInput = { value: 'Sabrina Carpenter - Espresso' };
        let timerScheduled = false;

        const origSetTimeout = global.setTimeout;
        global.setTimeout = (fn, delay) => {
            timerScheduled = true;
            return origSetTimeout(fn, delay);
        };

        try {
            await scriptModule.fakeTypeValue(mockInput, 'Sabrina Carpenter - Espresso', 22);
            assert.equal(mockInput.value, 'Sabrina Carpenter - Espresso');
            assert.equal(timerScheduled, false, 'No delete/type timers needed when value already matches');
        } finally {
            global.setTimeout = origSetTimeout;
        }
    });

    await t.test('Clicking a popular track card types "Artist - Track" into #artist-input, scrolls up, and pressing Go replays that song', async () => {
        lyricsFetchCalls = [];
        scrollCalls = [];
        const artistInput = getOrCreateElement('artist-input');
        const startBtn = getOrCreateElement('start-btn');
        const typingArea = getOrCreateElement('typing-area');
        const shelf = getOrCreateElement('artist-tracks-shelf');
        shelf.setAttribute('data-artist-name', 'Taylor Swift');
        shelf.style.display = '';

        artistInput.value = 'Taylor Swift';
        typingArea.focused = false;

        const cruelSummerCard = createTrackCard('Taylor Swift', 'Cruel Summer');
        const antiHeroCard = createTrackCard('Taylor Swift', 'Anti-Hero');
        trackCards.length = 0;
        trackCards.push(cruelSummerCard, antiHeroCard);

        scriptModule._setState({
            previousArtist: 'Taylor Swift',
            artistTracks: [
                {
                    id: 101,
                    title: 'Cruel Summer',
                    title_short: 'Cruel Summer',
                    artist: { id: 12246, name: 'Taylor Swift' },
                    album: { title: 'Lover', cover_medium: 'https://example.com/lover.jpg' },
                    preview: 'https://example.com/preview.mp3?exp=9999999999'
                },
                {
                    id: 202,
                    title: 'Anti-Hero',
                    title_short: 'Anti-Hero',
                    artist: { id: 12246, name: 'Taylor Swift' },
                    album: { title: 'Midnights', cover_medium: 'https://example.com/midnights.jpg' },
                    preview: 'https://example.com/preview2.mp3?exp=9999999999'
                }
            ],
            cachedSongLyrics: {}
        });

        scriptModule.bindArtistTrackCards(2);

        await cruelSummerCard.click();
        await new Promise((r) => setTimeout(r, 120));

        assert.equal(artistInput.value, 'Taylor Swift - Cruel Summer');
        assert.equal(cruelSummerCard.classList.contains('active'), true);
        assert.equal(antiHeroCard.classList.contains('active'), false);
        assert.equal(scrollCalls.length, 1);
        assert.deepEqual(scrollCalls[0], { top: 0, behavior: 'smooth' });
        assert.equal(scriptModule._getState().currentGameMode, 'song');
        assert.equal(scriptModule._getState().selectedTrack.title, 'Cruel Summer');
        assert.equal(typingArea.disabled, false);
        assert.equal(typingArea.focused, true);

        scriptModule._setState({ currentGameMode: 'artist', selectedTrack: null });
        typingArea.disabled = true;
        typingArea.focused = false;

        await startBtn.click();

        assert.equal(artistInput.value, 'Taylor Swift - Cruel Summer');
        assert.equal(scriptModule._getState().currentGameMode, 'song');
        assert.equal(scriptModule._getState().selectedTrack.title, 'Cruel Summer');
        assert.equal(shelf.style.display, '', 'Popular tracks shelf stays visible for matching artist');
        assert.equal(cruelSummerCard.classList.contains('active'), true, 'Active popular track card stays highlighted on Go replay');
        assert.equal(typingArea.disabled, false);
        assert.equal(typingArea.focused, true);
    });

    await t.test('Pressing Go mid-backspace/type animation snaps #artist-input to the full song query and replays that song', async () => {
        const artistInput = getOrCreateElement('artist-input');
        const startBtn = getOrCreateElement('start-btn');
        artistInput.value = 'Taylor Swift - Cruel Summer';

        const cruelSummerCard = createTrackCard('Taylor Swift', 'Cruel Summer');
        const antiHeroCard = createTrackCard('Taylor Swift', 'Anti-Hero');
        trackCards.length = 0;
        trackCards.push(cruelSummerCard, antiHeroCard);

        scriptModule.bindArtistTrackCards(80);

        await antiHeroCard.click();
        assert.equal(artistInput.value, 'Taylor Swift - Cruel Summe');

        await startBtn.click();

        assert.equal(artistInput.value, 'Taylor Swift - Anti-Hero');
        assert.equal(scriptModule._getState().currentGameMode, 'song');
        assert.equal(scriptModule._getState().selectedTrack.title, 'Anti-Hero');
        assert.equal(antiHeroCard.classList.contains('active'), true);
    });

    await t.test('Clicking another popular track mid-animation smartly backspaces partial progress and types the new track', async () => {
        const artistInput = getOrCreateElement('artist-input');
        artistInput.value = 'Taylor Swift';

        const cruelSummerCard = createTrackCard('Taylor Swift', 'Cruel Summer');
        const antiHeroCard = createTrackCard('Taylor Swift', 'Anti-Hero');
        trackCards.length = 0;
        trackCards.push(cruelSummerCard, antiHeroCard);

        scriptModule.bindArtistTrackCards(8);

        const firstClick = cruelSummerCard.click();
        await new Promise((r) => setTimeout(r, 25));
        const secondClick = antiHeroCard.click();
        await Promise.all([firstClick, secondClick]);
        await new Promise((r) => setTimeout(r, 300));

        assert.equal(artistInput.value, 'Taylor Swift - Anti-Hero');
        assert.equal(scriptModule._getState().selectedTrack.title, 'Anti-Hero');
        assert.equal(cruelSummerCard.classList.contains('active'), false);
        assert.equal(antiHeroCard.classList.contains('active'), true);
    });
});
