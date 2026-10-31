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
    test('encodeChallengeToken compresses challenge into compact URL-safe Base64 with conditions flags', () => {
        const payload = {
            artist: 'Post Malone',
            track: 'White Iverson',
            wpm: 79,
            acc: 88,
            start: 58,
            punc: true,
            num: false,
            adlib: true
        };
        const token = encodeChallengeToken(payload);
        assert.ok(typeof token === 'string' && token.length > 0);
        // Base64URL characters only (no +, /, or trailing =)
        assert.match(token, /^[A-Za-z0-9_-]+$/);

        // Verify space savings vs plain query string
        const plainLength = 'artist=Post+Malone&track=White+Iverson&wpm=79&acc=88&start=58&punc=1&num=0&adlib=1'.length; // 83 chars
        assert.ok(token.length < plainLength, `Token length (${token.length}) should be smaller than plain query (${plainLength})`);
        assert.equal(token.length, 42); // 42 chars = ~49% reduction
    });

    test('decodeChallengeToken accurately restores all fields and conditions from binary token', () => {
        const payload = {
            artist: 'Taylor Swift',
            track: 'The Fate of Ophelia',
            wpm: 91,
            acc: 90,
            start: 12,
            punc: true,
            num: true,
            adlib: false
        };
        const token = encodeChallengeToken(payload);
        const decoded = decodeChallengeToken(token);
        assert.deepEqual(decoded, payload);
    });

    test('decodeChallengeToken accurately decodes legacy v1 tokens without conditions', () => {
        // User's actual shared token from Sabrina Carpenter - opposite
        const legacyToken = 'AFdUABYRU2FicmluYSBDYXJwZW50ZXJvcHBvc2l0ZQ';
        const decoded = decodeChallengeToken(legacyToken);
        assert.deepEqual(decoded, {
            artist: 'Sabrina Carpenter',
            track: 'opposite',
            wpm: 87,
            acc: 84,
            start: 22,
            punc: false,
            num: false,
            adlib: true
        });
    });

    test('decodeChallengeToken gracefully handles unicode and complex track titles', () => {
        const payload = {
            artist: 'Beyoncé',
            track: "Don't Hurt Yourself (feat. Jack White)",
            wpm: 105,
            acc: 97,
            start: 0,
            punc: false,
            num: false,
            adlib: true
        };
        const token = encodeChallengeToken(payload);
        const decoded = decodeChallengeToken(token);
        assert.deepEqual(decoded, payload);
    });
});

test.describe('Deep link challenge URL generation and parsing', () => {
    test('generateChallengeUrl builds compact ?c= URL', () => {
        const url = generateChallengeUrl('Bohemian Rhapsody', 'Queen', 85, 98, 4, { punc: true, num: false, adlib: true });
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
        assert.equal(decoded.punc, true);
        assert.equal(decoded.num, false);
        assert.equal(decoded.adlib, true);
    });

    test('parseChallengeParams extracts payload from ?c= token', () => {
        const token = encodeChallengeToken({
            artist: 'Queen',
            track: 'Bohemian Rhapsody',
            wpm: 85,
            acc: 98,
            start: 4,
            punc: true,
            num: false,
            adlib: true
        });
        const query = `?c=${token}`;
        const parsed = parseChallengeParams(query);
        assert.deepEqual(parsed, {
            artist: 'Queen',
            track: 'Bohemian Rhapsody',
            wpm: 85,
            acc: 98,
            start: 4,
            punc: true,
            num: false,
            adlib: true
        });
    });

    test('parseChallengeParams also supports hash fragment #c= format', () => {
        const token = encodeChallengeToken({
            artist: 'Radiohead',
            track: 'Karma Police',
            wpm: 90,
            acc: 95,
            start: 10,
            punc: false,
            num: true,
            adlib: false
        });
        const fragment = `#c=${token}`;
        const parsed = parseChallengeParams(fragment);
        assert.deepEqual(parsed, {
            artist: 'Radiohead',
            track: 'Karma Police',
            wpm: 90,
            acc: 95,
            start: 10,
            punc: false,
            num: true,
            adlib: false
        });
    });

    test('parseChallengeParams maintains backwards compatibility with legacy query params', () => {
        const query = '?artist=Taylor%20Swift&track=Cruel%20Summer&wpm=102&acc=99&start=6&punc=1&num=0&adlib=1';
        const parsed = parseChallengeParams(query);
        assert.deepEqual(parsed, {
            artist: 'Taylor Swift',
            track: 'Cruel Summer',
            wpm: 102,
            acc: 99,
            start: 6,
            punc: true,
            num: false,
            adlib: true
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
    test('generateShareText produces challenge link containing ?c= token with no green boxes on shared games', () => {
        _setState({
            isSharedGame: true,
            selectedTrack: {
                title: 'opposite',
                artist: { name: 'Sabrina Carpenter' },
                album: { title: 'emails i cant send', cover_medium: 'https://example.com/art.jpg' }
            },
            finalWPM: 87,
            finalAccuracy: 84,
            currentStartIndex: 22,
            attemptHistory: []
        });

        const shareText = generateShareText();
        assert.ok(shareText.includes('🎵 TuneTyper'));
        assert.ok(shareText.includes('🎤 "opposite" — Sabrina Carpenter'));
        assert.ok(shareText.includes('⚡ 87 WPM | 84% Acc'));
        assert.ok(shareText.includes('⚡ Direct Song Practice'));
        assert.ok(shareText.includes('Beat my score: https://type.vincentchan.uk/?c='));
        // Verify NO green boxes appear since no guessing occurred
        assert.ok(!shareText.includes('🟩'), 'Shared game scorecard must not contain green emoji boxes');
    });

    test('generateShareText includes emoji grid when song guessing actually happened', () => {
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
        assert.ok(shareText.includes('🎯 Guessed in 1 try!'));
        assert.ok(shareText.includes('🟩'), 'Guessed game scorecard must include emoji boxes');
        assert.ok(shareText.includes('https://type.vincentchan.uk/?c='));
    });
});

test.describe('Synchronizing typing conditions for shared games', () => {
    test('loadSharedChallenge sets checkboxes and disables them for comparable conditions', async () => {
        global.fetch = async (url) => {
            if (url.includes('/tracks')) {
                return {
                    ok: true,
                    json: async () => ({
                        data: [{
                            title: 'opposite',
                            artist: { name: 'Sabrina Carpenter' },
                            album: { title: 'emails i cant send' }
                        }]
                    })
                };
            }
            if (url.includes('/lyrics')) {
                return {
                    ok: true,
                    json: async () => ({ lyrics: 'We were opposite in every single way' })
                };
            }
            return { ok: false };
        };

        const { loadSharedChallenge } = require('../public/script.js');
        await loadSharedChallenge('Sabrina Carpenter', 'opposite', 0, {
            punc: true,
            num: true,
            adlib: false
        });

        const state = _getState();
        assert.equal(state.isSharedGame, true);
        assert.equal(state.removePunctuationCheckbox.checked, true);
        assert.equal(state.includeNumbersCheckbox.checked, true);
        assert.equal(state.removeAdlibsCheckbox.checked, false);
        assert.equal(state.removePunctuationCheckbox.disabled, true);
        assert.equal(state.includeNumbersCheckbox.disabled, true);
        assert.equal(state.removeAdlibsCheckbox.disabled, true);
    });
});
