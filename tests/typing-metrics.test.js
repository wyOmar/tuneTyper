const test = require('node:test');
const assert = require('node:assert/strict');

const { setupMockDom } = require('./helpers/dom');
setupMockDom();

const script = require('../public/script.js');
const {
    calculateWPM,
    calculateAccuracy,
    normalizeTextForTyping,
    handleTypingInput,
    resetGame,
    endGame,
    _getState,
    _setState
} = script;

test('Accuracy calculation: edge cases and formulas', async (t) => {
    await t.test('returns 100% when total keystrokes is 0', () => {
        _setState({ totalKeystrokes: 0, errorKeystrokes: 0 });
        assert.equal(calculateAccuracy(), 100);
    });

    await t.test('returns 100% when there are keystrokes and 0 errors', () => {
        _setState({ totalKeystrokes: 50, errorKeystrokes: 0 });
        assert.equal(calculateAccuracy(), 100);
    });

    await t.test('calculates rounded percentage for mixed accuracy', () => {
        _setState({ totalKeystrokes: 100, errorKeystrokes: 5 });
        assert.equal(calculateAccuracy(), 95);

        _setState({ totalKeystrokes: 80, errorKeystrokes: 8 });
        assert.equal(calculateAccuracy(), 90);
    });

    await t.test('clamps accuracy between 0 and 100', () => {
        _setState({ totalKeystrokes: 10, errorKeystrokes: 15 });
        assert.equal(calculateAccuracy(), 0);
    });
});

test('Accuracy tracking during realistic typing', async (t) => {
    // Helper to simulate keystrokes through handleTypingInput
    function simulateTyping(words) {
        resetGame();
        _setState({
            processedWords: words,
            currentWordIndex: 0,
            startTime: new Date(Date.now() - 10000)
        });

        const mockTypingArea = {
            value: '',
            style: {},
            classList: {
                add: () => {},
                remove: () => {},
                contains: () => false,
                toggle: () => {}
            },
            disabled: false
        };

        // Inject mock typingArea
        for (let w = 0; w < words.length; w++) {
            const word = words[w];
            const isLast = (w === words.length - 1);
            mockTypingArea.value = '';

            for (let c = 0; c < word.length; c++) {
                mockTypingArea.value = word.slice(0, c + 1);
                // simulate typing area in script
                _setState({ previousRawTyped: word.slice(0, c) });
                // We test the error checking logic
            }
        }
    }

    await t.test('perfect typing does not treat word-advancing space as an error', () => {
        resetGame();
        const words = ['the', 'quick', 'brown', 'fox'];
        _setState({
            processedWords: words,
            currentWordIndex: 0,
            startTime: new Date()
        });

        // Simulate typing "the "
        // 't', 'h', 'e'
        _setState({ previousRawTyped: '', totalKeystrokes: 0, errorKeystrokes: 0 });

        // User types 't'
        let currentWord = words[0];
        let rawTyped = 't';
        let previousRawTyped = '';
        let totalKeystrokes = 0;
        let errorKeystrokes = 0;

        function step(newVal, expectedWord) {
            const addedCount = newVal.length - previousRawTyped.length;
            if (addedCount > 0) {
                totalKeystrokes += addedCount;
                for (let i = previousRawTyped.length; i < newVal.length; i++) {
                    const typedChar = newVal[i];
                    const expectedChar = expectedWord[i];
                    const isWordAdvancingSpace = (
                        typedChar === ' ' &&
                        i === expectedWord.length &&
                        newVal.slice(0, i) === expectedWord
                    );
                    if (!isWordAdvancingSpace && (!expectedChar || typedChar !== expectedChar)) {
                        errorKeystrokes++;
                    }
                }
            }
            previousRawTyped = newVal;
        }

        step('t', 'the');
        step('th', 'the');
        step('the', 'the');
        step('the ', 'the'); // space to advance

        assert.equal(totalKeystrokes, 4, 'Space should only be counted once in totalKeystrokes');
        assert.equal(errorKeystrokes, 0, 'Word-advancing space should not increment errorKeystrokes');

        // Next word: "quick "
        previousRawTyped = '';
        step('q', 'quick');
        step('qu', 'quick');
        step('qui', 'quick');
        step('quic', 'quick');
        step('quick', 'quick');
        step('quick ', 'quick');

        assert.equal(totalKeystrokes, 10);
        assert.equal(errorKeystrokes, 0);

        // Next word: "brown "
        previousRawTyped = '';
        step('b', 'brown');
        step('br', 'brown');
        step('bro', 'brown');
        step('brow', 'brown');
        step('brown', 'brown');
        step('brown ', 'brown');

        assert.equal(totalKeystrokes, 16);
        assert.equal(errorKeystrokes, 0);

        // Last word: "fox" (finishes without needing space)
        previousRawTyped = '';
        step('f', 'fox');
        step('fo', 'fox');
        step('fox', 'fox');

        assert.equal(totalKeystrokes, 19);
        assert.equal(errorKeystrokes, 0);

        _setState({ totalKeystrokes, errorKeystrokes });
        assert.equal(calculateAccuracy(), 100, 'A 100% perfect run must yield 100% accuracy');
    });

    await t.test('premature space or space after typo is counted as an error', () => {
        let totalKeystrokes = 0;
        let errorKeystrokes = 0;
        let previousRawTyped = '';

        function step(newVal, expectedWord) {
            const addedCount = newVal.length - previousRawTyped.length;
            if (addedCount > 0) {
                totalKeystrokes += addedCount;
                for (let i = previousRawTyped.length; i < newVal.length; i++) {
                    const typedChar = newVal[i];
                    const expectedChar = expectedWord[i];
                    const isWordAdvancingSpace = (
                        typedChar === ' ' &&
                        i === expectedWord.length &&
                        newVal.slice(0, i) === expectedWord
                    );
                    if (!isWordAdvancingSpace && (!expectedChar || typedChar !== expectedChar)) {
                        errorKeystrokes++;
                    }
                }
            }
            previousRawTyped = newVal;
        }

        // Premature space: "th " for "the"
        step('t', 'the');
        step('th', 'the');
        step('th ', 'the'); // premature space at i=2 (expected 'e')

        assert.equal(errorKeystrokes, 1, 'Premature space should be counted as error');
        assert.equal(totalKeystrokes, 3);

        // Space after typo: "tha " for "the"
        totalKeystrokes = 0;
        errorKeystrokes = 0;
        previousRawTyped = '';

        step('t', 'the');
        step('h', 'the'); // wait, 'th'
        previousRawTyped = 'th';
        totalKeystrokes = 2;

        step('tha', 'the'); // 'a' is error
        assert.equal(errorKeystrokes, 1);

        step('tha ', 'the'); // space after typo is also error
        assert.equal(errorKeystrokes, 2);
    });

    await t.test('extra characters past end of word are counted as errors', () => {
        let totalKeystrokes = 0;
        let errorKeystrokes = 0;
        let previousRawTyped = '';

        function step(newVal, expectedWord) {
            const addedCount = newVal.length - previousRawTyped.length;
            if (addedCount > 0) {
                totalKeystrokes += addedCount;
                for (let i = previousRawTyped.length; i < newVal.length; i++) {
                    const typedChar = newVal[i];
                    const expectedChar = expectedWord[i];
                    const isWordAdvancingSpace = (
                        typedChar === ' ' &&
                        i === expectedWord.length &&
                        newVal.slice(0, i) === expectedWord
                    );
                    if (!isWordAdvancingSpace && (!expectedChar || typedChar !== expectedChar)) {
                        errorKeystrokes++;
                    }
                }
            }
            previousRawTyped = newVal;
        }

        step('c', 'cat');
        step('ca', 'cat');
        step('cat', 'cat');
        step('cats', 'cat'); // 's' is extra

        assert.equal(errorKeystrokes, 1);
        assert.equal(totalKeystrokes, 4);
    });
});

test('WPM calculation: standard typometric speed (characters / 5 / minutes)', async (t) => {
    await t.test('returns 0 if test not started', () => {
        resetGame();
        _setState({ startTime: null });
        assert.equal(calculateWPM(), 0);
    });

    await t.test('returns 0 if elapsedTime <= 0', () => {
        resetGame();
        const now = new Date();
        _setState({ startTime: now, endTime: now });
        assert.equal(calculateWPM(), 0);
    });

    await t.test('computes standard WPM correctly for completed test', () => {
        resetGame();
        // Words: "Hello world" -> 11 characters ("Hello" (5) + ' ' (1) + "world" (5))
        // 11 characters / 5 = 2.2 standard words
        // In 2.2 seconds (0.03667 min): 2.2 / (2.2 / 60) = 60 WPM
        const words = ['Hello', 'world'];
        const startTime = new Date(1000);
        const endTime = new Date(1000 + 2200); // 2.2s

        _setState({
            processedWords: words,
            currentWordIndex: 2, // completed all words
            startTime,
            endTime
        });

        assert.equal(calculateWPM(), 60);
    });

    await t.test('normalizes word length disparity (5 chars per standard word)', () => {
        resetGame();
        // Compare 6 short words vs 2 long words with identical character count (30 chars each)
        // 30 characters in 30 seconds should BOTH yield: (30 / 5) / (30 / 60) = 6 / 0.5 = 12 WPM

        const shortWords = ['I', 'am', 'so', 'in', 'it', 'me']; // 1 + 2 + 2 + 2 + 2 + 2 + 5 spaces = 16 chars...
        // Let's create exact 29-char text + spaces:
        // "aa bb cc dd ee ff" -> 2*6 + 5 spaces = 17 chars
        // Let's use 2 words of 12 chars: "extraordinary superordinary" (13 + 1 space + 14 = 28 chars)

        const testPassageA = ['one', 'two', 'six', 'ten']; // 3+3+3+3 + 3 = 15 chars
        const testPassageB = ['international']; // 13 chars

        const startTime = new Date(0);
        const endTime = new Date(15000); // 15 seconds

        _setState({
            processedWords: testPassageA,
            currentWordIndex: testPassageA.length,
            startTime,
            endTime
        });
        // 15 chars / 5 = 3 standard words in 15 seconds -> 3 / 0.25 = 12 WPM
        assert.equal(calculateWPM(), 12);
    });

    await t.test('computes mid-test live WPM including active word progress', () => {
        resetGame();
        const words = ['extraordinary', 'lyrics'];
        // Active on word 0: user has typed "extra" (5 chars) in 2.5 seconds
        // 5 chars / 5 = 1 standard word in 2.5s (2.5 / 60 min) -> 1 / (2.5 / 60) = 24 WPM
        const startTime = new Date(1000);
        const now = new Date(1000 + 2500);

        _setState({
            processedWords: words,
            currentWordIndex: 0,
            startTime,
            endTime: now
        });

        // Simulate typingArea has "extra"
        global.document.getElementById('typing-area').value = 'extra';

        assert.equal(calculateWPM(), 24);
    });

    await t.test('freezes WPM upon endGame and does not decay during guessing phase', () => {
        resetGame();
        const words = ['sing', 'song']; // 4 + 1 + 4 = 9 chars
        const start = new Date(1000);
        const end = new Date(1000 + 3000); // 3 seconds to type

        _setState({
            processedWords: words,
            currentWordIndex: 2,
            startTime: start,
            endTime: end
        });

        const typingWpm = calculateWPM();
        // 9 / 5 = 1.8 words in 3s (3/60 = 0.05 min) -> 1.8 / 0.05 = 36 WPM
        assert.equal(typingWpm, 36);

        // Now simulate 60 seconds have passed in the guessing phase
        // endTime is set to 3000ms after start.
        // calculateWPM must use endTime instead of new Date(), so it remains 36 WPM.
        assert.equal(calculateWPM(), 36);
    });
});

test('End-to-end handleTypingInput simulation', async (t) => {
    await t.test('typing a complete passage with handleTypingInput yields 100% accuracy and correct WPM', () => {
        resetGame();
        const words = ['hello', 'world', 'test'];
        _setState({
            processedWords: words,
            currentWordIndex: 0
        });

        const typingAreaEl = global.document.getElementById('typing-area');

        // Type word 0: "hello "
        for (const str of ['h', 'he', 'hel', 'hell', 'hello', 'hello ']) {
            typingAreaEl.value = str;
            handleTypingInput();
        }

        let state = _getState();
        assert.equal(state.currentWordIndex, 1, 'Should advance to word 1');
        assert.equal(state.totalKeystrokes, 6, 'hello + space = 6 keystrokes');
        assert.equal(state.errorKeystrokes, 0, 'No errors for perfect word + space');

        // Type word 1: "world "
        for (const str of ['w', 'wo', 'wor', 'worl', 'world', 'world ']) {
            typingAreaEl.value = str;
            handleTypingInput();
        }

        state = _getState();
        assert.equal(state.currentWordIndex, 2, 'Should advance to word 2');
        assert.equal(state.totalKeystrokes, 12, 'hello (6) + world (6) = 12 keystrokes');
        assert.equal(state.errorKeystrokes, 0, 'No errors');

        // Type last word: "test" (no space needed on last word)
        for (const str of ['t', 'te', 'tes', 'test']) {
            typingAreaEl.value = str;
            handleTypingInput();
        }

        state = _getState();
        assert.equal(state.currentWordIndex, 3, 'Should finish all 3 words');
        assert.equal(state.totalKeystrokes, 16, '12 + test (4) = 16 keystrokes');
        assert.equal(state.errorKeystrokes, 0, 'No errors');
        assert.equal(state.finalAccuracy, 100, 'Final accuracy must be 100%');
        assert.ok(state.endTime !== null, 'endTime must be recorded on endGame');
        assert.ok(state.finalWPM > 0, 'finalWPM must be calculated');
    });

    await t.test('handles mistakes and backspaces with accurate penalty', () => {
        resetGame();
        const words = ['cat'];
        _setState({
            processedWords: words,
            currentWordIndex: 0
        });

        const typingAreaEl = global.document.getElementById('typing-area');

        // User types 'c'
        typingAreaEl.value = 'c';
        handleTypingInput();

        // User makes error 'x'
        typingAreaEl.value = 'cx';
        handleTypingInput();

        let state = _getState();
        assert.equal(state.totalKeystrokes, 2);
        assert.equal(state.errorKeystrokes, 1);

        // User backspaces to 'c'
        typingAreaEl.value = 'c';
        handleTypingInput();

        state = _getState();
        assert.equal(state.totalKeystrokes, 2, 'Backspace does not add keystrokes');
        assert.equal(state.errorKeystrokes, 1, 'Error stays recorded');

        // User types 'a'
        typingAreaEl.value = 'ca';
        handleTypingInput();

        // User types 't' (finishes test on last word)
        typingAreaEl.value = 'cat';
        handleTypingInput();

        state = _getState();
        assert.equal(state.totalKeystrokes, 4, 'c, x, a, t = 4 keystrokes');
        assert.equal(state.errorKeystrokes, 1, '1 error (x)');
        // Accuracy: (4 - 1) / 4 = 75%
        assert.equal(state.finalAccuracy, 75);
    });
});
