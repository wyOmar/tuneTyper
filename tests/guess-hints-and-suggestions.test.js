const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const elements = {};
function getOrCreateElement(id) {
    if (!elements[id]) {
        elements[id] = {
            id,
            style: {},
            className: '',
            classList: {
                add: () => {},
                remove: () => {},
                toggle: () => {}
            },
            innerHTML: '',
            textContent: '',
            value: '',
            src: '',
            alt: '',
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
    }
    return elements[id];
}

global.document = {
    getElementById: (id) => getOrCreateElement(id),
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
    renderMysteryTitle,
    updateHintsUI,
    skipGuess,
    populateCandidateSongs,
    filterAndShowSuggestions,
    isTrackBySelectedArtist,
    getSuggestionMatchRank,
    _getState,
    _setState
} = require('../public/script.js');

const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf-8');
const css = fs.readFileSync(path.join(__dirname, '..', 'public', 'styles.css'), 'utf-8');

const sampleTrack = {
    id: 2962724851,
    title: 'Don\u2019t Smile',
    duration: 206,
    preview: 'https://cdns-preview.dzcdn.net/stream/sample.mp3',
    artist: {
        id: 1176900,
        name: 'Sabrina Carpenter'
    },
    album: {
        id: 600001,
        title: "Short n' Sweet",
        cover_medium: 'https://e-cdns-images.dzcdn.net/images/cover/sample.jpg'
    }
};

test.describe('Progressive hint stages (Hints 1-5)', () => {
    test('Hint 1 (0 guesses) hides word/letter counts & spacing and shows only artist', () => {
        _setState({
            selectedTrack: sampleTrack,
            hintStage: 1,
            attemptHistory: [],
            trackExtraDetails: { release_date: '2024-08-23' }
        });

        renderMysteryTitle();
        updateHintsUI();

        const { mysteryTitle, hintBadges, hintCoverImg } = _getState();
        assert.equal(mysteryTitle.style.display, 'none', 'Mystery title pattern must be hidden on Hint 1');
        assert.equal(mysteryTitle.innerHTML, '', 'No word/letter counts should be rendered on Hint 1');
        assert.match(hintBadges.innerHTML, /Sabrina Carpenter/);
        assert.doesNotMatch(hintBadges.innerHTML, /Year:/);
        assert.doesNotMatch(hintBadges.innerHTML, /Album:/);
        assert.match(hintCoverImg.className, /blur-stage-1/);
    });

    test('Hint 2 reveals word spacing & letter counts without showing year', () => {
        _setState({
            selectedTrack: sampleTrack,
            hintStage: 1,
            attemptHistory: [],
            trackExtraDetails: { release_date: '2024-08-23' }
        });

        skipGuess(); // advances to Hint 2

        const { hintStage, mysteryTitle, hintBadges, hintCoverImg } = _getState();
        assert.equal(hintStage, 2);
        assert.equal(mysteryTitle.style.display, 'flex', 'Mystery title spacing must be visible on Hint 2');
        assert.match(mysteryTitle.innerHTML, /2 words \u2022 9 letters/);
        assert.doesNotMatch(mysteryTitle.innerHTML, /mystery-char revealed/, 'Initials should not be revealed on Hint 2');
        assert.match(hintBadges.innerHTML, /Word spacing/);
        assert.doesNotMatch(hintBadges.innerHTML, /Year:/, 'Year must not be shown on Hint 2');
        assert.doesNotMatch(hintBadges.innerHTML, /Album:/, 'Album must not be shown on Hint 2');
        assert.match(hintCoverImg.className, /blur-stage-2/);
    });

    test('Hint 3 reveals album, year, and unblurred cover art', () => {
        _setState({
            selectedTrack: sampleTrack,
            hintStage: 3,
            attemptHistory: ['wrong', 'skipped'],
            trackExtraDetails: { release_date: '2024-08-23' }
        });

        renderMysteryTitle();
        updateHintsUI();

        const { hintBadges, hintCoverImg } = _getState();
        assert.match(hintBadges.innerHTML, /Album:.*Short n&#39; Sweet/);
        assert.match(hintBadges.innerHTML, /Year:.*2024/);
        assert.match(hintCoverImg.className, /blur-stage-3/);

        const noBlurMatch = css.match(/\.blur-stage-3[\s\S]*?\{([^}]+)\}/);
        assert.ok(noBlurMatch, '.blur-stage-3 rule should exist in styles.css');
        assert.match(noBlurMatch[1], /blur\(0px\)/, 'Stage 3 cover art must have no blur');
    });

    test('Hint 4 preserves track length and word initials reveal', () => {
        _setState({
            selectedTrack: sampleTrack,
            hintStage: 4,
            attemptHistory: ['wrong', 'skipped', 'wrong'],
            trackExtraDetails: { release_date: '2024-08-23' }
        });

        renderMysteryTitle();
        updateHintsUI();

        const { mysteryTitle, hintBadges } = _getState();
        assert.match(hintBadges.innerHTML, /Length:.*3:26/);
        assert.match(hintBadges.innerHTML, /Initials revealed/);
        assert.match(mysteryTitle.innerHTML, /<span class="mystery-char revealed">D<\/span>/);
        assert.match(mysteryTitle.innerHTML, /<span class="mystery-char revealed">S<\/span>/);
    });
});

test.describe('Artist-only song dropdown suggestions', () => {
    test('populateCandidateSongs excludes tracks from other artists and matches smart apostrophes', () => {
        _setState({
            selectedTrack: sampleTrack,
            artistTracks: [
                { title: 'Espresso', artist: { id: 1176900, name: 'Sabrina Carpenter' } },
                { title: 'Please Please Please', artist: { id: 1176900, name: 'Sabrina Carpenter' } },
                { title: "Don't Smile", artist: { id: 999999, name: "Mythos 'N DJ Cosmo" } },
                { title: "Don't Smile At Me", artist: { id: 888888, name: 'SOYOU' } }
            ],
            artistCandidateCache: {}
        });

        populateCandidateSongs();
        const { candidateSongs, guessSuggestions } = _getState();

        assert.ok(candidateSongs.every(s => s.artist === 'Sabrina Carpenter'));
        assert.ok(candidateSongs.some(s => s.title === 'Espresso'));
        assert.ok(!candidateSongs.some(s => s.title === "Don't Smile At Me"));

        // Straight apostrophe and omitted apostrophe both match curly-apostrophe "Don’t Smile"
        assert.ok(getSuggestionMatchRank('Don\u2019t Smile', "don't smile") > 0);
        assert.ok(getSuggestionMatchRank('Don\u2019t Smile', 'dont smile') > 0);

        filterAndShowSuggestions("don't smile");
        assert.equal(guessSuggestions.style.display, 'block');
        assert.match(guessSuggestions.innerHTML, /Sabrina Carpenter/);
        assert.doesNotMatch(guessSuggestions.innerHTML, /Mythos/);
        assert.doesNotMatch(guessSuggestions.innerHTML, /SOYOU/);
    });

    test('fallback API search filters out unrelated artists and cover versions', async () => {
        const originalFetch = global.fetch;
        global.fetch = async () => ({
            ok: true,
            json: async () => ({
                data: [
                    { title: 'Feather', artist: { id: 1176900, name: 'Sabrina Carpenter' } },
                    { title: 'Feather (Piano Karaoke)', artist: { id: 5404994, name: 'Sing2Piano' } },
                    { title: 'Feather', artist: { id: 12345, name: 'Nujabes' } }
                ]
            })
        });

        try {
            _setState({
                selectedTrack: sampleTrack,
                candidateSongs: [],
                artistTracks: [],
                artistCandidateCache: {}
            });

            filterAndShowSuggestions('feather');
            await new Promise(resolve => setTimeout(resolve, 300));

            const { guessSuggestions } = _getState();
            assert.equal(guessSuggestions.style.display, 'block');
            assert.match(guessSuggestions.innerHTML, /Feather/);
            assert.match(guessSuggestions.innerHTML, /Sabrina Carpenter/);
            assert.doesNotMatch(guessSuggestions.innerHTML, /Sing2Piano/);
            assert.doesNotMatch(guessSuggestions.innerHTML, /Nujabes/);
            assert.equal(isTrackBySelectedArtist({ title: 'Feather', artist: { id: 12345, name: 'Nujabes' } }), false);
            assert.equal(isTrackBySelectedArtist({ title: 'Feather', artist: { id: 1176900, name: 'Sabrina Carpenter' } }), true);
        } finally {
            global.fetch = originalFetch;
        }
    });
});

test.describe('Guess UI cleanup & heading design', () => {
    test('Album Art overlay label is removed and heading uses cohesive monospace design', () => {
        assert.doesNotMatch(html, /hint-cover-label/, 'index.html should not render the Album Art overlay label');
        assert.doesNotMatch(css, /\.hint-cover-label/, 'styles.css should not keep unused .hint-cover-label rules');
        assert.match(html, /class="guess-heading-icon"/, 'Guess heading should use clean vector music icon');
        assert.doesNotMatch(html, /🎵\s*Guess the Song/, 'Old emoji heading should be replaced');

        const headingRule = css.match(/\.guess-heading\s*\{([^}]+)\}/);
        assert.ok(headingRule, '.guess-heading rule should exist');
        assert.match(headingRule[1], /font-family\s*:\s*monospace/i);
    });
});
