const test = require('node:test');
const assert = require('node:assert/strict');

// Mock a lightweight browser-like DOM environment before requiring script.js
global.document = {
    getElementById: (id) => {
        return {
            id,
            style: {},
            classList: { add: () => {}, remove: () => {}, toggle: () => {} },
            innerHTML: '',
            textContent: '',
            value: '',
            disabled: false,
            focus: () => {},
            addEventListener: () => {},
            querySelectorAll: () => [],
            querySelector: () => null,
            offsetTop: 0,
            offsetHeight: 30,
            clientHeight: 200,
            scrollTo: () => {}
        };
    },
    querySelector: () => ({ textContent: '', classList: { remove: () => {}, add: () => {} } }),
    querySelectorAll: () => [],
    createElement: (tag) => ({
        tag,
        style: {},
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
    location: {
        origin: 'https://type.vincentchan.uk',
        pathname: '/',
        search: ''
    },
    addEventListener: () => {}
};

global.Audio = class {
    constructor() {
        this.currentTime = 0;
        this.volume = 1;
        this.paused = true;
    }
    play() { return Promise.resolve(); }
    pause() {}
    addEventListener() {}
};

const {
    generateChallengeUrl,
    parseChallengeParams,
    extractRandomSection,
    generateShareText,
    resetGame,
    endGame,
    _getState,
    _setState
} = require('../public/script.js');

test.describe('Deep link challenge URL generation and parsing', () => {
    test('generateChallengeUrl builds proper challenge URL with encoded params', () => {
        const url = generateChallengeUrl('Bohemian Rhapsody', 'Queen', 85, 98, 4);
        assert.ok(url.startsWith('https://type.vincentchan.uk/?'));
        
        const params = new URL(url).searchParams;
        assert.equal(params.get('artist'), 'Queen');
        assert.equal(params.get('track'), 'Bohemian Rhapsody');
        assert.equal(params.get('wpm'), '85');
        assert.equal(params.get('acc'), '98');
        assert.equal(params.get('start'), '4');
    });

    test('generateChallengeUrl safely omits missing optional metrics', () => {
        const url = generateChallengeUrl('Creep', 'Radiohead', null, null, null);
        const params = new URL(url).searchParams;
        assert.equal(params.get('artist'), 'Radiohead');
        assert.equal(params.get('track'), 'Creep');
        assert.equal(params.has('wpm'), false);
        assert.equal(params.has('acc'), false);
        assert.equal(params.has('start'), false);
    });

    test('parseChallengeParams extracts artist, track, wpm, acc, and start correctly', () => {
        const query = '?artist=Taylor%20Swift&track=Cruel%20Summer&wpm=102&acc=99&start=6';
        const parsed = parseChallengeParams(query);
        assert.deepEqual(parsed, {
            artist: 'Taylor Swift',
            track: 'Cruel Summer',
            wpm: 102,
            acc: 99,
            start: 6
        });
    });

    test('parseChallengeParams returns null for empty or irrelevant queries', () => {
        assert.equal(parseChallengeParams(''), null);
        assert.equal(parseChallengeParams('?other=123'), null);
        assert.equal(parseChallengeParams(null), null);
    });
});

test.describe('Deterministic lyric snippet extraction for challenges', () => {
    const sampleLyrics = [
        "Is this the real life? Is this just fantasy?",
        "Caught in a landslide, no escape from reality",
        "Open your eyes, look up to the skies and see",
        "I'm just a poor boy, I need no sympathy",
        "Because I'm easy come, easy go, little high, little low",
        "Any way the wind blows doesn't really matter to me, to me",
        "Mama, just killed a man, put a gun against his head",
        "Pulled my trigger, now he's dead",
        "Mama, life had just begun",
        "But now I've gone and thrown it all away"
    ].join('\n');

    test('extractRandomSection with targetStartIndex yields the exact same snippet repeatedly', () => {
        const snippet1 = extractRandomSection(sampleLyrics, 120, 250, 2);
        const state1 = _getState();
        const snippet2 = extractRandomSection(sampleLyrics, 120, 250, 2);
        const state2 = _getState();

        assert.equal(snippet1, snippet2);
        assert.equal(state1.currentStartIndex, 2);
        assert.equal(state2.currentStartIndex, 2);
        assert.ok(snippet1.startsWith('Open your eyes'));
    });

    test('extractRandomSection falls back safely if targetStartIndex is out of range', () => {
        const snippet = extractRandomSection(sampleLyrics, 120, 250, 999);
        assert.ok(snippet.length > 0);
    });
});

test.describe('Bypassing guess the song game on shared challenges', () => {
    test('endGame does not launch guessing phase when game is shared', () => {
        resetGame(false);
        _setState({
            isSharedGame: true,
            totalKeystrokes: 100,
            errorKeystrokes: 2,
            processedWords: ['hello', 'world'],
            currentWordIndex: 2,
            startTime: new Date(Date.now() - 30000),
            selectedTrack: {
                title: 'Karma Police',
                artist: { name: 'Radiohead' },
                album: { title: 'OK Computer', cover_medium: 'https://example.com/cover.jpg' },
                preview: 'https://example.com/audio.mp3'
            }
        });

        // Trigger endGame
        endGame();

        const state = _getState();
        assert.ok(state.finalWPM > 0);
        assert.equal(state.finalAccuracy, 98);
        assert.equal(state.isSharedGame, true);
    });
});

test.describe('Share scorecard text embeds challenge deep link', () => {
    test('generateShareText produces challenge link containing track, artist, and score', () => {
        _setState({
            isSharedGame: false,
            selectedTrack: {
                title: 'Starlight',
                artist: { name: 'Muse' },
                album: { title: 'Black Holes', cover_medium: 'https://example.com/art.jpg' }
            },
            finalWPM: 92,
            finalAccuracy: 97,
            currentStartIndex: 3,
            attemptHistory: ['correct']
        });

        const shareText = generateShareText();
        assert.ok(shareText.includes('🎵 TuneTyper'));
        assert.ok(shareText.includes('🎤 "Starlight" — Muse'));
        assert.ok(shareText.includes('⚡ 92 WPM | 97% Acc'));
        assert.ok(shareText.includes('https://type.vincentchan.uk/?'));
        assert.ok(shareText.includes('track=Starlight'));
        assert.ok(shareText.includes('artist=Muse'));
        assert.ok(shareText.includes('wpm=92'));
        assert.ok(shareText.includes('acc=97'));
        assert.ok(shareText.includes('start=3'));
    });
});
