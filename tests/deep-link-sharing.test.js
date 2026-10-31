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
    encodeChallengeToken,
    decodeChallengeToken,
    extractRandomSection,
    generateShareText,
    resetGame,
    endGame,
    _getState,
    _setState
} = require('../public/script.js');

test.describe('Binary field-packing challenge link compressor (ha.mr model)', () => {
    test('encodeChallengeToken compresses challenge into compact URL-safe Base64', () => {
        const payload = {
            artist: 'Post Malone',
            track: 'White Iverson',
            wpm: 79,
            acc: 88,
            start: 58
        };
        const token = encodeChallengeToken(payload);
        assert.ok(typeof token === 'string' && token.length > 0);
        // Base64URL characters only (no +, /, or trailing =)
        assert.match(token, /^[A-Za-z0-9_-]+$/);

        // Verify space savings vs plain query string
        const plainLength = 'artist=Post+Malone&track=White+Iverson&wpm=79&acc=88&start=58'.length; // 61 chars
        assert.ok(token.length < plainLength, `Token length (${token.length}) should be smaller than plain query (${plainLength})`);
        assert.equal(token.length, 40); // 40 chars = 34% reduction
    });

    test('decodeChallengeToken accurately restores all fields from binary token', () => {
        const payload = {
            artist: 'Taylor Swift',
            track: 'The Fate of Ophelia',
            wpm: 91,
            acc: 90,
            start: 12
        };
        const token = encodeChallengeToken(payload);
        const decoded = decodeChallengeToken(token);
        assert.deepEqual(decoded, payload);
    });

    test('decodeChallengeToken gracefully handles unicode and complex track titles', () => {
        const payload = {
            artist: 'Beyoncé',
            track: "Don't Hurt Yourself (feat. Jack White)",
            wpm: 105,
            acc: 97,
            start: 0
        };
        const token = encodeChallengeToken(payload);
        const decoded = decodeChallengeToken(token);
        assert.deepEqual(decoded, payload);
    });
});

test.describe('Deep link challenge URL generation and parsing', () => {
    test('generateChallengeUrl builds compact ?c= URL', () => {
        const url = generateChallengeUrl('Bohemian Rhapsody', 'Queen', 85, 98, 4);
        assert.ok(url.startsWith('https://type.vincentchan.uk/?c='));
        
        const params = new URL(url).searchParams;
        assert.ok(params.has('c'));
        const token = params.get('c');
        const decoded = decodeChallengeToken(token);
        assert.equal(decoded.artist, 'Queen');
        assert.equal(decoded.track, 'Bohemian Rhapsody');
        assert.equal(decoded.wpm, 85);
        assert.equal(decoded.acc, 98);
        assert.equal(decoded.start, 4);
    });

    test('parseChallengeParams extracts payload from ?c= token', () => {
        const token = encodeChallengeToken({
            artist: 'Queen',
            track: 'Bohemian Rhapsody',
            wpm: 85,
            acc: 98,
            start: 4
        });
        const query = `?c=${token}`;
        const parsed = parseChallengeParams(query);
        assert.deepEqual(parsed, {
            artist: 'Queen',
            track: 'Bohemian Rhapsody',
            wpm: 85,
            acc: 98,
            start: 4
        });
    });

    test('parseChallengeParams also supports hash fragment #c= format', () => {
        const token = encodeChallengeToken({
            artist: 'Radiohead',
            track: 'Karma Police',
            wpm: 90,
            acc: 95,
            start: 10
        });
        const fragment = `#c=${token}`;
        const parsed = parseChallengeParams(fragment);
        assert.deepEqual(parsed, {
            artist: 'Radiohead',
            track: 'Karma Police',
            wpm: 90,
            acc: 95,
            start: 10
        });
    });

    test('parseChallengeParams maintains backwards compatibility with legacy query params', () => {
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

    test('parseChallengeParams returns null for empty or invalid queries', () => {
        assert.equal(parseChallengeParams(''), null);
        assert.equal(parseChallengeParams('?other=123'), null);
        assert.equal(parseChallengeParams('?c=invalid_token'), null);
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

        endGame();

        const state = _getState();
        assert.ok(state.finalWPM > 0);
        assert.equal(state.finalAccuracy, 98);
        assert.equal(state.isSharedGame, true);
    });
});

test.describe('Share scorecard text embeds compact challenge deep link', () => {
    test('generateShareText produces challenge link containing ?c= token', () => {
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
        assert.ok(shareText.includes('https://type.vincentchan.uk/?c='));

        // Extract token from share link and verify decoded data
        const match = shareText.match(/https:\/\/type\.vincentchan\.uk\/\?c=([A-Za-z0-9_-]+)/);
        assert.ok(match, 'Link must match token format');
        const decoded = decodeChallengeToken(match[1]);
        assert.equal(decoded.track, 'Starlight');
        assert.equal(decoded.artist, 'Muse');
        assert.equal(decoded.wpm, 92);
        assert.equal(decoded.acc, 97);
        assert.equal(decoded.start, 3);
    });
});
