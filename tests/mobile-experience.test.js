const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

let coarsePointerMatches = false;
const { setupMockDom } = require('./helpers/dom');
const { elements: mockElements, getOrCreateElement: getOrCreateMockElement } = setupMockDom({
    window: {
        matchMedia: (query) => ({
            matches: query === '(pointer: coarse)' ? coarsePointerMatches : false
        })
    }
});

const script = require('../public/script.js');
const {
    calculateAccuracy,
    handleTypingInput,
    resetGame,
    showFinalInfo,
    isMobileInputMode,
    sanitizeRawTypingValue,
    adaptTypedCaseForMobile,
    syncArtistClearButton,
    _getState,
    _setState
} = script;

const indexHtml = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
const stylesCss = fs.readFileSync(path.join(__dirname, '..', 'public', 'styles.css'), 'utf8');

test('HTML mobile keyboard attributes & anti-autofill configuration', async (t) => {
    await t.test('viewport meta enables viewport-fit=cover for mobile notches and home indicators', () => {
        const viewportMatch = indexHtml.match(/<meta\s+name=["']viewport["'][^>]*>/i);
        assert.ok(viewportMatch, 'viewport meta tag should exist');
        assert.match(viewportMatch[0], /viewport-fit=cover/i);
    });

    await t.test('#typing-area is a single-line input with auto-cap, autocorrect, spellcheck & autofill disabled', () => {
        assert.doesNotMatch(indexHtml, /<textarea[^>]*id=["']typing-area["']/i, '#typing-area should not be a multi-line textarea');
        const typingInputMatch = indexHtml.match(/<input[^>]*id=["']typing-area["'][^>]*>/i);
        assert.ok(typingInputMatch, '#typing-area <input> should exist');
        const tag = typingInputMatch[0];
        assert.match(tag, /type=["']text["']/i);
        assert.match(tag, /autocapitalize=["']none["']/i);
        assert.match(tag, /autocorrect=["']off["']/i);
        assert.match(tag, /autocomplete=["']off["']/i);
        assert.match(tag, /spellcheck=["']false["']/i);
        assert.match(tag, /enterkeyhint=["']done["']/i);
    });

    await t.test('search omnibox and guess input include mobile keyboard attributes and clear button', () => {
        const artistMatch = indexHtml.match(/<input\s+type=["']text["']\s+id=["']artist-input["'][^>]*>/i);
        assert.ok(artistMatch, '#artist-input should preserve SSR regex prefix');
        assert.match(artistMatch[0], /autocorrect=["']off["']/i);
        assert.match(artistMatch[0], /spellcheck=["']false["']/i);
        assert.match(indexHtml, /id=["']artist-clear-btn["']/i);

        const guessMatch = indexHtml.match(/<input[^>]*id=["']guess-input["'][^>]*>/i);
        assert.ok(guessMatch, '#guess-input should exist');
        assert.match(guessMatch[0], /autocapitalize=["']none["']/i);
        assert.match(guessMatch[0], /autocorrect=["']off["']/i);
        assert.match(guessMatch[0], /spellcheck=["']false["']/i);
    });

    await t.test('config-bar uses compact () ad-libs token so mobile labels never split mid-parenthesis', () => {
        assert.match(indexHtml, /<span class=["']config-icon["'][^>]*>\(\)<\/span>ad-libs/);
    });
});

test('Mobile virtual keyboard input normalization & auto-capitalization handling', async (t) => {
    const typingArea = getOrCreateMockElement('typing-area');
    const puncCheckbox = getOrCreateMockElement('remove-punctuation');

    await t.test('isMobileInputMode detects coarse pointer and mobile user agents, or honors override', () => {
        _setState({ mobileInputOverride: null });
        coarsePointerMatches = false;
        Object.defineProperty(global.navigator, 'userAgent', {
            value: 'Mozilla/5.0 (X11; Linux x86_64)',
            configurable: true,
            writable: true
        });
        assert.equal(isMobileInputMode(), false);

        coarsePointerMatches = true;
        assert.equal(isMobileInputMode(), true);

        coarsePointerMatches = false;
        Object.defineProperty(global.navigator, 'userAgent', {
            value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X)',
            configurable: true,
            writable: true
        });
        assert.equal(isMobileInputMode(), true);

        Object.defineProperty(global.navigator, 'userAgent', {
            value: 'Mozilla/5.0 (X11; Linux x86_64)',
            configurable: true,
            writable: true
        });
        assert.equal(isMobileInputMode(), false);
    });

    await t.test('mobile sentence auto-capitalization after word reset advances cleanly with 100% accuracy', () => {
        resetGame();
        puncCheckbox.checked = false;
        const words = ['move', 'right', 'out', 'my', 'way'];
        _setState({
            mobileInputOverride: true,
            processedWords: words,
            currentWordIndex: 0,
            startTime: new Date(Date.now() - 8000),
            currentGameMode: 'song',
            isSharedGame: true
        });

        // Simulate iOS/Android capitalizing the first letter of every word after typingArea.value = ''
        const mobileAutoCappedInputs = ['Move ', 'Right ', 'Out ', 'My ', 'Way'];
        for (const wordSeq of mobileAutoCappedInputs) {
            typingArea.value = '';
            for (const ch of wordSeq) {
                typingArea.value += ch;
                handleTypingInput();
            }
        }

        const state = _getState();
        assert.equal(state.currentWordIndex, words.length, 'all words should complete');
        assert.equal(state.errorKeystrokes, 0, 'OS auto-capitalization should not count as errors on mobile');
        assert.equal(calculateAccuracy(), 100);
        _setState({ mobileInputOverride: null });
    });

    await t.test('mobile curly apostrophes, NBSP spaces, and punctuation-mode casing work seamlessly', () => {
        resetGame();
        puncCheckbox.checked = true; // @punctuation enabled: target words keep original case & apostrophes
        const words = ["Don't", 'move', "I'm", 'here'];
        _setState({
            mobileInputOverride: true,
            processedWords: words,
            currentWordIndex: 0,
            startTime: new Date(Date.now() - 8000),
            currentGameMode: 'song',
            isSharedGame: true
        });

        // Simulate iOS smart apostrophe (\u2019), lowercase d on "don’t", capitalized "Move", NBSP (\u00A0)
        const mobileSeqs = ['don\u2019t\u00A0', 'Move ', 'i\u2019m ', 'Here'];
        for (const seq of mobileSeqs) {
            typingArea.value = '';
            for (const ch of seq) {
                typingArea.value += ch;
                handleTypingInput();
            }
        }

        const state = _getState();
        assert.equal(state.currentWordIndex, words.length);
        assert.equal(state.errorKeystrokes, 0);
        assert.equal(calculateAccuracy(), 100);
        puncCheckbox.checked = false;
        _setState({ mobileInputOverride: null });
    });

    await t.test('genuine wrong letters on mobile still register errors and mark input incorrect', () => {
        resetGame();
        puncCheckbox.checked = false;
        _setState({
            mobileInputOverride: true,
            processedWords: ['move', 'on'],
            currentWordIndex: 0,
            startTime: new Date(Date.now() - 5000)
        });

        typingArea.value = 'M';
        handleTypingInput();
        assert.equal(_getState().errorKeystrokes, 0);
        assert.equal(typingArea.classList.contains('incorrect'), false);

        typingArea.value = 'Mx';
        handleTypingInput();
        assert.equal(_getState().errorKeystrokes, 1);
        assert.equal(typingArea.classList.contains('incorrect'), true);
        _setState({ mobileInputOverride: null });
    });

    await t.test('desktop mode preserves strict case sensitivity when @punctuation is enabled', () => {
        resetGame();
        puncCheckbox.checked = true;
        _setState({
            mobileInputOverride: false,
            processedWords: ['Move', 'on'],
            currentWordIndex: 0,
            startTime: new Date(Date.now() - 5000)
        });

        typingArea.value = 'm';
        handleTypingInput();
        assert.equal(_getState().errorKeystrokes, 1, 'desktop punctuation mode still requires exact case');
        assert.equal(typingArea.classList.contains('incorrect'), true);

        puncCheckbox.checked = false;
        _setState({ mobileInputOverride: null });
    });

    await t.test('sanitizeRawTypingValue normalizes smart quotes, NBSP, newlines, and leading spaces', () => {
        assert.equal(sanitizeRawTypingValue('  \u00A0don\u2019t\r\n'), "don't");
        assert.equal(adaptTypedCaseForMobile("don't", "Don't"), "don't"); // desktop default
        _setState({ mobileInputOverride: true });
        assert.equal(adaptTypedCaseForMobile("don't", "Don't"), "Don't"); // mobile adapted
        _setState({ mobileInputOverride: null });
    });
});

test('Responsive post-game results layout & mobile UI controls', async (t) => {
    await t.test('showFinalInfo renders responsive CSS classes without hardcoded 250px inline widths or invalid <p><div> nesting', () => {
        const songInfo = getOrCreateMockElement('song-info');
        delete mockElements['play-again-btn'];
        delete mockElements['share-score-btn'];
        delete mockElements['share-challenge-btn'];
        const startBtn = getOrCreateMockElement('start-btn');
        startBtn.clickCalled = 0;

        _setState({
            selectedTrack: {
                title: 'Espresso',
                artist: { name: 'Sabrina Carpenter' },
                album: { title: "Short n' Sweet", cover_medium: 'https://example.com/cover.jpg' },
                preview: 'https://example.com/preview.mp3'
            },
            finalWPM: 68,
            finalAccuracy: 97,
            challengerWPM: 60,
            sectionOne: 'Now he is\n',
            sectionSelected: "thinkin' 'bout me every night, oh",
            sectionTwo: '\nIs it that sweet?'
        });

        showFinalInfo();

        assert.match(songInfo.innerHTML, /class="final-results"/);
        assert.match(songInfo.innerHTML, /class="final-media-col"/);
        assert.match(songInfo.innerHTML, /class="final-content-col"/);
        assert.match(songInfo.innerHTML, /id="play-again-btn"/);
        assert.match(songInfo.innerHTML, />Copy Link<\/button>/, 'should use compact "Copy Link" label without emoji');
        assert.doesNotMatch(songInfo.innerHTML, /Copy Challenge Link/i);
        assert.doesNotMatch(songInfo.innerHTML, /width:\s*250px/i, 'should not use hardcoded 250px inline width');
        assert.doesNotMatch(songInfo.innerHTML, /<p[^>]*id="display-lyrics"/i, 'should use a <div> container instead of nesting <div> inside <p>');

        const playAgainBtn = getOrCreateMockElement('play-again-btn');
        playAgainBtn.click();
        assert.equal(startBtn.clickCalled, 1, 'clicking Next Song should trigger startBtn');
    });

    await t.test('syncArtistClearButton shows clear button only when search input is non-empty', () => {
        const artistInput = getOrCreateMockElement('artist-input');
        const clearBtn = getOrCreateMockElement('artist-clear-btn');

        artistInput.value = '';
        syncArtistClearButton();
        assert.equal(clearBtn.style.display, 'none');

        artistInput.value = 'Sabrina Carpenter';
        syncArtistClearButton();
        assert.equal(clearBtn.style.display, 'inline-flex');
    });

    await t.test('styles.css includes mobile responsive rules and >=16px inputs to prevent iOS auto-zoom', () => {
        assert.match(stylesCss, /@media\s*\(max-width:\s*640px\)/);
        assert.match(stylesCss, /\.final-results\s*\{[\s\S]*?flex-direction:\s*column/);
        assert.match(stylesCss, /#typing-area\.lowercase-mode:not\(:placeholder-shown\)/);
        assert.match(stylesCss, /overflow-x:\s*clip/);
    });
});

test('Footer layout and positioning validation', async (t) => {
    await t.test('Footer does not use fixed positioning to prevent overlapping content on zoom', () => {
        const footerBlockMatch = stylesCss.match(/\.footer\s*\{([^}]+)\}/);
        assert.ok(footerBlockMatch, '.footer rule should exist in styles.css');
        const footerStyles = footerBlockMatch[1];

        assert.doesNotMatch(
            footerStyles,
            /position\s*:\s*fixed/i,
            '.footer must not use position: fixed as it collides with content on zoomed viewports'
        );
    });

    await t.test('Body provides full viewport height flex layout for sticky footer', () => {
        const bodyBlockMatch = stylesCss.match(/body\s*\{([^}]+)\}/);
        assert.ok(bodyBlockMatch, 'body rule should exist in styles.css');
        const bodyStyles = bodyBlockMatch[1];

        assert.match(bodyStyles, /min-height\s*:\s*100vh/i, 'body must have min-height: 100vh');
        assert.match(bodyStyles, /display\s*:\s*flex/i, 'body must have display: flex');
        assert.match(bodyStyles, /flex-direction\s*:\s*column/i, 'body must have flex-direction: column');
    });

    await t.test('Footer pushes down with margin-top: auto', () => {
        const footerBlockMatch = stylesCss.match(/\.footer\s*\{([^}]+)\}/);
        assert.ok(footerBlockMatch, '.footer rule should exist');
        const footerStyles = footerBlockMatch[1];

        assert.match(footerStyles, /margin-top\s*:\s*auto/i, '.footer should have margin-top: auto');
    });

    await t.test('Footer renders minimal Monkeytype-style GitHub icon + label link', () => {
        assert.doesNotMatch(indexHtml, /View this project on/i, 'Legacy plain-text GitHub sentence should be removed');
        assert.match(
            indexHtml,
            /<div class="footer-links">[\s\S]*?<a[^>]*href="https:\/\/github\.com\/wyOmar\/tuneTyper"[^>]*class="footer-link"[^>]*>[\s\S]*?<svg class="footer-icon"[\s\S]*?<span>github<\/span>[\s\S]*?<\/a>[\s\S]*?<\/div>/,
            'Footer should render .footer-links with .footer-link, inline .footer-icon SVG, and monospace github label'
        );
        assert.match(indexHtml, /rel="noopener noreferrer"/, 'External GitHub link should include rel="noopener noreferrer"');

        const footerLinkMatch = stylesCss.match(/\.footer-link\s*\{([^}]+)\}/);
        assert.ok(footerLinkMatch, '.footer-link rule should exist in styles.css');
        assert.match(footerLinkMatch[1], /font-family\s*:\s*monospace/i, '.footer-link should use monospace font');
        assert.match(footerLinkMatch[1], /text-decoration\s*:\s*none/i, '.footer-link should not be underlined');
    });

    await t.test('Footer wraps popular artist crawl links in a collapsible <details> to prevent clutter', () => {
        assert.match(
            indexHtml,
            /<details\s+class="artist-seo-collapse">[\s\S]*?<summary\s+class="artist-seo-summary">[\s\S]*?<span\s+class="artist-seo-summary-label">Popular Artists<\/span>[\s\S]*?<nav\s+class="artist-seo-links"/,
            'Footer should wrap .artist-seo-links inside .artist-seo-collapse details and .artist-seo-summary toggle'
        );
        assert.doesNotMatch(
            indexHtml,
            /<details\s+class="artist-seo-collapse"\s+open/i,
            'Popular artists details element should be closed by default to prevent visual clutter'
        );

        assert.ok(stylesCss.includes('.artist-seo-collapse'), '.artist-seo-collapse styles should exist');
        assert.ok(stylesCss.includes('.artist-seo-summary'), '.artist-seo-summary styles should exist');
        assert.ok(stylesCss.includes('.artist-seo-chevron'), '.artist-seo-chevron styles should exist');
    });
});
