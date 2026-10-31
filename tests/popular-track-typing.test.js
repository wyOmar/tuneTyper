const test = require('node:test');
const assert = require('node:assert/strict');

const elements = {};
let trackCards = [];
let scrollCalls = [];

function createMockClassList() {
    const classes = new Set();
    return {
        add: (...names) => names.forEach((n) => classes.add(n)),
        remove: (...names) => names.forEach((n) => classes.delete(n)),
        toggle: (name, force) => {
            if (force === undefined) {
                if (classes.has(name)) {
                    classes.delete(name);
                    return false;
                }
                classes.add(name);
                return true;
            }
            if (force) classes.add(name);
            else classes.delete(name);
            return Boolean(force);
        },
        contains: (name) => classes.has(name)
    };
}

function getOrCreateElement(id) {
    if (!elements[id]) {
        const listeners = {};
        elements[id] = {
            id,
            style: {},
            className: '',
            classList: createMockClassList(),
            innerHTML: '',
            textContent: '',
            value: '',
            placeholder: '',
            src: '',
            alt: '',
            checked: id === 'remove-adlibs',
            disabled: false,
            focused: false,
            focus() {
                this.focused = true;
                if (listeners.focus) {
                    listeners.focus.forEach((fn) => fn());
                }
            },
            click() {
                if (listeners.click) {
                    return Promise.all(listeners.click.map((fn) => fn({ preventDefault: () => {} })));
                }
                return Promise.resolve();
            },
            addEventListener(type, fn) {
                if (!listeners[type]) listeners[type] = [];
                listeners[type].push(fn);
            },
            getAttribute: () => null,
            querySelectorAll: () => [],
            querySelector: () => null,
            closest: () => null,
            offsetTop: 0,
            offsetHeight: 30,
            clientHeight: 200,
            scrollTop: 0,
            scrollTo: () => {},
            _listeners: listeners
        };
    }
    return elements[id];
}

function createTrackCard(artist, track) {
    const listeners = {};
    const attrs = {
        'data-artist': artist,
        'data-track': track
    };
    return {
        classList: createMockClassList(),
        getAttribute: (name) => attrs[name] || null,
        addEventListener(type, fn) {
            if (!listeners[type]) listeners[type] = [];
            listeners[type].push(fn);
        },
        click() {
            if (listeners.click) {
                return Promise.all(listeners.click.map((fn) => fn({ preventDefault: () => {} })));
            }
            return Promise.resolve();
        }
    };
}

global.document = {
    getElementById: (id) => getOrCreateElement(id),
    querySelector: (sel) => {
        if (sel === '.navbar-title') return getOrCreateElement('navbar-title');
        if (sel === '.guess-input-container') return getOrCreateElement('guess-input-container');
        return getOrCreateElement(sel);
    },
    querySelectorAll: (sel) => {
        if (sel === '.artist-track-card') return trackCards;
        if (sel === '.artist-track-card.active') {
            return trackCards.filter((c) => c.classList.contains('active'));
        }
        return [];
    },
    createElement: (tag) => ({
        tag,
        style: {},
        classList: createMockClassList(),
        setAttribute: () => {},
        appendChild: () => {},
        addEventListener: () => {},
        select: () => {},
        focus: () => {}
    }),
    body: {
        appendChild: () => {},
        removeChild: () => {},
        prepend: () => {}
    },
    addEventListener: () => {},
    execCommand: () => true
};

global.window = {
    __INITIAL_ARTIST__: { slug: 'taylor-swift', name: 'Taylor Swift' },
    location: {
        origin: 'https://type.vincentchan.uk',
        pathname: '/taylor-swift',
        search: '',
        hash: ''
    },
    scrollTo: (opts) => {
        scrollCalls.push(opts);
    },
    addEventListener: () => {}
};

global.getComputedStyle = () => ({ paddingTop: '10px' });

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

let lyricsFetchCalls = [];

global.fetch = async (url) => {
    const urlStr = String(url);
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

test('Popular tracks search-bar typing effect & Go replay behavior', async (t) => {
    await t.test('fakeTypeValue types text character-by-character into an input element', async () => {
        const mockInput = { value: 'Taylor Swift' };
        const observedFrames = [];

        const origSetTimeout = global.setTimeout;
        global.setTimeout = (fn, delay) => origSetTimeout(() => {
            observedFrames.push(mockInput.value);
            fn();
        }, Math.min(delay, 2));

        try {
            const typingPromise = scriptModule.fakeTypeValue(mockInput, 'Queen - Killer Queen', 5);
            // First character is typed immediately upon starting
            assert.equal(mockInput.value, 'Q');
            await typingPromise;
            assert.equal(mockInput.value, 'Queen - Killer Queen');
            assert.ok(observedFrames.includes('Qu'), 'Should step through progressive prefixes');
            assert.ok(observedFrames.includes('Queen - '), 'Should include intermediate typed prefix');
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
        shelf.style.display = '';

        artistInput.value = 'Taylor Swift';
        typingArea.focused = false;

        const cruelSummerCard = createTrackCard('Taylor Swift', 'Cruel Summer');
        const antiHeroCard = createTrackCard('Taylor Swift', 'Anti-Hero');
        trackCards = [cruelSummerCard, antiHeroCard];

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

        // 1. Click "Cruel Summer" on the Popular Tracks shelf
        await cruelSummerCard.click();
        // Wait briefly for the 2ms/char typing effect to finish
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

        // 2. Finish or reset and press "Go" (#start-btn) -> should replay "Cruel Summer" in song mode!
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

    await t.test('Pressing Go mid-animation snaps #artist-input to the full song query and replays that song', async () => {
        const artistInput = getOrCreateElement('artist-input');
        const startBtn = getOrCreateElement('start-btn');

        const cruelSummerCard = createTrackCard('Taylor Swift', 'Cruel Summer');
        const antiHeroCard = createTrackCard('Taylor Swift', 'Anti-Hero');
        trackCards = [cruelSummerCard, antiHeroCard];

        // Use slow typing speed (80ms/char) so clicking Go immediately catches it mid-typing
        scriptModule.bindArtistTrackCards(80);

        await antiHeroCard.click();
        // Right after click resolves, typing has only typed the first 1-2 characters
        assert.notEqual(artistInput.value, 'Taylor Swift - Anti-Hero');
        assert.ok('Taylor Swift - Anti-Hero'.startsWith(artistInput.value));

        // Clicking Go mid-animation should snap to full "Taylor Swift - Anti-Hero" and load Anti-Hero
        await startBtn.click();

        assert.equal(artistInput.value, 'Taylor Swift - Anti-Hero');
        assert.equal(scriptModule._getState().currentGameMode, 'song');
        assert.equal(scriptModule._getState().selectedTrack.title, 'Anti-Hero');
        assert.equal(antiHeroCard.classList.contains('active'), true);
    });

    await t.test('Clicking another popular track mid-animation cleanly cancels prior typing without interleaving characters', async () => {
        const artistInput = getOrCreateElement('artist-input');

        const cruelSummerCard = createTrackCard('Taylor Swift', 'Cruel Summer');
        const antiHeroCard = createTrackCard('Taylor Swift', 'Anti-Hero');
        trackCards = [cruelSummerCard, antiHeroCard];

        scriptModule.bindArtistTrackCards(8);

        // Start clicking Cruel Summer, then click Anti-Hero 15ms later mid-animation
        const firstClick = cruelSummerCard.click();
        await new Promise((r) => setTimeout(r, 15));
        const secondClick = antiHeroCard.click();
        await Promise.all([firstClick, secondClick]);
        await new Promise((r) => setTimeout(r, 300));

        assert.equal(artistInput.value, 'Taylor Swift - Anti-Hero');
        assert.equal(scriptModule._getState().selectedTrack.title, 'Anti-Hero');
        assert.equal(cruelSummerCard.classList.contains('active'), false);
        assert.equal(antiHeroCard.classList.contains('active'), true);
    });
});
