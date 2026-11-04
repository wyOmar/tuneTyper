const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { setupMockDom, createMockElement } = require('./helpers/dom');

const playlistCards = [];
const { getOrCreateElement } = setupMockDom({
    querySelectorAll: (sel) => (sel === '.playlist-card' ? playlistCards : undefined)
});

const scriptModule = require('../public/script.js');
const {
    resetGame,
    handleSongSearch,
    handleArtistSearch,
    loadCuratedPlaylist,
    loadSharedChallengeByTrackId,
    bindPlaylistCards,
    parseAndLoadUrlParameters,
    applyTrackDetailsToActiveTrack,
    playSnippet,
    stopSnippet,
    evaluateTitleGuess,
    findChallengeTrackMatch,
    getLyricsCacheKey,
    getNextSuggestionIndex,
    isShiftEnterFromOtherField,
    pickTypeableSection,
    tryFetchLyricsFromTracks,
    extractRandomSection,
    handleGuess,
    showSuggestions,
    hideSuggestions,
    _getState,
    _setState
} = scriptModule;

const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf-8');

const LATIN_LYRICS = [
    'We were dancing in the kitchen light',
    'Every little thing was going right',
    'Hold me closer while the night is young',
    'Sing it louder till the song is done',
    'Never let the morning take this away'
].join('\n');

const JAPANESE_LYRICS = [
    '夜空に浮かぶ星を数えて',
    '君の名前をそっと呼んだ',
    '遠い記憶が胸を焦がす',
    'ふたりの影が重なる夜に'
].join('\n');

function jsonResponse(body, ok = true) {
    return { ok, json: async () => body };
}

function deferred() {
    let resolve;
    let reject;
    const promise = new Promise((res, rej) => {
        resolve = res;
        reject = rej;
    });
    return { promise, resolve, reject };
}

const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));

function makeTrack(id, title, artistName, extra = {}) {
    return {
        id,
        title,
        duration: 200,
        preview: 'https://cdns-preview.dzcdn.net/stream/x.mp3?exp=9999999999',
        artist: { id: id * 10, name: artistName },
        album: { title: 'Album', cover_medium: 'https://example.com/c.jpg' },
        ...extra
    };
}

function lyricsUrlMatches(url, artist, track) {
    return url.includes('/lyrics?') &&
        url.includes(`artist=${encodeURIComponent(artist.toLowerCase())}`) &&
        url.includes(`track=${encodeURIComponent(track.toLowerCase())}`);
}

const originalFetch = global.fetch;
test.afterEach(() => {
    global.fetch = originalFetch;
});

test.describe('Song load race protection (load token)', () => {
    test('a slow earlier handleSongSearch cannot overwrite a newer song', async () => {
        const slowTrack = makeTrack(1, 'Slow Song', 'Artist A');
        const fastTrack = makeTrack(2, 'Fast Song', 'Artist B');
        const slowGate = deferred();

        global.fetch = async (url) => {
            if (url.includes('/tracks?') && url.includes(encodeURIComponent('artist a slow song'))) {
                await slowGate.promise;
                return jsonResponse({ data: [slowTrack] });
            }
            if (url.includes('/tracks?')) return jsonResponse({ data: [fastTrack] });
            if (url.includes('/lyrics?')) return jsonResponse({ lyrics: LATIN_LYRICS });
            return jsonResponse({});
        };

        _setState({ artistTracks: [], cachedSongLyrics: {} });
        resetGame();
        const first = handleSongSearch('Artist A Slow Song', 'Artist A', 'Slow Song');
        resetGame();
        const second = handleSongSearch('Artist B Fast Song', 'Artist B', 'Fast Song');
        await second;
        assert.equal(_getState().selectedTrack.title, 'Fast Song');

        slowGate.resolve();
        await first; // must resolve silently, not throw
        await tick();

        assert.equal(_getState().selectedTrack.title, 'Fast Song', 'stale load must not replace the active track');
        assert.ok(_getState().typeSection.length > 0);
    });

    test('a slow earlier artist load cannot overwrite the shelf/track after a newer song load', async () => {
        const artistGate = deferred();
        const artistTrack = makeTrack(11, 'Artist Pick', 'Slow Artist');
        const songTrack = makeTrack(12, 'Chosen Song', 'Other Artist');

        global.fetch = async (url) => {
            if (url.includes('/top-tracks?')) {
                await artistGate.promise;
                return jsonResponse({ data: [artistTrack] });
            }
            if (url.includes('/tracks?')) return jsonResponse({ data: [songTrack] });
            if (url.includes('/lyrics?')) return jsonResponse({ lyrics: LATIN_LYRICS });
            return jsonResponse({});
        };

        _setState({ artistTracks: [], previousArtist: '', cachedSongLyrics: {} });
        resetGame();
        const first = handleArtistSearch('Slow Artist', 555);
        resetGame();
        await handleSongSearch('Other Artist Chosen Song', 'Other Artist', 'Chosen Song');

        artistGate.resolve();
        await first;
        await tick();

        const state = _getState();
        assert.equal(state.selectedTrack.title, 'Chosen Song');
        assert.equal(state.currentGameMode, 'song');
        assert.notEqual(state.previousArtist, 'Slow Artist', 'stale artist fetch must not update the artist cache');
    });

    test('resetGame clears typeSection, processedWords and selectedTrack', () => {
        _setState({
            typeSection: 'old lyrics',
            processedWords: ['old', 'lyrics'],
            selectedTrack: makeTrack(3, 'Old', 'Someone')
        });
        const before = _getState().gameLoadToken;
        resetGame();
        const state = _getState();
        assert.equal(state.typeSection, '');
        assert.deepEqual(state.processedWords, []);
        assert.equal(state.selectedTrack, null);
        assert.ok(state.gameLoadToken > before, 'resetGame must invalidate in-flight loads');
    });
});

test.describe('Playlist load failures after a played song', () => {
    test('loadCuratedPlaylist shows the failure message and rejects when no track has lyrics', async () => {
        global.fetch = async (url) => {
            if (url.includes('/default?')) {
                return jsonResponse({ tracks: { data: [makeTrack(21, 'Nope', 'Nobody'), makeTrack(22, 'Nada', 'Nobody')] } });
            }
            if (url.includes('/lyrics?')) return jsonResponse({}, false);
            return jsonResponse({});
        };

        // Simulate a previously played song
        _setState({ typeSection: 'previous song lyrics', selectedTrack: makeTrack(20, 'Played', 'Before') });
        resetGame();

        await assert.rejects(() => loadCuratedPlaylist('999'), /No lyrics available/);
        const displayText = getOrCreateElement('display-text');
        assert.match(displayText.innerHTML, /Failed to load lyrics/);
        assert.doesNotMatch(displayText.innerHTML, /Loading song/);
    });

    test('playlist card click surfaces the failure as a toast', async () => {
        global.fetch = async (url) => {
            if (url.includes('/default?')) return jsonResponse({ tracks: { data: [] } });
            return jsonResponse({});
        };

        const card = createMockElement('playlist-card-test');
        card.setAttribute('data-playlist-id', '424242');
        card.classList.add('playlist-card');
        playlistCards.length = 0;
        playlistCards.push(card);
        bindPlaylistCards();

        await card.click();

        const container = getOrCreateElement('toast-container');
        const toast = container.children[container.children.length - 1];
        assert.ok(toast, 'a toast should be rendered');
        const message = toast.children.find((c) => c.className === 'toast-message');
        assert.match(message.textContent, /No tracks found/);
    });

    test('loadCuratedPlaylist skips malformed and non-Latin tracks', async () => {
        const good = makeTrack(31, 'Good One', 'Latin Artist');
        const jp = makeTrack(32, '夜空', 'JP Artist', { lyrics: JAPANESE_LYRICS });
        global.fetch = async (url) => {
            if (url.includes('/default?')) {
                return jsonResponse({ tracks: { data: [null, { title: 'No Artist' }, jp, good] } });
            }
            if (url.includes('/lyrics?')) return jsonResponse({ lyrics: LATIN_LYRICS });
            return jsonResponse({});
        };

        resetGame();
        await loadCuratedPlaylist('31337');
        assert.equal(_getState().selectedTrack.title, 'Good One');
        assert.ok(_getState().processedWords.length > 0);
    });
});

test.describe('Stale track details', () => {
    test('applyTrackDetailsToActiveTrack ignores details for a different track', () => {
        _setState({ selectedTrack: makeTrack(41, 'Current', 'Artist'), trackExtraDetails: null });
        applyTrackDetailsToActiveTrack(999, { release_date: '1999-01-01', preview: 'https://stale.example/p.mp3' });
        assert.equal(_getState().trackExtraDetails, null);
        assert.notEqual(_getState().selectedTrack.preview, 'https://stale.example/p.mp3');

        applyTrackDetailsToActiveTrack(41, { release_date: '2024-05-05' });
        assert.equal(_getState().trackExtraDetails.release_date, '2024-05-05');
    });
});

test.describe('Snippet playback lifecycle', () => {
    test('stopSnippet before play() resolves leaves no progress interval running', async () => {
        const playGate = deferred();
        const originalAudio = global.Audio;
        const originalSetInterval = global.setInterval;
        let intervalsCreated = 0;
        global.setInterval = (fn, ms) => {
            if (ms === 50) intervalsCreated++;
            return originalSetInterval(fn, ms);
        };
        global.Audio = class {
            constructor() { this.paused = true; this.currentTime = 0; }
            play() { this.paused = false; return playGate.promise; }
            pause() { this.paused = true; }
            addEventListener() {}
        };

        try {
            _setState({ selectedTrack: makeTrack(51, 'Snip', 'Artist'), hintStage: 1 });
            await playSnippet();
            assert.equal(_getState().isSnippetPlaying, true);
            stopSnippet();
            playGate.resolve();
            await tick();
            assert.equal(intervalsCreated, 0, 'no interval should start for a stopped snippet');
            assert.equal(_getState().isSnippetPlaying, false);
        } finally {
            global.Audio = originalAudio;
            global.setInterval = originalSetInterval;
            stopSnippet();
        }
    });

    test('a second click while the preview URL is refreshing does not create a second Audio', async () => {
        const detailsGate = deferred();
        const originalAudio = global.Audio;
        let audioCount = 0;
        global.Audio = class {
            constructor() { audioCount++; this.paused = true; this.currentTime = 0; }
            play() { this.paused = false; return Promise.resolve(); }
            pause() { this.paused = true; }
            addEventListener() {}
        };
        global.fetch = async (url) => {
            if (url.includes('/track-details?')) {
                await detailsGate.promise;
                return jsonResponse({ id: 52, preview: 'https://cdns-preview.dzcdn.net/stream/fresh.mp3?exp=9999999999' });
            }
            return jsonResponse({});
        };

        try {
            _setState({
                selectedTrack: makeTrack(52, 'Stale Preview', 'Artist', { preview: 'https://cdns-preview.dzcdn.net/stream/old.mp3?exp=1' }),
                hintStage: 1
            });
            const firstClick = playSnippet();
            const secondClick = playSnippet();
            detailsGate.resolve();
            await Promise.all([firstClick, secondClick]);
            await tick();
            assert.ok(audioCount <= 1, `expected at most one Audio, got ${audioCount}`);

            // A subsequent click starts playback exactly once
            stopSnippet();
            audioCount = 0;
            await playSnippet();
            assert.equal(audioCount, 1);
            assert.equal(_getState().isSnippetPlaying, true);
        } finally {
            stopSnippet();
            global.Audio = originalAudio;
        }
    });
});

test.describe('Non-Latin lyrics handling', () => {
    test('pickTypeableSection rejects lyrics with nothing typeable', () => {
        assert.equal(pickTypeableSection(JAPANESE_LYRICS), null);
        assert.ok(pickTypeableSection(LATIN_LYRICS));
    });

    test('handleSongSearch throws a clear error instead of starting an unwinnable game', async () => {
        const jpTrack = makeTrack(61, '夜空', 'JP Artist');
        global.fetch = async (url) => {
            if (url.includes('/tracks?')) return jsonResponse({ data: [jpTrack] });
            if (url.includes('/lyrics?')) return jsonResponse({ lyrics: JAPANESE_LYRICS });
            return jsonResponse({});
        };
        _setState({ artistTracks: [], cachedSongLyrics: {} });
        resetGame();
        await assert.rejects(() => handleSongSearch('jp artist yozora'), /can't be typed/);
        assert.equal(_getState().selectedTrack, null);
    });

    test('tryFetchLyricsFromTracks skips non-Latin and malformed tracks', async () => {
        const jp = makeTrack(62, '夜空', 'JP Artist');
        const en = makeTrack(63, 'English Song', 'EN Artist');
        global.fetch = async (url) => {
            if (lyricsUrlMatches(url, 'JP Artist', '夜空')) return jsonResponse({ lyrics: JAPANESE_LYRICS });
            if (url.includes('/lyrics?')) return jsonResponse({ lyrics: LATIN_LYRICS });
            return jsonResponse({});
        };
        resetGame();
        const loaded = await tryFetchLyricsFromTracks([jp, null, { title: 'x' }, en]);
        assert.equal(loaded, true);
        assert.equal(_getState().selectedTrack.title, 'English Song');
    });
});

test.describe('Guess evaluation', () => {
    test('normal titles match ignoring case and punctuation', () => {
        assert.equal(evaluateTitleGuess("dont smile", 'Don’t Smile'), true);
        assert.equal(evaluateTitleGuess('Espresso', 'Espresso (Remix)'), true);
        assert.equal(evaluateTitleGuess('Feather', 'Espresso'), false);
    });

    test('punctuation-only guesses are rejected (null) instead of matching', () => {
        assert.equal(evaluateTitleGuess('!!!', 'Espresso'), null);
        assert.equal(evaluateTitleGuess('???', '夜に駆ける'), null);
    });

    test('all non-ASCII titles fall back to a Unicode comparison', () => {
        assert.equal(evaluateTitleGuess('夜に駆ける', '夜に駆ける'), true);
        assert.equal(evaluateTitleGuess('夜に 駆ける!', '夜に駆ける'), true);
        assert.equal(evaluateTitleGuess('アイドル', '夜に駆ける'), false);
        assert.equal(evaluateTitleGuess('abc', '夜に駆ける'), false);
    });

    test('handleGuess does not consume an attempt for a punctuation-only guess', () => {
        const guessInput = getOrCreateElement('guess-input');
        _setState({ selectedTrack: makeTrack(71, 'Espresso', 'Sabrina Carpenter'), hintStage: 1, attemptHistory: [], guessCount: 0 });
        guessInput.value = '!!!';
        handleGuess();
        assert.equal(_getState().guessCount, 0);
        assert.deepEqual(_getState().attemptHistory, []);
    });
});

test.describe('Legacy challenge track matching', () => {
    const results = [
        makeTrack(81, 'Hello (Cover)', 'Karaoke Kings'),
        makeTrack(82, 'Someone Like You', 'Adele'),
        makeTrack(83, 'Hello', 'Adele')
    ];

    test('requires both title and artist to match when available', () => {
        assert.equal(findChallengeTrackMatch(results, 'Adele', 'Hello').id, 83);
    });

    test('falls back to title-only match, then the first result', () => {
        assert.equal(findChallengeTrackMatch(results, 'Unknown Artist', 'Someone Like You').id, 82);
        assert.equal(findChallengeTrackMatch(results, 'Unknown Artist', 'No Such Song').id, 81);
        assert.equal(findChallengeTrackMatch(results, null, 'Someone Like You').id, 82);
    });
});

test.describe('Keyboard handling', () => {
    test('Shift+Enter shortcut ignores events from other inputs', () => {
        const typingArea = getOrCreateElement('typing-area');
        assert.equal(isShiftEnterFromOtherField({ target: { tagName: 'INPUT' } }), true);
        assert.equal(isShiftEnterFromOtherField({ target: { tagName: 'TEXTAREA' } }), true);
        assert.equal(isShiftEnterFromOtherField({ target: typingArea }), false);
        assert.equal(isShiftEnterFromOtherField({ target: { tagName: 'BODY' } }), false);
        assert.equal(isShiftEnterFromOtherField({}), false);
    });

    test('guess Enter handler stops propagation', () => {
        const guessInput = getOrCreateElement('guess-input');
        _setState({ selectedTrack: makeTrack(91, 'Espresso', 'Sabrina Carpenter'), hintStage: 1, attemptHistory: [], guessCount: 0 });
        guessInput.value = 'wrong guess';
        let stopped = false;
        guessInput.dispatchEvent({
            type: 'keydown',
            key: 'Enter',
            shiftKey: true,
            preventDefault() {},
            stopPropagation() { stopped = true; }
        });
        assert.equal(stopped, true);
    });

    test('ArrowUp from no selection lands on the last suggestion', () => {
        assert.equal(getNextSuggestionIndex(-1, 4, -1), 3);
        assert.equal(getNextSuggestionIndex(0, 4, -1), 3);
        assert.equal(getNextSuggestionIndex(2, 4, -1), 1);
        assert.equal(getNextSuggestionIndex(-1, 4, 1), 0);
        assert.equal(getNextSuggestionIndex(3, 4, 1), 0);
        assert.equal(getNextSuggestionIndex(-1, 0, 1), -1);
    });
});

test.describe('?artist= deep link failure', () => {
    test('a failing artist lookup resolves false with a toast instead of hanging', async () => {
        global.fetch = async (url) => {
            if (url.includes('/tracks?')) return jsonResponse({ data: [] });
            return jsonResponse({});
        };
        const prevLocation = global.window.location;
        global.window.location = { origin: 'https://type.vincentchan.uk', pathname: '/', search: '?artist=Nobody%20Real', hash: '' };
        _setState({ previousArtist: '', artistTracks: [] });
        try {
            const loaded = await parseAndLoadUrlParameters();
            assert.equal(loaded, false);
            const container = getOrCreateElement('toast-container');
            const toast = container.children[container.children.length - 1];
            const message = toast.children.find((c) => c.className === 'toast-message');
            assert.match(message.textContent, /Artist not found/);
        } finally {
            global.window.location = prevLocation;
        }
    });

    test('malformed /tracks results raise "Artist not found" rather than a TypeError', async () => {
        global.fetch = async (url) => {
            if (url.includes('/tracks?')) return jsonResponse({ data: [{ title: 'no artist field' }] });
            return jsonResponse({});
        };
        _setState({ previousArtist: '', artistTracks: [] });
        await assert.rejects(() => handleArtistSearch('Weird Data'), /Artist not found/);

        global.fetch = async () => jsonResponse({});
        await assert.rejects(() => handleArtistSearch('Missing Data'), /Artist not found/);
    });
});

test.describe('extractRandomSection fallback', () => {
    test('fallback cuts on a word boundary instead of mid-word', () => {
        const longLine = Array.from({ length: 60 }, (_, i) => `word${i}`).join(' ');
        const lyrics = `${longLine}\nend`;
        const originalRandom = Math.random;
        Math.random = () => 0.99; // always start on the short last line so every attempt fails
        try {
            const section = extractRandomSection(lyrics);
            assert.ok(section.length <= 300);
            assert.ok(section.length > 0);
            const lastToken = section.split(/\s+/).pop();
            assert.match(lastToken, /^word\d+$/);
            assert.ok(longLine.split(' ').includes(lastToken), `"${lastToken}" must be a whole word`);
            assert.equal(_getState().currentStartIndex, 0);
        } finally {
            Math.random = originalRandom;
        }
    });
});

test.describe('Unified lyrics cache', () => {
    test('challenge loads and song search share one key/value shape', async () => {
        const track = makeTrack(101, 'Shared Song', 'Shared Artist');
        let lyricsFetches = 0;
        global.fetch = async (url) => {
            if (url.includes('/track-details?')) return jsonResponse(track);
            if (url.includes('/lyrics?')) {
                lyricsFetches++;
                return jsonResponse({ lyrics: LATIN_LYRICS });
            }
            return jsonResponse({ data: [] });
        };

        _setState({ cachedSongLyrics: {}, artistTracks: [] });
        await loadSharedChallengeByTrackId(101, 0);
        const cache = _getState().cachedSongLyrics;
        const key = getLyricsCacheKey('Shared Artist', 'Shared Song');
        assert.equal(key, 'shared artist - shared song');
        assert.equal(cache[key].lyrics, LATIN_LYRICS);
        assert.equal(cache[key].track.id, 101);
        assert.equal(lyricsFetches, 1);

        resetGame();
        await handleSongSearch('Shared Artist Shared Song', 'Shared Artist', 'Shared Song');
        assert.equal(lyricsFetches, 1, 'song search should reuse the cached challenge lyrics');
        assert.equal(_getState().selectedTrack.id, 101);
    });
});

test.describe('Accessibility attributes', () => {
    test('index.html labels inputs and wires the guess combobox', () => {
        assert.match(html, /id="artist-input"[^>]*aria-label="[^"]+"/);
        assert.match(html, /id="typing-area"[\s\S]*?aria-label="[^"]+"[\s\S]*?>/);
        const guessTag = html.match(/<input[^>]*id="guess-input"[^>]*>/);
        assert.ok(guessTag);
        assert.match(guessTag[0], /aria-label="[^"]+"/);
        assert.match(guessTag[0], /role="combobox"/);
        assert.match(guessTag[0], /aria-controls="guess-suggestions"/);
        assert.match(guessTag[0], /aria-expanded="false"/);
        assert.match(html, /<ul id="guess-suggestions"[^>]*role="listbox"/);
    });

    test('showSuggestions/hideSuggestions toggle aria-expanded and arrows set aria-activedescendant', () => {
        const guessInput = getOrCreateElement('guess-input');
        const guessSuggestions = getOrCreateElement('guess-suggestions');
        const list = [{ title: 'One', artist: 'A' }, { title: 'Two', artist: 'A' }, { title: 'Three', artist: 'A' }];

        showSuggestions(list);
        assert.equal(guessInput.getAttribute('aria-expanded'), 'true');
        assert.match(guessSuggestions.innerHTML, /role="option"/);
        assert.match(guessSuggestions.innerHTML, /id="guess-suggestion-0"/);

        // Mock DOM doesn't parse innerHTML: attach option elements manually
        list.forEach((item, idx) => {
            const li = createMockElement(`guess-suggestion-${idx}`);
            li.classList.add('guess-suggestion-item');
            li.setAttribute('data-title', item.title);
            guessSuggestions.appendChild(li);
        });

        guessInput.dispatchEvent({ type: 'keydown', key: 'ArrowUp', preventDefault() {} });
        assert.equal(guessInput.value, 'Three', 'ArrowUp from no selection selects the last item');
        assert.equal(guessInput.getAttribute('aria-activedescendant'), 'guess-suggestion-2');
        assert.equal(guessSuggestions.children[2].getAttribute('aria-selected'), 'true');

        hideSuggestions();
        guessSuggestions.children.length = 0;
        assert.equal(guessInput.getAttribute('aria-expanded'), 'false');
        assert.equal(guessInput.getAttribute('aria-activedescendant'), null);
    });
});
