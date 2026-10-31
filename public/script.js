// Frontend
const artistInput = typeof document !== 'undefined' ? document.getElementById('artist-input') : null;
const startBtn = typeof document !== 'undefined' ? document.getElementById('start-btn') : null;
const typingArea = typeof document !== 'undefined' ? document.getElementById('typing-area') : null;
const displayText = typeof document !== 'undefined' ? document.getElementById('display-text') : null;
const wpmResult = typeof document !== 'undefined' ? document.getElementById('wpm-result') : null;
const removePunctuationCheckbox = typeof document !== 'undefined' ? document.getElementById('remove-punctuation') : null;
const removeAdlibsCheckbox = typeof document !== 'undefined' ? document.getElementById('remove-adlibs') : null;
const includeNumbersCheckbox = typeof document !== 'undefined' ? document.getElementById('include-numbers') : null;
const songInfo = typeof document !== 'undefined' ? document.getElementById('song-info') : null;
const guessSection = typeof document !== 'undefined' ? document.getElementById('guess-section') : null;
const guessInput = typeof document !== 'undefined' ? document.getElementById('guess-input') : null;
const guessInputContainer = typeof document !== 'undefined' ? document.querySelector('.guess-input-container') : null;
const skipBtn = typeof document !== 'undefined' ? document.getElementById('skip-btn') : null;
const searchSuggestions = typeof document !== 'undefined' ? document.getElementById('search-suggestions') : null;
const artistClearBtn = typeof document !== 'undefined' ? document.getElementById('artist-clear-btn') : null;
const endGameBtn = typeof document !== 'undefined' ? document.getElementById('end-game-btn') : null;

// Hint Elements
const mysteryTitle = typeof document !== 'undefined' ? document.getElementById('mystery-title') : null;
const hintStageBadge = typeof document !== 'undefined' ? document.getElementById('hint-stage-badge') : null;
const attemptTracker = typeof document !== 'undefined' ? document.getElementById('attempt-tracker') : null;
const hintCoverImg = typeof document !== 'undefined' ? document.getElementById('hint-cover-img') : null;
const hintBadges = typeof document !== 'undefined' ? document.getElementById('hint-badges') : null;
const snippetPlayBtn = typeof document !== 'undefined' ? document.getElementById('snippet-play-btn') : null;
const snippetIcon = typeof document !== 'undefined' ? document.getElementById('snippet-icon') : null;
const snippetLabel = typeof document !== 'undefined' ? document.getElementById('snippet-label') : null;
const snippetBar = typeof document !== 'undefined' ? document.getElementById('snippet-bar') : null;
const guessSubmitBtn = typeof document !== 'undefined' ? document.getElementById('guess-submit-btn') : null;
const guessSuggestions = typeof document !== 'undefined' ? document.getElementById('guess-suggestions') : null;
const challengeBanner = typeof document !== 'undefined' ? document.getElementById('challenge-banner') : null;

// Variables
let typeSection = "";
let processedWords = [];
let currentWordIndex = 0;
let startTime = null;
let endTime = null;
let testStarted = false;
let selectedTrack = null;
let guessCount = 0;
let previousArtist = "";
let artistTracks = [];
let cachedSongLyrics = {};
let wpmInterval;
let currentGameMode = 'artist'; // 'artist' (mystery song + guessing) | 'song' (direct practice)
// Omnibox autocomplete state
let omniboxItems = [];
let omniboxSelectedIndex = -1;
let debounceOmniboxTimeout = null;
let omniboxRequestId = 0;
const omniboxSuggestCache = new Map();
const CURATED_ARTIST_NAMES = [
    'Taylor Swift', 'Sabrina Carpenter', 'Chappell Roan', 'Olivia Rodrigo', 'Billie Eilish',
    'Eminem', 'Kendrick Lamar', 'The Weeknd', 'Ariana Grande', 'Bruno Mars',
    'Drake', 'Charli xcx', 'Lana Del Rey', 'Post Malone', 'Travis Scott',
    'Dua Lipa', 'Ed Sheeran', 'Lady Gaga', 'Coldplay', 'Queen',
    'Arctic Monkeys', 'Radiohead', 'Kanye West', 'Frank Ocean', 'Tyler, The Creator',
    'SZA', 'Harry Styles', 'Beyoncé', 'Rihanna', 'Linkin Park'
];
// Deep link & Challenge variables
let isSharedGame = false;
let challengerWPM = null;
let challengerAcc = null;
let challengeStartIndex = null;
let currentStartIndex = 0;
// Share Score & Accuracy variables
let totalKeystrokes = 0;
let errorKeystrokes = 0;
let previousRawTyped = '';
let finalWPM = null;
let finalAccuracy = null;
let gaveUp = false;
// Hint & Snippet variables
let hintStage = 1;
const SNIPPET_DURATIONS = [2, 5, 10, 18, 30];
let snippetAudio = null;
let snippetProgressAnim = null;
let isSnippetPlaying = false;
let attemptHistory = []; // stores 'wrong', 'skipped', or 'correct'
let candidateSongs = [];
let artistCandidateCache = {};
const trackDetailsCache = new Map();
let trackExtraDetails = null;
let suggestionSelectedIndex = -1;
let debounceSuggestTimeout = null;
let suggestRequestId = 0;
// Lyrics variables
let sectionOne = "";
let sectionTwo = "";
let sectionSelected = "";
// Mobile / virtual keyboard input state
let mobileInputOverride = null; // null = auto-detect via pointer/UA; boolean = test override

function isMobileInputMode() {
    if (mobileInputOverride !== null) return Boolean(mobileInputOverride);
    if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
        try {
            if (window.matchMedia('(pointer: coarse)').matches) return true;
        } catch (_) {}
    }
    if (typeof navigator !== 'undefined' && typeof navigator.userAgent === 'string') {
        if (/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)) {
            return true;
        }
    }
    return false;
}

// Normalizes smart apostrophes/quotes, non-breaking spaces, newlines, and leading spaces
function sanitizeRawTypingValue(val) {
    return String(val || '')
        .replace(/[\r\n]+/g, '')
        .replace(/\u00A0/g, ' ')
        .replace(/[\u2018\u2019\u201A\u201B`]/g, "'")
        .replace(/[\u201C\u201D\u201E\u201F]/g, '"')
        .replace(/^\s+/, '');
}

// On mobile virtual keyboards, even with autocapitalize="none", custom IMEs or OS shortcuts
// (e.g. standalone "I" or stubborn sentence caps after input reset) can emit uppercase letters.
// Adapting typed letter case to expected word case on mobile prevents false errors without
// mutating input.value mid-IME-composition.
function adaptTypedCaseForMobile(sanitizedVal, expectedWord) {
    if (!isMobileInputMode() || !sanitizedVal) return sanitizedVal;
    const target = String(expectedWord || '');
    const lowercaseMode = !(removePunctuationCheckbox && removePunctuationCheckbox.checked);
    let out = '';
    for (let i = 0; i < sanitizedVal.length; i++) {
        const ch = sanitizedVal[i];
        if (i < target.length && ch.toLowerCase() === target[i].toLowerCase()) {
            out += target[i];
        } else if (lowercaseMode) {
            out += ch.toLowerCase();
        } else {
            out += ch;
        }
    }
    return out;
}

function syncTypingAreaCaseStyle() {
    if (!typingArea || !typingArea.classList) return;
    const lowercaseMode = !(removePunctuationCheckbox && removePunctuationCheckbox.checked);
    typingArea.classList.toggle('lowercase-mode', isMobileInputMode() && lowercaseMode);
}

function syncArtistClearButton() {
    if (!artistClearBtn || !artistInput) return;
    artistClearBtn.style.display = artistInput.value && artistInput.value.length > 0 ? 'inline-flex' : 'none';
}

function ensureGameVisibleAboveKeyboard() {
    if (typeof window === 'undefined' || !isMobileInputMode() || !typingArea) return;
    if (typeof document !== 'undefined' && document.activeElement !== typingArea) return;
    if (typeof typingArea.getBoundingClientRect !== 'function' || typeof window.scrollBy !== 'function') return;

    const vv = window.visualViewport;
    const viewportHeight = vv ? vv.height : window.innerHeight;
    if (!viewportHeight) return;

    const rect = typingArea.getBoundingClientRect();
    const desiredBottom = rect.bottom + 42; // leave breathing room for live WPM below input
    if (desiredBottom > viewportHeight) {
        window.scrollBy({ top: desiredBottom - viewportHeight, behavior: 'smooth' });
    } else if (displayText && typeof displayText.getBoundingClientRect === 'function') {
        const displayRect = displayText.getBoundingClientRect();
        if (displayRect.top < 8) {
            window.scrollBy({ top: displayRect.top - 12, behavior: 'smooth' });
        }
    }
}

// API Fetch Functions
async function fetchLyrics(artist, track) {
    startLoadingBar();
    const normArtist = String(artist || '').trim().toLowerCase();
    const normTrack = String(track || '').trim().toLowerCase();
    let response;
    try {
        response = await fetch(`/lyrics?artist=${encodeURIComponent(normArtist)}&track=${encodeURIComponent(normTrack)}`);
    } finally {
        stopLoadingBar();
    }
    if (!response.ok) throw new Error('Lyrics not found.');
    const data = await response.json();
    if (!data.lyrics) throw new Error('Lyrics unavailable.');
    return data.lyrics;
}

async function fetchArtistId(artistName) {
    // Exists because to fetchTopTracks we need their DeezerID
    // Sometimes the most popular song of the artist we search is a collab song or they are a feature, so we look at the top 5 results to guarantee we get the id of the artist we want
    const normArtist = String(artistName || '').trim().toLowerCase();
    const response = await fetch(`/tracks?artist=${encodeURIComponent(normArtist)}`);
    if (!response.ok) throw new Error('Failed to fetch artist data.');
    const data = await response.json();
    if (data.data.length === 0) throw new Error('Artist not found.');

    
    const topResults = data.data.slice(0, 5);
    const artistCount = {};

    topResults.forEach(track => {
        const artistId = track.artist.id;
        artistCount[artistId] = (artistCount[artistId] || 0) + 1;
    });

    const mostFrequentArtistId = Object.keys(artistCount).reduce((a, b) =>
        artistCount[a] > artistCount[b] ? a : b
    );

    return mostFrequentArtistId;
}

async function fetchTopTracks(artistId, limit = 50) {
    const limitParam = limit !== 50 ? `&limit=${encodeURIComponent(limit)}` : '';
    const response = await fetch(`/top-tracks?artistId=${encodeURIComponent(artistId)}${limitParam}`);
    if (!response.ok) throw new Error('Failed to fetch top tracks.');
    const data = await response.json();
    return data.data;
}

async function loadDefaultPlaylist() {
    currentGameMode = 'artist';
    try {
        const response = await fetch('/default');
        if (!response.ok) throw new Error('Failed to fetch playlist data.');

        const data = await response.json();
        const tracks = data.tracks.data;

        if (tracks.length === 0) throw new Error('No tracks found in the playlist.');

        const triedTracks = new Set();
        let lyrics = null;

        while (triedTracks.size < tracks.length && !lyrics) {
            const randomIndex = Math.floor(Math.random() * tracks.length);
            if (triedTracks.has(randomIndex)) continue;

            triedTracks.add(randomIndex);
            const randomTrack = tracks[randomIndex];
            const trackArtist = randomTrack.artist.name;
            const trackTitle = randomTrack.title;

            console.log(`Trying Song: ${trackTitle} by ${trackArtist}`);

            try {
                lyrics = await fetchLyrics(trackArtist, trackTitle);
                await fakeTypePlaceholder(artistInput, `${trackArtist}`, 25);
                cachedSongLyrics[`${trackArtist}-${trackTitle}`] = lyrics;

                selectedTrack = randomTrack;
                hydrateSelectedTrackPreview();
                ensureSelectedArtistCandidates();
                typeSection = extractRandomSection(lyrics);
                updateDisplayedText();
                endGameBtn.style.display = 'inline-block';

                console.log(`Loaded lyrics for: ${trackTitle} by ${trackArtist}`);
            } catch (error) {
                console.warn(`Lyrics not found for: ${trackTitle} by ${trackArtist}. Trying another song...`);
            }
        }

        if (!lyrics) {
            throw new Error('No lyrics available for any track in the playlist.');
        }
    } catch (error) {
        console.error(error.message);
    }
}
// Utility Functions
function extractRandomSection(text, minLength = 150, maxLength = 300, targetStartIndex = null) {
    const lines = text.split(/\n/);
    if (lines.length === 0) return '';

    // If a deterministic start index is specified (e.g. from a shared challenge deep link)
    if (targetStartIndex !== null && targetStartIndex !== undefined && !isNaN(targetStartIndex)) {
        const parsedStart = parseInt(targetStartIndex, 10);
        if (parsedStart >= 0 && parsedStart < lines.length) {
            let selectedText = '';
            let totalLength = 0;
            let startIndex = parsedStart;
            let index = startIndex;
            while (totalLength < minLength && index < lines.length) {
                const line = lines[index];
                selectedText += (selectedText ? '\n' : '') + line;
                totalLength = selectedText.length;
                index++;
            }
            if (selectedText.length > 0) {
                if (totalLength > maxLength) {
                    selectedText = selectedText.slice(0, maxLength);
                    const lastSpace = selectedText.lastIndexOf(' ');
                    const lastSentenceEnd = selectedText.lastIndexOf('.');
                    const cutIndex = Math.max(lastSentenceEnd, lastSpace);
                    if (cutIndex > 0) {
                        selectedText = selectedText.slice(0, cutIndex).trim();
                    }
                }
                sectionOne = lines.slice(0, startIndex).join('\n');
                sectionTwo = lines.slice(startIndex).join('\n').slice(selectedText.length).trim();
                sectionSelected = selectedText.trim();
                currentStartIndex = startIndex;
                return selectedText.trim();
            }
        }
    }

    for (let attempt = 0; attempt < 5; attempt++) {
        let selectedText = '';
        let totalLength = 0;
        let startIndex = Math.floor(Math.random() * lines.length);

        let index = startIndex;
        while (totalLength < minLength && index < lines.length) {
            const line = lines[index]; 
            selectedText += (selectedText ? '\n' : '') + line;
            totalLength = selectedText.length;
            index++;
        }

        if (totalLength >= minLength) {
            if (totalLength > maxLength) {
                selectedText = selectedText.slice(0, maxLength);
                const lastSpace = selectedText.lastIndexOf(' ');
                const lastSentenceEnd = selectedText.lastIndexOf('.');
                const cutIndex = Math.max(lastSentenceEnd, lastSpace);

                if (cutIndex > 0) {
                    selectedText = selectedText.slice(0, cutIndex).trim();
                }
            }
            sectionOne = lines.slice(0, startIndex).join('\n'); 
            // Start sectionTwo right after the (possibly truncated) selection so no text is lost
            sectionTwo = lines.slice(startIndex).join('\n').slice(selectedText.length).trim();
            sectionSelected = selectedText.trim();
            currentStartIndex = startIndex;
            // console.log("Selected Section:", selectedText);
            // console.log("Section One (Before):", sectionOne);
            // console.log("Section Two (After):", sectionTwo);

            return selectedText.trim();
        }
    }
    // If all attempts fail, return the longest possible section
    console.log(`Extract random section requirements failed`);
    sectionOne = '';
    sectionTwo = '';
    sectionSelected = lines.join('\n').slice(0, maxLength).trim();
    currentStartIndex = 0;
    return sectionSelected;
}

function normalizeTextForTyping(text, removePunctuation = false, removeAdlibs = false, removeNumbers = false) {
    // The API being used for lyrics, ovh, sometimes returns lyrics with weird characters like that weird "e"
    text = text.normalize('NFKD').replace(/е/g, 'e');
    text = text.replace(/[\u2018\u2019\u201A\u201B]/g, "'")
               .replace(/[\u201C\u201D\u201E\u201F]/g, '"');
    text = text.normalize('NFKD').replace(/[^\x00-\x7F]/g, '');
    if (removeAdlibs) {
        text = text.replace(/\(\s*[^()]{1,25}\s*\)/g, '');
    }
    if (removeNumbers) {
        // Drop whole words that contain digits (e.g. "24/7", "2x", "1998") rather than leaving fragments
        text = text.replace(/\S*\d\S*/g, '');
    }
    if (removePunctuation) {
        text = text.replace(/[\p{P}\p{S}]/gu, '').toLowerCase();
    }

    return text.trim();
}

function escapeHtml(str) {
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function normalizeText(text) {
    return text
        .normalize('NFKD')
        .replace(/[^\x00-\x7F]/g, '')
        .toLowerCase()
        .replace(/[\u2018\u2019\u201A\u201B]/g, "'")
        .replace(/[\u201C\u201D\u201E\u201F]/g, '"')
        .replace(/'/g, '')
        .replace(/\(.*?\)/g, '')
        .replace(/[!"£$%^&*()\-+=_@:;#~[\]{},.<>?/]/g, '')
        .replace(/\s+/g, '');
}

async function fakeTypePlaceholder(element, text, speed = 100) {
    element.placeholder = '';  // Clear placeholder
    for (let i = 0; i < text.length; i++) {
        element.placeholder += text.charAt(i);
        await new Promise(resolve => setTimeout(resolve, speed));  // Typing delay
    }
}

let inputTypingSessionId = 0;
let activeInputTypingTarget = null;
let activeInputTypingElement = null;
let activeInputTypingTimer = null;
let activeInputTypingResolve = null;

function cancelInputTyping(completeImmediately = false) {
    inputTypingSessionId++;
    if (activeInputTypingTimer) {
        clearTimeout(activeInputTypingTimer);
        activeInputTypingTimer = null;
    }
    if (completeImmediately && activeInputTypingElement && activeInputTypingTarget !== null) {
        activeInputTypingElement.value = activeInputTypingTarget;
    }
    activeInputTypingTarget = null;
    activeInputTypingElement = null;
    if (activeInputTypingResolve) {
        const resolveFn = activeInputTypingResolve;
        activeInputTypingResolve = null;
        resolveFn();
    }
}

function getCommonPrefixLength(a, b) {
    const strA = String(a ?? '');
    const strB = String(b ?? '');
    const maxLen = Math.min(strA.length, strB.length);
    let i = 0;
    while (i < maxLen && strA.charAt(i) === strB.charAt(i)) {
        i++;
    }
    return i;
}

function fakeTypeValue(element, text, speed = 22) {
    if (!element) return Promise.resolve();
    cancelInputTyping(false);

    const currentText = String(element.value ?? '');
    const targetText = String(text ?? '');

    if (currentText === targetText || speed <= 0) {
        element.value = targetText;
        activeInputTypingTarget = null;
        activeInputTypingElement = null;
        return Promise.resolve();
    }

    const sessionId = ++inputTypingSessionId;
    activeInputTypingElement = element;
    activeInputTypingTarget = targetText;

    const prefixLen = getCommonPrefixLength(currentText, targetText);
    let deleteRemaining = currentText.length - prefixLen;
    let typeIndex = prefixLen;
    const deleteSpeed = Math.max(1, Math.round(speed * 0.75));

    return new Promise((resolve) => {
        activeInputTypingResolve = resolve;

        function finish() {
            activeInputTypingTimer = null;
            activeInputTypingTarget = null;
            activeInputTypingElement = null;
            if (activeInputTypingResolve === resolve) activeInputTypingResolve = null;
            resolve();
        }

        function step() {
            if (sessionId !== inputTypingSessionId) {
                if (activeInputTypingResolve === resolve) activeInputTypingResolve = null;
                resolve();
                return;
            }

            if (deleteRemaining > 0) {
                deleteRemaining--;
                element.value = currentText.slice(0, prefixLen + deleteRemaining);
                if (deleteRemaining > 0 || typeIndex < targetText.length) {
                    activeInputTypingTimer = setTimeout(step, deleteRemaining > 0 ? deleteSpeed : speed);
                } else {
                    finish();
                }
                return;
            }

            if (typeIndex < targetText.length) {
                typeIndex++;
                element.value = targetText.slice(0, typeIndex);
                if (typeIndex < targetText.length) {
                    activeInputTypingTimer = setTimeout(step, speed);
                } else {
                    finish();
                }
                return;
            }

            finish();
        }

        step();
    });
}

// Game Functions
function resetGame(preserveChallenge = false) {
    currentWordIndex = 0;
    startTime = null;
    endTime = null;
    testStarted = false;
    guessCount = 0;
    sectionOne = "";
    sectionTwo = "";
    sectionSelected = "";
    totalKeystrokes = 0;
    errorKeystrokes = 0;
    previousRawTyped = '';
    finalWPM = null;
    finalAccuracy = null;
    gaveUp = false;
    hintStage = 1;
    attemptHistory = [];
    candidateSongs = [];
    trackExtraDetails = null;
    stopSnippet();
    hideSuggestions();

    if (!preserveChallenge) {
        isSharedGame = false;
        challengerWPM = null;
        challengerAcc = null;
        challengeStartIndex = null;
        if (challengeBanner) {
            challengeBanner.style.display = 'none';
            challengeBanner.innerHTML = '';
        }
    }

    if (typingArea) {
        typingArea.value = '';
        typingArea.style.display = 'block';
        typingArea.disabled = true;
        if (typingArea.classList) typingArea.classList.remove('incorrect');
    }
    if (displayText) displayText.innerHTML = '';
    if (wpmResult) wpmResult.textContent = '';
    if (songInfo) songInfo.innerHTML = '';
    if (guessSection) guessSection.style.display = 'none';
    if (guessInput) guessInput.value = '';
    if (guessInputContainer) guessInputContainer.classList.remove('shake');
    if (mysteryTitle) {
        mysteryTitle.innerHTML = '';
        mysteryTitle.style.display = 'none';
    }
    if (removePunctuationCheckbox) removePunctuationCheckbox.disabled = false;
    if (removeAdlibsCheckbox) removeAdlibsCheckbox.disabled = false;
    if (includeNumbersCheckbox) includeNumbersCheckbox.disabled = false;
    if (endGameBtn) endGameBtn.style.display = 'none';
}

function updateChallengeBanner() {
    if (!challengeBanner) return;
    if (isSharedGame && challengerWPM !== null && challengerWPM !== undefined) {
        const trackName = selectedTrack ? selectedTrack.title : '';
        const artistName = (selectedTrack && selectedTrack.artist) ? selectedTrack.artist.name : '';
        const songPart = trackName ? ` on "<strong>${escapeHtml(trackName)}</strong>"` : '';
        const artistPart = artistName ? ` by <strong>${escapeHtml(artistName)}</strong>` : '';
        const accPart = (challengerAcc !== null && challengerAcc !== undefined) ? ` (${challengerAcc}% Acc)` : '';
        challengeBanner.innerHTML = `<span class="challenge-text">Challenge: Beat <strong>${challengerWPM} WPM</strong>${accPart}${songPart}${artistPart}</span>`;
        challengeBanner.style.display = 'flex';
    } else {
        challengeBanner.style.display = 'none';
        challengeBanner.innerHTML = '';
    }
}

function updateDisplayedText() {
    const removePunctuation = !(removePunctuationCheckbox && removePunctuationCheckbox.checked);
    const removeAdlibs = !(removeAdlibsCheckbox && removeAdlibsCheckbox.checked);
    const removeNumbers = !(includeNumbersCheckbox && includeNumbersCheckbox.checked);
    const textToDisplay = normalizeTextForTyping(typeSection, removePunctuation, removeAdlibs, removeNumbers);
    processedWords = textToDisplay.split(/\s+/).filter(Boolean);

    if (displayText) {
        displayText.innerHTML = processedWords
            .map((word, index) => `<span id="word-${index}" class="word">${escapeHtml(word)}</span>`)
            .join(' ');
        displayText.scrollTop = 0;
    }

    syncTypingAreaCaseStyle();
    updateWordHighlight();
    if (typingArea) {
        typingArea.disabled = false;
        typingArea.focus();
    }
}

function updateWordHighlight() {
    if (displayText) {
        displayText.querySelectorAll('.word').forEach((span, index) => {
            span.classList.toggle('correct', index < currentWordIndex);
            span.classList.toggle('current', index === currentWordIndex);
        });
    }

    renderWordProgress(currentWordIndex, '');
    scrollCurrentWordIntoView();
}

// Typeracer/Monkeytype-style feedback: colour each character of the word being typed
// green (correct) or red (incorrect), show overflow characters, and draw a caret.
function renderWordProgress(index, typed, showCaret = true) {
    if (typeof document === 'undefined') return;
    const wordElement = document.getElementById(`word-${index}`);
    const word = processedWords[index];
    if (!wordElement || word === undefined) return;

    let html = '';
    for (let i = 0; i < word.length; i++) {
        const classes = ['char'];
        if (i < typed.length) {
            classes.push(typed[i] === word[i] ? 'correct' : 'incorrect');
        }
        if (showCaret && i === typed.length) classes.push('caret');
        if (showCaret && i === word.length - 1 && typed.length >= word.length) classes.push('caret-end');
        html += `<span class="${classes.join(' ')}">${escapeHtml(word[i])}</span>`;
    }
    // Characters typed past the end of the word
    for (let i = word.length; i < typed.length; i++) {
        html += `<span class="char extra">${escapeHtml(typed[i])}</span>`;
    }

    wordElement.innerHTML = html;
}

// Keep the active word on row 1 or row 2 of the 3-row box so row 3 always previews upcoming words
function scrollCurrentWordIntoView() {
    if (typeof document === 'undefined' || !displayText) return;
    const wordElement = document.getElementById(`word-${currentWordIndex}`);
    if (!wordElement) return;

    const padTop = (typeof getComputedStyle === 'function')
        ? (parseFloat(getComputedStyle(displayText).paddingTop) || 0)
        : 10;
    const lineHeight = wordElement.offsetHeight || 26;
    const relativeTop = wordElement.offsetTop - padTop;

    if (relativeTop > lineHeight * 1.35) {
        displayText.scrollTop = Math.max(0, relativeTop - lineHeight);
    } else {
        displayText.scrollTop = 0;
    }
}

function calculateWPM() {
    if (!startTime) return 0;
    const now = endTime || new Date();
    const elapsedTime = (now - startTime) / 1000;
    if (elapsedTime <= 0) return 0;

    let typedCharacters = 0;
    if (processedWords && processedWords.length > 0) {
        if (currentWordIndex >= processedWords.length) {
            typedCharacters = processedWords.join(' ').length;
        } else {
            for (let i = 0; i < currentWordIndex; i++) {
                typedCharacters += processedWords[i].length + 1; // completed word + delimiter space
            }
            if (typeof typingArea !== 'undefined' && typingArea && typingArea.value) {
                const currentWord = processedWords[currentWordIndex] || '';
                const expected = normalizeTextForTyping(currentWord);
                const raw = adaptTypedCaseForMobile(
                    sanitizeRawTypingValue(typingArea.value),
                    expected
                );
                for (let i = 0; i < raw.length && i < expected.length; i++) {
                    if (raw[i] === expected[i]) {
                        typedCharacters++;
                    } else {
                        break;
                    }
                }
            }
        }
    }

    const words = typedCharacters / 5;
    const minutes = elapsedTime / 60;
    return Math.round(words / minutes);
}

function calculateAccuracy() {
    if (totalKeystrokes === 0) return 100;
    return Math.max(0, Math.min(100, Math.round(((totalKeystrokes - errorKeystrokes) / totalKeystrokes) * 100)));
}

function startWPMUpdater() {
    wpmInterval = setInterval(() => {
        if (wpmResult) wpmResult.textContent = `${calculateWPM()} WPM`;
    }, 2000);
}

function stopWPMUpdater() {
    clearInterval(wpmInterval);
}

function formatDuration(seconds) {
    if (!seconds) return '—';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
}

function normalizeArtistName(name) {
    return (name || '')
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '');
}

function isTrackBySelectedArtist(track) {
    if (!selectedTrack || !selectedTrack.artist || !track) return false;
    const targetId = selectedTrack.artist.id ? String(selectedTrack.artist.id) : null;
    const targetName = normalizeArtistName(selectedTrack.artist.name);

    const matchesArtistObj = (artistObj) => {
        if (!artistObj) return false;
        if (targetId && artistObj.id && String(artistObj.id) === targetId) return true;
        const candName = normalizeArtistName(artistObj.name);
        return Boolean(targetName && candName === targetName);
    };

    if (matchesArtistObj(track.artist)) return true;
    if (Array.isArray(track.contributors) && track.contributors.some(matchesArtistObj)) {
        return true;
    }
    return false;
}

function normalizeSuggestionText(str) {
    return (str || '')
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[\u2018\u2019\u201A\u201B`]/g, "'")
        .replace(/[\u201C\u201D\u201E\u201F]/g, '"')
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .trim();
}

function stripSuggestionPunctuation(str) {
    return normalizeSuggestionText(str)
        .replace(/[^a-z0-9\s]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

function getSuggestionMatchRank(title, query) {
    const normQuery = normalizeSuggestionText(query);
    if (!normQuery) return 0;
    const normTitle = normalizeSuggestionText(title);
    if (normTitle.startsWith(normQuery)) return 3;
    if (normTitle.includes(normQuery)) return 2;

    const strippedQuery = stripSuggestionPunctuation(query);
    if (strippedQuery) {
        const strippedTitle = stripSuggestionPunctuation(title);
        if (strippedTitle.startsWith(strippedQuery)) return 2;
        if (strippedTitle.includes(strippedQuery)) return 1;
    }
    return 0;
}

function populateCandidateSongs() {
    candidateSongs = [];
    if (!selectedTrack || !selectedTrack.artist) return;

    const targetArtistName = selectedTrack.artist.name || '';
    const seen = new Set();

    const addCandidateTitle = (rawTitle) => {
        const clean = removeParentheses(rawTitle || '').trim();
        if (!clean) return;
        const key = stripSuggestionPunctuation(clean) || clean.toLowerCase();
        if (!seen.has(key)) {
            seen.add(key);
            candidateSongs.push({ title: clean, artist: targetArtistName });
        }
    };

    if (artistTracks && artistTracks.length > 0) {
        artistTracks.forEach(t => {
            if (isTrackBySelectedArtist(t)) {
                addCandidateTitle(t.title);
            }
        });
    }

    const cacheKey = selectedTrack.artist.id
        ? `id:${selectedTrack.artist.id}`
        : `name:${normalizeArtistName(targetArtistName)}`;
    const cachedCatalog = artistCandidateCache[cacheKey];
    if (Array.isArray(cachedCatalog)) {
        cachedCatalog.forEach(t => {
            if (isTrackBySelectedArtist(t)) {
                addCandidateTitle(t.title);
            }
        });
    }

    addCandidateTitle(selectedTrack.title);
}

async function ensureSelectedArtistCandidates() {
    if (!selectedTrack || !selectedTrack.artist) return;
    const targetArtistId = selectedTrack.artist.id;
    const targetArtistName = selectedTrack.artist.name || '';
    const cacheKey = targetArtistId
        ? `id:${targetArtistId}`
        : `name:${normalizeArtistName(targetArtistName)}`;

    if (artistCandidateCache[cacheKey]) {
        populateCandidateSongs();
        return;
    }

    try {
        let resolvedArtistId = targetArtistId;
        if (!resolvedArtistId && targetArtistName) {
            resolvedArtistId = await fetchArtistId(targetArtistName);
        }
        if (!resolvedArtistId) return;

        const tracks = await fetchTopTracks(resolvedArtistId, 100);
        if (Array.isArray(tracks) && tracks.length > 0) {
            artistCandidateCache[cacheKey] = tracks;
            populateCandidateSongs();
            if (guessSection && guessSection.style.display !== 'none' && guessInput && guessInput.value.trim()) {
                filterAndShowSuggestions(guessInput.value);
            }
        }
    } catch (err) {
        console.warn('Could not preload artist candidate songs:', err);
    }
}

function isPreviewUrlFresh(previewUrl) {
    if (!previewUrl || typeof previewUrl !== 'string') return false;
    const match = /(?:^|[?&~=])exp=(\d+)/.exec(previewUrl);
    if (!match) return true;
    const expSeconds = parseInt(match[1], 10);
    if (isNaN(expSeconds)) return true;
    return expSeconds > Math.floor(Date.now() / 1000) + 60;
}

function applyTrackDetailsToActiveTrack(trackId, details) {
    if (!details) return;
    trackExtraDetails = details;
    if (details.preview && selectedTrack && String(selectedTrack.id) === String(trackId)) {
        selectedTrack.preview = details.preview;
        if (typeof document !== 'undefined') {
            const audioElement = document.getElementById('song-preview');
            if (audioElement && audioElement.src !== details.preview) {
                audioElement.src = details.preview;
            }
        }
    }
    if (guessSection && guessSection.style.display !== 'none') {
        updateHintsUI();
    }
}

function hydrateSelectedTrackPreview() {
    if (!selectedTrack || !selectedTrack.id) return;
    if (isPreviewUrlFresh(selectedTrack.preview)) return;
    fetchTrackDetails(selectedTrack.id);
}

async function fetchTrackDetails(trackId) {
    trackExtraDetails = null;
    if (!trackId) return;
    const cacheKey = String(trackId);
    const cached = trackDetailsCache.get(cacheKey);
    if (
        cached &&
        Date.now() - cached.fetchedAt < 9 * 60 * 1000 &&
        (!cached.data.preview || isPreviewUrlFresh(cached.data.preview))
    ) {
        applyTrackDetailsToActiveTrack(trackId, cached.data);
        return cached.data;
    }

    try {
        const res = await fetch(`/track-details?trackId=${encodeURIComponent(trackId)}`);
        if (res.ok) {
            const details = await res.json();
            trackDetailsCache.set(cacheKey, { data: details, fetchedAt: Date.now() });
            applyTrackDetailsToActiveTrack(trackId, details);
            return details;
        }
    } catch (err) {
        console.warn('Could not fetch track details:', err);
    }
    return null;
}

function startGuessingPhase() {
    guessCount = 0;
    hintStage = 1;
    attemptHistory = [];
    trackExtraDetails = null;
    stopSnippet();
    hideSuggestions();

    guessInput.value = '';
    if (guessInputContainer) guessInputContainer.classList.remove('shake');

    populateCandidateSongs();
    ensureSelectedArtistCandidates();

    if (selectedTrack && selectedTrack.id) {
        fetchTrackDetails(selectedTrack.id);
    }

    renderMysteryTitle();
    updateHintsUI();

    guessSection.style.display = 'block';
    guessInput.focus();
}

function renderMysteryTitle() {
    if (!selectedTrack || !mysteryTitle) return;

    // Hint 1 (0 guesses): do not reveal word spacing or word/letter counts yet
    if (hintStage < 2) {
        mysteryTitle.innerHTML = '';
        mysteryTitle.style.display = 'none';
        return;
    }

    mysteryTitle.style.display = 'flex';
    const cleanTitle = removeParentheses(selectedTrack.title).trim();
    const words = cleanTitle.split(/\s+/).filter(Boolean);

    let totalLetters = 0;
    const wordsHtml = words.map(word => {
        let charsHtml = '';
        for (let i = 0; i < word.length; i++) {
            const ch = word[i];
            const isAlpha = /[a-z0-9]/i.test(ch);
            if (isAlpha) {
                totalLetters++;
                const upper = ch.toUpperCase();
                // On Hint 4+, reveal only the initial letter of each word (e.g. L _ _ _ _)
                const isFirstLetterOfWord = (i === 0);
                if (hintStage >= 4 && isFirstLetterOfWord) {
                    charsHtml += `<span class="mystery-char revealed">${escapeHtml(upper)}</span>`;
                } else {
                    charsHtml += `<span class="mystery-char">_</span>`;
                }
            } else {
                charsHtml += `<span class="mystery-char punct">${escapeHtml(ch)}</span>`;
            }
        }
        return `<span class="mystery-word">${charsHtml}</span>`;
    }).join(' ');

    const summary = `<div style="width: 100%; text-align: center; font-size: 12px; color: #888; margin-top: 6px;">${words.length} word${words.length === 1 ? '' : 's'} \u2022 ${totalLetters} letters</div>`;

    mysteryTitle.innerHTML = wordsHtml + summary;
}

function updateAttemptTracker() {
    if (!attemptTracker) return;
    const dots = attemptTracker.querySelectorAll('.attempt-dot');
    dots.forEach((dot, index) => {
        dot.className = 'attempt-dot';
        if (index < attemptHistory.length) {
            dot.classList.add(attemptHistory[index]); // 'wrong', 'skipped', or 'correct'
        } else if (index === hintStage - 1) {
            dot.classList.add('current');
        }
    });
}

function updateSkipBtn() {
    if (!skipBtn) return;
    if (hintStage >= 5) {
        skipBtn.textContent = 'Give Up';
        skipBtn.classList.add('give-up-mode');
    } else {
        skipBtn.textContent = 'Skip';
        skipBtn.classList.remove('give-up-mode');
    }
}

function updateHintsUI() {
    if (!selectedTrack) return;

    if (hintStageBadge) {
        hintStageBadge.textContent = `Attempt ${hintStage} / 5`;
    }

    updateAttemptTracker();
    updateSkipBtn();

    // Progressive Album Cover (unblurred starting at Hint 3)
    if (hintCoverImg) {
        if (selectedTrack.album && selectedTrack.album.cover_medium) {
            hintCoverImg.src = selectedTrack.album.cover_medium;
            hintCoverImg.alt = selectedTrack.album.title || 'Album Art';
        }
        hintCoverImg.className = `hint-cover-img blur-stage-${hintStage}`;
    }

    // Progressive Metadata Badges:
    // Hint 1 (0 guesses): Artist + blurred art + 2s snippet (no word/letter counts)
    // Hint 2 (1 guess):   + Word spacing / letter counts + 5s snippet
    // Hint 3 (2 guesses): + Album + Year + unblurred art + 10s snippet
    // Hint 4 (3 guesses): + Track Length + Word Initials + 18s snippet
    // Hint 5 (4 guesses): + Full 30s audio
    if (hintBadges) {
        const badges = [];
        badges.push(`<span class="meta-pill">🎤 Artist: <strong>${escapeHtml(selectedTrack.artist.name)}</strong></span>`);

        if (hintStage >= 2) {
            badges.push(`<span class="meta-pill highlight">📏 Word spacing</span>`);
        }

        if (hintStage >= 3) {
            if (selectedTrack.album && selectedTrack.album.title) {
                badges.push(`<span class="meta-pill highlight">💿 Album: <strong>${escapeHtml(selectedTrack.album.title)}</strong></span>`);
            }
            if (trackExtraDetails && trackExtraDetails.release_date) {
                const year = trackExtraDetails.release_date.split('-')[0];
                if (year) {
                    badges.push(`<span class="meta-pill highlight">📅 Year: <strong>${escapeHtml(year)}</strong></span>`);
                }
            }
        }

        if (hintStage >= 4) {
            badges.push(`<span class="meta-pill highlight">⏱️ Length: <strong>${formatDuration(selectedTrack.duration)}</strong></span>`);
            badges.push(`<span class="meta-pill highlight">🔤 Initials revealed</span>`);
        }

        if (hintStage >= 5) {
            badges.push(`<span class="meta-pill highlight">🎧 Full 30s snippet</span>`);
        }

        hintBadges.innerHTML = badges.join('');
    }

    // Snippet button label
    const allowedDuration = SNIPPET_DURATIONS[hintStage - 1];
    if (snippetLabel) {
        snippetLabel.textContent = isSnippetPlaying ? `Playing... (${allowedDuration}s)` : `Play snippet (${allowedDuration}s)`;
    }
}

async function playSnippet() {
    if (isSnippetPlaying) {
        stopSnippet();
        return;
    }

    if (selectedTrack && !isPreviewUrlFresh(selectedTrack.preview) && selectedTrack.id) {
        await fetchTrackDetails(selectedTrack.id);
    }

    if (!selectedTrack || !selectedTrack.preview) {
        alert('Audio snippet preview unavailable for this track.');
        return;
    }

    if (snippetAudio) {
        snippetAudio.pause();
    }

    snippetAudio = new Audio(selectedTrack.preview);
    snippetAudio.volume = 0.35;
    const allowedDuration = SNIPPET_DURATIONS[hintStage - 1];

    isSnippetPlaying = true;
    if (snippetPlayBtn) snippetPlayBtn.classList.add('playing');
    if (snippetIcon) snippetIcon.textContent = '❚❚';
    if (snippetLabel) snippetLabel.textContent = `Playing... (${allowedDuration}s)`;
    if (snippetBar) snippetBar.style.width = '0%';

    snippetAudio.play().then(() => {
        snippetProgressAnim = setInterval(() => {
            if (!snippetAudio || snippetAudio.paused) return;
            const current = snippetAudio.currentTime;
            const pct = Math.min(100, (current / allowedDuration) * 100);
            if (snippetBar) snippetBar.style.width = pct + '%';

            if (current >= allowedDuration) {
                stopSnippet();
            }
        }, 50);
    }).catch(err => {
        console.warn('Audio snippet playback blocked:', err);
        stopSnippet();
    });

    snippetAudio.addEventListener('ended', stopSnippet, { once: true });
}

function stopSnippet() {
    if (snippetAudio) {
        snippetAudio.pause();
        snippetAudio.currentTime = 0;
    }
    if (snippetProgressAnim) {
        clearInterval(snippetProgressAnim);
        snippetProgressAnim = null;
    }
    isSnippetPlaying = false;
    if (snippetPlayBtn) snippetPlayBtn.classList.remove('playing');
    if (snippetIcon) snippetIcon.textContent = '▶';
    if (snippetBar) snippetBar.style.width = '0%';
    if (snippetLabel) {
        const allowedDuration = SNIPPET_DURATIONS[hintStage - 1];
        snippetLabel.textContent = `Play snippet (${allowedDuration}s)`;
    }
}

function handleGuess() {
    stopSnippet();
    hideSuggestions();

    const rawGuess = guessInput.value.trim();
    if (!rawGuess) {
        if (guessInputContainer) {
            guessInputContainer.classList.remove('shake');
            void guessInputContainer.offsetWidth;
            guessInputContainer.classList.add('shake');
            setTimeout(() => guessInputContainer.classList.remove('shake'), 450);
        }
        guessInput.focus();
        return;
    }

    const userGuess = normalizeText(rawGuess);
    const correctAnswerOriginal = selectedTrack.title;
    const correctAnswerProcessed = removeParentheses(correctAnswerOriginal).trim();
    const correctAnswer = normalizeText(correctAnswerProcessed);

    guessCount++;

    if (userGuess === correctAnswer) {
        attemptHistory.push('correct');
        updateAttemptTracker();
        showFinalInfo();
        return;
    }

    // Incorrect Guess
    attemptHistory.push('wrong');
    guessInput.value = '';

    if (guessInputContainer) {
        guessInputContainer.classList.remove('shake');
        void guessInputContainer.offsetWidth;
        guessInputContainer.classList.add('shake');
        setTimeout(() => guessInputContainer.classList.remove('shake'), 450);
    }

    if (hintStage < 5) {
        hintStage++;
        updateHintsUI();
        renderMysteryTitle();
        guessInput.focus();
    } else {
        // All 5 attempts exhausted
        gaveUp = true;
        showFinalInfo();
    }
}

function skipGuess() {
    stopSnippet();
    hideSuggestions();
    guessInput.value = '';

    guessCount++;

    if (hintStage < 5) {
        attemptHistory.push('skipped');
        hintStage++;
        updateHintsUI();
        renderMysteryTitle();
        guessInput.focus();
    } else {
        attemptHistory.push('skipped');
        gaveUp = true;
        showFinalInfo();
    }
}

function showSuggestions(list) {
    if (!guessSuggestions) return;
    if (!list || list.length === 0) {
        hideSuggestions();
        return;
    }

    suggestionSelectedIndex = -1;
    guessSuggestions.innerHTML = list.map((item, idx) => `
        <li class="guess-suggestion-item" data-index="${idx}" data-title="${escapeHtml(item.title)}">
            <span class="item-title">${escapeHtml(item.title)}</span>
            <span class="item-artist">${escapeHtml(item.artist || '')}</span>
        </li>
    `).join('');

    guessSuggestions.style.display = 'block';

    guessSuggestions.querySelectorAll('.guess-suggestion-item').forEach(itemEl => {
        itemEl.addEventListener('click', () => {
            const title = itemEl.getAttribute('data-title');
            guessInput.value = title;
            hideSuggestions();
            handleGuess();
        });
    });
}

function hideSuggestions() {
    clearTimeout(debounceSuggestTimeout);
    suggestRequestId++;
    if (guessSuggestions) {
        guessSuggestions.style.display = 'none';
        guessSuggestions.innerHTML = '';
    }
    suggestionSelectedIndex = -1;
}

function filterAndShowSuggestions(query) {
    clearTimeout(debounceSuggestTimeout);
    const requestId = ++suggestRequestId;

    if (!query || !query.trim()) {
        hideSuggestions();
        return;
    }

    const rankedMatches = candidateSongs
        .map(s => ({ song: s, rank: getSuggestionMatchRank(s.title, query) }))
        .filter(entry => entry.rank > 0)
        .sort((a, b) => b.rank - a.rank)
        .map(entry => entry.song)
        .slice(0, 6);

    if (rankedMatches.length > 0) {
        showSuggestions(rankedMatches);
    } else if (selectedTrack && selectedTrack.artist && selectedTrack.artist.name) {
        const targetArtistName = selectedTrack.artist.name;
        const currentQuery = query.trim();
        debounceSuggestTimeout = setTimeout(async () => {
            try {
                const searchStr = `${targetArtistName} ${currentQuery}`;
                const res = await fetch(`/tracks?artist=${encodeURIComponent(searchStr)}`);
                if (requestId !== suggestRequestId) return;
                if (res.ok) {
                    const data = await res.json();
                    if (requestId !== suggestRequestId) return;
                    if (data.data && data.data.length > 0) {
                        const fetchedMatches = [];
                        const seen = new Set();
                        data.data.forEach(t => {
                            if (!isTrackBySelectedArtist(t)) return;
                            const clean = removeParentheses(t.title).trim();
                            const key = stripSuggestionPunctuation(clean) || clean.toLowerCase();
                            if (clean && !seen.has(key) && getSuggestionMatchRank(clean, currentQuery) > 0) {
                                seen.add(key);
                                fetchedMatches.push({ title: clean, artist: targetArtistName });
                            }
                        });
                        if (fetchedMatches.length > 0) {
                            showSuggestions(fetchedMatches.slice(0, 6));
                        } else {
                            hideSuggestions();
                        }
                    } else {
                        hideSuggestions();
                    }
                }
            } catch (err) {
                console.warn('Error fetching suggestions:', err);
            }
        }, 250);
    } else {
        hideSuggestions();
    }
}

function removeParentheses(str) {
    return str.replace(/\(.*?\)/g, '').trimEnd() + ' ';
}

/**
 * Binary Field-Packing Link Compressor (inspired by ha.mr / PortalRunner)
 * Compresses challenge state into a compact, URL-safe Base64 token:
 * - 2 bytes: WPM (0-32767, with bit 15 set as v2 flag marker)
 * - 1 byte:  Accuracy (0-100)
 * - 2 bytes: Start Index (0-65535)
 * - 1 byte:  Flags (bit 0: punctuation, bit 1: numbers, bit 2: ad-libs)
 * - 1 byte:  Artist byte-length (0-255)
 * - N bytes: UTF-8 Artist
 * - M bytes: UTF-8 Track
 * 
 * Saves ~37% URL length over plain query parameters while preventing casual tampering.
 */
function encodeChallengeToken(payload) {
    if (!payload || (!payload.artist && !payload.track)) return '';
    try {
        const wpm = Math.max(0, Math.min(32767, payload.wpm ?? 0));
        const acc = Math.max(0, Math.min(255, payload.acc ?? 0));
        const start = Math.max(0, Math.min(65535, payload.start ?? 0));

        const punc = Boolean(payload.punc);
        const num = Boolean(payload.num);
        const adlib = payload.adlib !== undefined ? Boolean(payload.adlib) : true;

        let flags = 0;
        if (punc) flags |= 1;
        if (num) flags |= 2;
        if (adlib) flags |= 4;

        const encoder = new TextEncoder();
        const artistBytes = encoder.encode(payload.artist || '');
        const trackBytes = encoder.encode(payload.track || '');

        if (artistBytes.length > 255) return '';

        const totalLen = 7 + artistBytes.length + trackBytes.length;
        const u8 = new Uint8Array(totalLen);
        // Bit 7 of byte 0 indicates v2 format with conditions flags
        u8[0] = ((wpm >> 8) & 0x7f) | 0x80;
        u8[1] = wpm & 0xff;
        u8[2] = acc & 0xff;
        u8[3] = (start >> 8) & 0xff;
        u8[4] = start & 0xff;
        u8[5] = flags & 0xff;
        u8[6] = artistBytes.length;
        u8.set(artistBytes, 7);
        u8.set(trackBytes, 7 + artistBytes.length);

        let binary = '';
        for (let i = 0; i < u8.length; i++) {
            binary += String.fromCharCode(u8[i]);
        }
        return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    } catch (e) {
        return '';
    }
}

function decodeChallengeToken(token) {
    try {
        if (!token) return null;
        let base64 = token.replace(/-/g, '+').replace(/_/g, '/');
        while (base64.length % 4) base64 += '=';
        const binary = atob(base64);
        const u8 = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
            u8[i] = binary.charCodeAt(i);
        }

        // 1. Binary packed v2 format (with flags byte and bit 7 set on u8[0])
        const isV2 = (u8[0] & 0x80) !== 0;
        if (isV2 && u8.length >= 7) {
            const wpm = ((u8[0] & 0x7f) << 8) | u8[1];
            const acc = u8[2];
            const start = (u8[3] << 8) | u8[4];
            const flags = u8[5];
            const punc = (flags & 1) !== 0;
            const num = (flags & 2) !== 0;
            const adlib = (flags & 4) !== 0;
            const artistLen = u8[6];
            if (u8.length >= 7 + artistLen) {
                const decoder = new TextDecoder();
                const artist = decoder.decode(u8.subarray(7, 7 + artistLen));
                const track = decoder.decode(u8.subarray(7 + artistLen));
                if (artist || track) {
                    return {
                        artist: artist || null,
                        track: track || null,
                        wpm: wpm > 0 ? wpm : null,
                        acc: acc > 0 ? acc : null,
                        start: start >= 0 ? start : null,
                        punc,
                        num,
                        adlib
                    };
                }
            }
        }

        // 2. Binary packed v1 format (legacy 6-byte header, u8[0] < 0x80)
        if (u8.length >= 6) {
            const wpm = (u8[0] << 8) | u8[1];
            const acc = u8[2];
            const start = (u8[3] << 8) | u8[4];
            const artistLen = u8[5];
            if (u8.length >= 6 + artistLen) {
                const decoder = new TextDecoder();
                const artist = decoder.decode(u8.subarray(6, 6 + artistLen));
                const track = decoder.decode(u8.subarray(6 + artistLen));
                if (artist || track) {
                    return {
                        artist: artist || null,
                        track: track || null,
                        wpm: wpm > 0 ? wpm : null,
                        acc: acc > 0 ? acc : null,
                        start: start >= 0 ? start : null,
                        punc: false,
                        num: false,
                        adlib: true
                    };
                }
            }
        }

        // 3. Legacy JSON array fallback
        const decoder = new TextDecoder();
        const jsonStr = decoder.decode(u8);
        const arr = JSON.parse(jsonStr);
        if (Array.isArray(arr) && arr.length >= 2) {
            return {
                artist: arr[0] || null,
                track: arr[1] || null,
                wpm: (arr[2] !== null && arr[2] !== undefined && !isNaN(arr[2])) ? Number(arr[2]) : null,
                acc: (arr[3] !== null && arr[3] !== undefined && !isNaN(arr[3])) ? Number(arr[3]) : null,
                start: (arr[4] !== null && arr[4] !== undefined && !isNaN(arr[4])) ? Number(arr[4]) : null,
                punc: arr[5] !== undefined ? Boolean(arr[5]) : false,
                num: arr[6] !== undefined ? Boolean(arr[6]) : false,
                adlib: arr[7] !== undefined ? Boolean(arr[7]) : true
            };
        }
    } catch (e) {
        return null;
    }
    return null;
}

function generateChallengeUrl(trackTitle, artistName, wpm, acc, startIndex, options = null) {
    const origin = (typeof window !== 'undefined' && window.location && window.location.origin && window.location.origin !== 'null' && !window.location.origin.startsWith('file:'))
        ? window.location.origin
        : 'https://type.vincentchan.uk';
    const pathname = '/';

    const punc = (options && options.punc !== undefined)
        ? Boolean(options.punc)
        : Boolean(removePunctuationCheckbox ? removePunctuationCheckbox.checked : false);
    const num = (options && options.num !== undefined)
        ? Boolean(options.num)
        : Boolean(includeNumbersCheckbox ? includeNumbersCheckbox.checked : false);
    const adlib = (options && options.adlib !== undefined)
        ? Boolean(options.adlib)
        : Boolean(removeAdlibsCheckbox ? removeAdlibsCheckbox.checked : true);

    const token = encodeChallengeToken({
        artist: artistName,
        track: trackTitle,
        wpm,
        acc,
        start: startIndex,
        punc,
        num,
        adlib
    });
    if (token) {
        return `${origin}${pathname}?c=${token}`;
    }
    const params = new URLSearchParams();
    if (artistName) params.set('artist', artistName);
    if (trackTitle) params.set('track', trackTitle);
    if (wpm !== undefined && wpm !== null && !isNaN(wpm)) params.set('wpm', wpm);
    if (acc !== undefined && acc !== null && !isNaN(acc)) params.set('acc', acc);
    if (startIndex !== undefined && startIndex !== null && !isNaN(startIndex) && startIndex >= 0) params.set('start', startIndex);
    if (punc) params.set('punc', '1');
    if (num) params.set('num', '1');
    if (!adlib) params.set('adlib', '0');
    return `${origin}${pathname}?${params.toString()}`;
}

function generateShareText() {
    const trackTitle = selectedTrack ? selectedTrack.title : 'Unknown';
    const artistName = (selectedTrack && selectedTrack.artist) ? selectedTrack.artist.name : 'Unknown';
    const acc = finalAccuracy ?? calculateAccuracy();
    const wpm = finalWPM ?? calculateWPM();

    let guessLine = '';
    let emojiGrid = '';

    if (isSharedGame || currentGameMode === 'song') {
        guessLine = '⚡ Direct Song Practice';
        emojiGrid = ''; // Direct search or shared game skips song guessing, no boxes to display
    } else if (gaveUp) {
        guessLine = '🎯 Song revealed';
        emojiGrid = '🟥🟥🟥🟥🟥';
    } else {
        const tries = attemptHistory.length || guessCount || 1;
        guessLine = tries === 1 ? '🎯 Guessed in 1 try!' : `🎯 Guessed in ${tries} tries!`;
        const blocks = attemptHistory.map(a => {
            if (a === 'correct') return '🟩';
            if (a === 'wrong') return '🟥';
            if (a === 'skipped') return '⬛';
            return '🟥';
        });
        while (blocks.length < 5) {
            blocks.push('⬜');
        }
        emojiGrid = blocks.join('');
    }

    const currentPunc = removePunctuationCheckbox ? removePunctuationCheckbox.checked : false;
    const currentNum = includeNumbersCheckbox ? includeNumbersCheckbox.checked : false;
    const currentAdlib = removeAdlibsCheckbox ? removeAdlibsCheckbox.checked : true;
    const shareUrl = generateChallengeUrl(trackTitle, artistName, wpm, acc, currentStartIndex, {
        punc: currentPunc,
        num: currentNum,
        adlib: currentAdlib
    });
    const invite = (gaveUp || isSharedGame || currentGameMode === 'song') ? `Beat my score: ${shareUrl}` : `Can you beat me? ${shareUrl}`;

    const lines = [
        '🎵 TuneTyper',
        `🎤 "${trackTitle}" — ${artistName}`,
        `⚡ ${wpm} WPM | ${acc}% Acc`,
        guessLine,
        emojiGrid,
        invite
    ].filter(line => line && line.trim().length > 0);

    return lines.join('\n');
}

async function copyShareScore() {
    const text = generateShareText();
    let copied = false;

    if (navigator.clipboard && navigator.clipboard.writeText) {
        try {
            await navigator.clipboard.writeText(text);
            copied = true;
        } catch (err) {
            console.warn('navigator.clipboard.writeText failed, falling back:', err);
        }
    }

    if (!copied) {
        try {
            const textarea = document.createElement('textarea');
            textarea.value = text;
            textarea.setAttribute('readonly', '');
            textarea.style.position = 'fixed';
            textarea.style.left = '-9999px';
            textarea.style.top = '-9999px';
            document.body.appendChild(textarea);
            textarea.focus();
            textarea.select();
            copied = document.execCommand('copy');
            document.body.removeChild(textarea);
        } catch (err) {
            console.error('Fallback copy failed:', err);
        }
    }

    const shareBtn = document.getElementById('share-score-btn');
    if (shareBtn) {
        const originalText = shareBtn.textContent;
        shareBtn.textContent = copied ? '✓ Copied!' : 'Failed to copy';
        setTimeout(() => {
            shareBtn.textContent = originalText;
        }, 2000);
    }
}

async function copyChallengeLink() {
    const trackTitle = selectedTrack ? selectedTrack.title : '';
    const artistName = (selectedTrack && selectedTrack.artist) ? selectedTrack.artist.name : '';
    const wpm = finalWPM ?? calculateWPM();
    const acc = finalAccuracy ?? calculateAccuracy();
    const punc = removePunctuationCheckbox ? removePunctuationCheckbox.checked : false;
    const num = includeNumbersCheckbox ? includeNumbersCheckbox.checked : false;
    const adlib = removeAdlibsCheckbox ? removeAdlibsCheckbox.checked : true;
    const url = generateChallengeUrl(trackTitle, artistName, wpm, acc, currentStartIndex, { punc, num, adlib });

    let copied = false;

    if (navigator.clipboard && navigator.clipboard.writeText) {
        try {
            await navigator.clipboard.writeText(url);
            copied = true;
        } catch (err) {
            console.warn('navigator.clipboard.writeText failed, falling back:', err);
        }
    }

    if (!copied) {
        try {
            const textarea = document.createElement('textarea');
            textarea.value = url;
            textarea.setAttribute('readonly', '');
            textarea.style.position = 'fixed';
            textarea.style.left = '-9999px';
            textarea.style.top = '-9999px';
            document.body.appendChild(textarea);
            textarea.focus();
            textarea.select();
            copied = document.execCommand('copy');
            document.body.removeChild(textarea);
        } catch (err) {
            console.error('Fallback copy failed:', err);
        }
    }

    const challengeBtn = document.getElementById('share-challenge-btn');
    if (challengeBtn) {
        const originalText = challengeBtn.textContent;
        challengeBtn.textContent = copied ? '✓ Copied!' : 'Failed to copy';
        setTimeout(() => {
            challengeBtn.textContent = originalText;
        }, 2000);
    }
}

function showFinalInfo() {
    stopSnippet();
    hideSuggestions();

    if (finalWPM === null || finalWPM === undefined) {
        finalWPM = calculateWPM();
        finalAccuracy = calculateAccuracy();
    }

    let challengeOutcomeHTML = '';
    if (challengerWPM !== null && challengerWPM !== undefined) {
        const diff = finalWPM - challengerWPM;
        if (diff > 0) {
            challengeOutcomeHTML = `<div class="challenge-outcome won">🏆 Challenge Won! You beat ${challengerWPM} WPM by +${diff} WPM (${finalWPM} vs ${challengerWPM} WPM)!</div>`;
        } else if (diff < 0) {
            challengeOutcomeHTML = `<div class="challenge-outcome lost">🥈 Challenge Lost! You were ${Math.abs(diff)} WPM short of the target (${finalWPM} vs ${challengerWPM} WPM).</div>`;
        } else {
            challengeOutcomeHTML = `<div class="challenge-outcome tied">🤝 Challenge Tied! You matched the target of ${finalWPM} WPM!</div>`;
        }
    }

    const trackTitle = selectedTrack ? selectedTrack.title : 'Unknown';
    const artistName = (selectedTrack && selectedTrack.artist) ? selectedTrack.artist.name : 'Unknown';
    const albumCover = (selectedTrack && selectedTrack.album && selectedTrack.album.cover_medium) || '/favicon/apple-touch-icon.png';
    const albumTitle = (selectedTrack && selectedTrack.album && selectedTrack.album.title) || trackTitle;
    const trackPreview = (selectedTrack && selectedTrack.preview) || '';

    const formatLyricsHtml = (str) => String(str || '').replace(/\r/g, '\n').replace(/\n\n/g, '<br>').replace(/\n/g, '<br>');

    let infoHTML = `
        ${challengeOutcomeHTML}
        <div class="final-results">
            <div class="final-media-col">
                <div class="final-track-header">
                    <h3 class="final-track-title">${escapeHtml(trackTitle)}</h3>
                    <p class="final-track-artist">${escapeHtml(artistName)}</p>
                </div>
                <img id="album-image" class="final-album-art" src="${albumCover}" alt="${escapeHtml(albumTitle)}">
                <audio id="song-preview" class="final-audio-player" controls>
                    <source src="${trackPreview}" type="audio/mpeg">
                    Your browser does not support the audio element.
                </audio>
            </div>

            <div class="final-content-col">
                <div class="lyrics-box">
                    <div id="display-lyrics" class="display-lyrics">
                        ${formatLyricsHtml(sectionOne)}
                        <div class="selectedLyrics">${formatLyricsHtml(sectionSelected)}</div>
                        ${formatLyricsHtml(sectionTwo)}
                    </div>
                </div>
                <div class="share-container">
                    <button id="share-score-btn" class="share-btn" type="button">📋 Share Score</button>
                    <button id="share-challenge-btn" class="share-btn challenge-link-btn" type="button">Copy Link</button>
                    <button id="play-again-btn" class="share-btn play-again-btn" type="button">↻ Next Song</button>
                </div>
            </div>
        </div>
    `;

    if (songInfo) songInfo.innerHTML = infoHTML;
    if (guessSection) guessSection.style.display = 'none';

    if (typeof document !== 'undefined') {
        const shareBtn = document.getElementById('share-score-btn');
        if (shareBtn) {
            shareBtn.addEventListener('click', copyShareScore);
        }

        const challengeBtn = document.getElementById('share-challenge-btn');
        if (challengeBtn) {
            challengeBtn.addEventListener('click', copyChallengeLink);
        }

        const playAgainBtn = document.getElementById('play-again-btn');
        if (playAgainBtn) {
            playAgainBtn.addEventListener('click', () => {
                if (typeof window !== 'undefined' && typeof window.scrollTo === 'function') {
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                }
                if (startBtn) startBtn.click();
            });
        }

        const audioElement = document.getElementById('song-preview');
        if (audioElement) {
            audioElement.volume = 0.25;
        }

        // Bring the highlighted (typed) lyrics into view inside the lyrics box
        scrollToSelectedLyrics();
        // The album art changes the lyrics box width once loaded, which reflows the text, so re-align then
        const albumImage = document.getElementById('album-image');
        if (albumImage && !albumImage.complete && typeof albumImage.addEventListener === 'function') {
            albumImage.addEventListener('load', scrollToSelectedLyrics, { once: true });
        }
    }
}

function scrollToSelectedLyrics() {
    if (!songInfo || typeof songInfo.querySelector !== 'function') return;
    const lyricsBox = songInfo.querySelector('.lyrics-box');
    const selected = lyricsBox && lyricsBox.querySelector('.selectedLyrics');
    if (!selected || typeof lyricsBox.scrollTo !== 'function') return;

    // Centre the selection vertically (or align its top if it's taller than the box)
    const offset = Math.max(0, (lyricsBox.clientHeight - selected.offsetHeight) / 2);
    lyricsBox.scrollTo({ top: Math.max(0, selected.offsetTop - offset), behavior: 'smooth' });
}

function endGame() {
    endTime = new Date();
    stopWPMUpdater();
    if (typingArea) {
        typingArea.disabled = true;
        typingArea.style.display = 'none';
    }
    finalWPM = calculateWPM();
    finalAccuracy = calculateAccuracy();
    if (wpmResult) wpmResult.textContent = `${finalWPM} WPM | ${finalAccuracy}% ACC`;
    //Final WPM
    if (guessSection) guessSection.style.display = 'none';
    if (endGameBtn) endGameBtn.style.display = 'none';

    if (isSharedGame || currentGameMode === 'song') {
        showFinalInfo();
    } else {
        startGuessingPhase();
    }
}

// Event Listeners

if (typeof document !== 'undefined') {
    document.addEventListener('keydown', (event) => {
        // Shift + Enter to restart the game
        if (event.key === 'Enter' && event.shiftKey && typingArea && typingArea.disabled) {
            event.preventDefault();
            if (startBtn) startBtn.click();  // Restart the game
        }
    });
}

function handleTypingInput() {
    if (!startTime) {
        startTime = new Date();
        testStarted = true;
        if (removePunctuationCheckbox) removePunctuationCheckbox.disabled = true;
        if (removeAdlibsCheckbox) removeAdlibsCheckbox.disabled = true;
        if (includeNumbersCheckbox) includeNumbersCheckbox.disabled = true;
        startWPMUpdater();
    }

    if (!typingArea) return;

    // Strip leading whitespace or stray newlines without mutating mid-word IME composition
    const rawInputValue = String(typingArea.value || '');
    const strippedLeading = rawInputValue.replace(/[\r\n]+/g, '').replace(/^[\s\u00A0]+/, '');
    if (strippedLeading !== rawInputValue) {
        typingArea.value = strippedLeading;
    }

    const currentWord = processedWords[currentWordIndex];
    const normalizedCurrentWord = normalizeTextForTyping(currentWord);
    const sanitizedTyped = sanitizeRawTypingValue(strippedLeading);
    const rawTyped = adaptTypedCaseForMobile(sanitizedTyped, normalizedCurrentWord);
    const normalizedTypedText = normalizeTextForTyping(rawTyped); // trimmed
    const endsWithSpace = /\s$/.test(rawTyped);
    const isLastWord = currentWordIndex === processedWords.length - 1;

    // Track typed characters and errors
    if (rawTyped.length > previousRawTyped.length) {
        const addedCount = rawTyped.length - previousRawTyped.length;
        totalKeystrokes += addedCount;
        for (let i = previousRawTyped.length; i < rawTyped.length; i++) {
            const typedChar = rawTyped[i];
            const expectedChar = normalizedCurrentWord[i];
            // If the user typed space immediately after typing the word correctly,
            // this is the required delimiter space to advance words, not an error.
            const isWordAdvancingSpace = (
                typedChar === ' ' &&
                i === normalizedCurrentWord.length &&
                rawTyped.slice(0, i) === normalizedCurrentWord
            );
            if (!isWordAdvancingSpace && (!expectedChar || typedChar !== expectedChar)) {
                errorKeystrokes++;
            }
        }
    }
    previousRawTyped = rawTyped;

    // Like TypeRacer: the word must be correct AND followed by a space to move on.
    // The final word finishes the test as soon as it's typed correctly.
    if (normalizedTypedText === normalizedCurrentWord && (endsWithSpace || isLastWord)) {
        previousRawTyped = '';
        typingArea.value = '';
        if (typingArea.classList) typingArea.classList.remove('incorrect');
        // Clear per-character state on the finished word; it's coloured green as a whole
        renderWordProgress(currentWordIndex, '', false);
        currentWordIndex++;
        updateWordHighlight();

        if (currentWordIndex === processedWords.length) {
            endGame();
        }
        return;
    }

    // Keep trailing spaces so a premature/wrong space shows up as an error
    const typedForDisplay = endsWithSpace
        ? normalizedTypedText + ' '.repeat(rawTyped.match(/\s+$/)[0].length)
        : normalizedTypedText;
    renderWordProgress(currentWordIndex, typedForDisplay);

    if (!normalizedCurrentWord.startsWith(typedForDisplay)) {
        if (typingArea.classList) typingArea.classList.add('incorrect');
    } else {
        if (typingArea.classList) typingArea.classList.remove('incorrect');
    }
}

if (typingArea) {
    typingArea.addEventListener('input', handleTypingInput);
    typingArea.addEventListener('focus', () => {
        syncTypingAreaCaseStyle();
        setTimeout(ensureGameVisibleAboveKeyboard, 180);
    });
}

if (displayText) {
    // Tapping the lyrics box on mobile focuses the typing input (unless selecting text)
    displayText.addEventListener('click', () => {
        if (!typingArea || typingArea.disabled || typingArea.style.display === 'none') return;
        if (typeof window !== 'undefined' && typeof window.getSelection === 'function') {
            const sel = window.getSelection();
            if (sel && String(sel).length > 0) return;
        }
        typingArea.focus();
    });
}

if (typeof window !== 'undefined' && window.visualViewport && typeof window.visualViewport.addEventListener === 'function') {
    window.visualViewport.addEventListener('resize', ensureGameVisibleAboveKeyboard);
}

// Backspace safety net: if the current word is typed correctly but has extra characters after it
// (e.g. "cantl" for "cant"), Ctrl/Alt+Backspace only removes the extras, and a burst of backspaces
// (held key or rapid presses) stops at the correct word instead of eating into it.
// Words with a mistake inside them (e.g. "canlt") get no protection, so muscle memory isn't affected.
const BACKSPACE_BURST_MS = 500;
let backspaceLockUntil = 0;

if (typingArea) {
    typingArea.addEventListener('keydown', (event) => {
        // Only space moves to the next word; on mobile "Done" dismisses the virtual keyboard cleanly
        if (event.key === 'Enter') {
            event.preventDefault();
            if (isMobileInputMode() && typeof typingArea.blur === 'function') {
                typingArea.blur();
            }
            return;
        }
        if (['Control', 'Alt', 'Meta', 'Shift'].includes(event.key)) return;
        if (event.key !== 'Backspace') {
            backspaceLockUntil = 0; // any other key ends the backspace burst
            return;
        }

        const value = typingArea.value;
        const word = processedWords[currentWordIndex];
        const caretAtEnd = typingArea.selectionStart === value.length && typingArea.selectionEnd === value.length;
        if (word === undefined || !caretAtEnd) return; // let normal editing happen for selections etc.

        const expectedWord = normalizeTextForTyping(word);
        const now = performance.now();
        const typed = normalizeTextForTyping(adaptTypedCaseForMobile(sanitizeRawTypingValue(value), expectedWord));
        const hasExtrasAfterCorrectWord = typed.length > word.length && typed.startsWith(word);

        // Already stopped at the correct word during this burst: hold the line
        if (typed === word && (event.repeat || now < backspaceLockUntil)) {
            event.preventDefault();
            backspaceLockUntil = now + BACKSPACE_BURST_MS;
            return;
        }

        if (!hasExtrasAfterCorrectWord) return;

        if (event.ctrlKey || event.altKey || event.metaKey) {
            // Word-delete: strip only the extra characters, keep the correct word
            event.preventDefault();
            typingArea.value = word;
            typingArea.dispatchEvent(new Event('input'));
            backspaceLockUntil = now + BACKSPACE_BURST_MS;
        } else {
            const slicedTyped = normalizeTextForTyping(
                adaptTypedCaseForMobile(sanitizeRawTypingValue(value.slice(0, -1)), expectedWord)
            );
            if (slicedTyped === word) {
                // This plain backspace removes the last extra character; lock further backspaces in the burst
                backspaceLockUntil = now + BACKSPACE_BURST_MS;
            }
        }
    });
}

if (guessInput) {
    guessInput.addEventListener('input', () => {
        filterAndShowSuggestions(guessInput.value);
    });

    guessInput.addEventListener('keydown', (event) => {
        const items = guessSuggestions ? guessSuggestions.querySelectorAll('.guess-suggestion-item') : [];

        if (event.key === 'ArrowDown') {
            if (items.length === 0) return;
            event.preventDefault();
            suggestionSelectedIndex = (suggestionSelectedIndex + 1) % items.length;
            items.forEach((item, idx) => item.classList.toggle('selected', idx === suggestionSelectedIndex));
            if (items[suggestionSelectedIndex]) {
                guessInput.value = items[suggestionSelectedIndex].getAttribute('data-title');
            }
            return;
        }

        if (event.key === 'ArrowUp') {
            if (items.length === 0) return;
            event.preventDefault();
            suggestionSelectedIndex = (suggestionSelectedIndex - 1 + items.length) % items.length;
            items.forEach((item, idx) => item.classList.toggle('selected', idx === suggestionSelectedIndex));
            if (items[suggestionSelectedIndex]) {
                guessInput.value = items[suggestionSelectedIndex].getAttribute('data-title');
            }
            return;
        }

        if (event.key === 'Enter') {
            event.preventDefault();
            hideSuggestions();
            handleGuess();
            return;
        }

        if (event.key === 'Escape') {
            hideSuggestions();
            return;
        }
    });
}

if (guessSubmitBtn) {
    guessSubmitBtn.addEventListener('click', () => {
        hideSuggestions();
        handleGuess();
    });
}

if (skipBtn) {
    skipBtn.addEventListener('click', skipGuess);
}

if (snippetPlayBtn) {
    snippetPlayBtn.addEventListener('click', playSnippet);
}

if (typeof document !== 'undefined') {
    document.addEventListener('click', (event) => {
        if (!event.target.closest('.guess-input-wrapper')) {
            hideSuggestions();
        }
    });
}

if (removePunctuationCheckbox) {
    removePunctuationCheckbox.addEventListener('change', () => {
        syncTypingAreaCaseStyle();
        if (!testStarted) updateDisplayedText();
    });
}

if (removeAdlibsCheckbox) {
    removeAdlibsCheckbox.addEventListener('change', () => {
        if (!testStarted) updateDisplayedText();
    });
}

if (includeNumbersCheckbox) {
    includeNumbersCheckbox.addEventListener('change', () => {
        if (!testStarted) updateDisplayedText();
    });
}

function normOmnibox(str) {
    return String(str || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();
}

function getArtistOmniboxRank(artistName, qNorm) {
    if (!artistName || !qNorm) return 0;
    const aNorm = normOmnibox(artistName);
    if (!aNorm) return 0;
    if (aNorm === qNorm) return 100;
    if (aNorm.startsWith(qNorm)) return 85;
    const words = aNorm.split(' ');
    if (words.some(w => w.startsWith(qNorm))) return 70;
    if (aNorm.includes(qNorm)) return 55;
    return 0;
}

function getSongOmniboxRank(track, qNorm) {
    if (!track || !track.title || !qNorm) return 0;
    const tNorm = normOmnibox(track.title);
    const aNorm = normOmnibox(track.artist || '');
    if (!tNorm) return 0;

    // When the query matches the artist's name, surface their songs right underneath the ARTIST row
    if (aNorm && aNorm === qNorm) return 60;

    const combined = `${aNorm} ${tNorm}`.trim();
    const reversed = `${tNorm} ${aNorm}`.trim();
    if (combined === qNorm || reversed === qNorm) return 98;
    if (tNorm === qNorm) return 95;
    if (tNorm.startsWith(qNorm)) return 82;

    const qTokens = qNorm.split(' ').filter(Boolean);
    const allTokensMatch = qTokens.every(tok =>
        combined.split(' ').some(w => w.startsWith(tok)) || combined.includes(tok)
    );
    if (allTokensMatch) return 75;
    return 0;
}

function buildOmniboxSuggestions(query, remoteData = null) {
    const raw = String(query || '').trim();
    if (!raw) return [];

    // Strip " - " separator if user previously selected "Artist - Song"
    const qNorm = normOmnibox(raw.replace(/\s+-\s+/g, ' '));
    if (!qNorm) return [];

    // 1. Collect & rank matching ARTIST rows (defaulted to top)
    const artistMap = new Map();
    const addCandidateArtist = (name, picture = '', id = null) => {
        if (!name) return;
        const key = normOmnibox(name);
        if (!key) return;
        const existing = artistMap.get(key);
        if (!existing || (!existing.picture && picture) || (!existing.id && id)) {
            artistMap.set(key, {
                id: id || (existing ? existing.id : null),
                name,
                picture: picture || (existing ? existing.picture : '')
            });
        }
    };

    CURATED_ARTIST_NAMES.forEach(name => addCandidateArtist(name));
    if (previousArtist) addCandidateArtist(previousArtist);
    if (remoteData && Array.isArray(remoteData.artists)) {
        remoteData.artists.forEach(a => addCandidateArtist(a.name, a.picture, a.id));
    }

    const rankedArtists = [];
    for (const cand of artistMap.values()) {
        const rank = getArtistOmniboxRank(cand.name, qNorm);
        if (rank > 0) {
            rankedArtists.push({
                type: 'artist',
                ...(cand.id ? { id: cand.id } : {}),
                name: cand.name,
                picture: cand.picture,
                rank
            });
        }
    }
    rankedArtists.sort((a, b) => b.rank - a.rank || a.name.localeCompare(b.name));
    const topArtists = rankedArtists.slice(0, 2);

    // 2. Collect & rank matching SONG rows
    const songMap = new Map();
    const addCandidateSong = (title, artist, cover = '') => {
        const cleanTitle = removeParentheses(String(title || '')).trim() || String(title || '').trim();
        const cleanArtist = String(artist || '').trim();
        if (!cleanTitle || !cleanArtist) return;
        const key = `${normOmnibox(cleanArtist)}::${normOmnibox(cleanTitle)}`;
        if (!songMap.has(key)) {
            songMap.set(key, { title: cleanTitle, artist: cleanArtist, cover: cover || '' });
        }
    };

    if (Array.isArray(artistTracks)) {
        artistTracks.forEach(t => {
            if (t && t.title && t.artist && t.artist.name) {
                addCandidateSong(t.title, t.artist.name, (t.album && t.album.cover_small) || '');
            }
        });
    }
    if (remoteData && Array.isArray(remoteData.tracks)) {
        remoteData.tracks.forEach(t => addCandidateSong(t.title, t.artist, t.cover));
    }

    const rankedSongs = [];
    for (const cand of songMap.values()) {
        const rank = getSongOmniboxRank(cand, qNorm);
        if (rank > 0) {
            rankedSongs.push({
                type: 'song',
                title: cand.title,
                artist: cand.artist,
                cover: cand.cover,
                rank
            });
        }
    }
    rankedSongs.sort((a, b) => b.rank - a.rank);

    const maxTotal = 7;
    const topSongs = rankedSongs.slice(0, Math.max(0, maxTotal - topArtists.length));
    return [...topArtists, ...topSongs].sort((a, b) => {
        if (b.rank !== a.rank) return b.rank - a.rank;
        if (a.type !== b.type) return a.type === 'artist' ? -1 : 1;
        return 0;
    });
}

function syncShelfVisibility(targetArtistName, activeTrackTitle = '') {
    if (typeof document === 'undefined') return;
    const targetArtistNorm = targetArtistName ? normOmnibox(targetArtistName) : '';
    const activeTrackNorm = activeTrackTitle ? normOmnibox(activeTrackTitle) : '';
    document.querySelectorAll('.artist-track-card').forEach(btn => {
        const cardTrackNorm = normOmnibox(btn.getAttribute ? (btn.getAttribute('data-track') || '') : '');
        const cardArtistNorm = normOmnibox(btn.getAttribute ? (btn.getAttribute('data-artist') || '') : '');
        const isMatch = Boolean(
            activeTrackNorm &&
            cardTrackNorm === activeTrackNorm &&
            (!targetArtistNorm || !cardArtistNorm || cardArtistNorm === targetArtistNorm)
        );
        if (btn.classList) {
            if (isMatch) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        }
    });
    const shelf = document.getElementById('artist-tracks-shelf');
    if (!shelf) return;
    const initialName = (typeof window !== 'undefined' && window.__INITIAL_ARTIST__ && window.__INITIAL_ARTIST__.name)
        ? normOmnibox(window.__INITIAL_ARTIST__.name)
        : '';
    const matchesInitial = Boolean(targetArtistNorm && initialName && targetArtistNorm === initialName);
    shelf.style.display = matchesInitial ? '' : 'none';
}

function hideSearchSuggestions() {
    clearTimeout(debounceOmniboxTimeout);
    omniboxRequestId++;
    omniboxItems = [];
    omniboxSelectedIndex = -1;
    if (searchSuggestions) {
        searchSuggestions.style.display = 'none';
        searchSuggestions.innerHTML = '';
    }
}

function updateOmniboxSelectionUI() {
    if (!searchSuggestions) return;
    const rows = searchSuggestions.querySelectorAll('.search-suggestion-item');
    rows.forEach((el, idx) => {
        if (idx === omniboxSelectedIndex) {
            el.classList.add('selected');
            if (typeof el.scrollIntoView === 'function') {
                el.scrollIntoView({ block: 'nearest' });
            }
        } else {
            el.classList.remove('selected');
        }
    });
}

async function selectOmniboxItem(item) {
    if (!item) return;
    cancelInputTyping(false);
    hideSearchSuggestions();
    stopWPMUpdater();

    if (item.type === 'artist') {
        if (artistInput) artistInput.value = item.name;
        syncArtistClearButton();
        syncShelfVisibility(item.name);
        if (startBtn) startBtn.disabled = true;
        resetGame();
        try {
            await handleArtistSearch(item.name, item.id || null);
            if (typingArea && !typingArea.disabled) typingArea.focus();
        } catch (error) {
            alert(error.message);
        } finally {
            if (startBtn) startBtn.disabled = false;
        }
    } else {
        const displayLabel = `${item.artist} - ${item.title}`;
        if (artistInput) artistInput.value = displayLabel;
        syncArtistClearButton();
        syncShelfVisibility(item.artist, item.title);
        if (startBtn) startBtn.disabled = true;
        resetGame();
        try {
            await handleSongSearch(`${item.artist} ${item.title}`, item.artist, item.title);
            if (typingArea && !typingArea.disabled) typingArea.focus();
        } catch (error) {
            alert(error.message);
        } finally {
            if (startBtn) startBtn.disabled = false;
        }
    }
}

function renderSearchSuggestions(items) {
    if (!searchSuggestions) return;
    omniboxItems = items || [];
    if (omniboxItems.length === 0) {
        searchSuggestions.style.display = 'none';
        searchSuggestions.innerHTML = '';
        omniboxSelectedIndex = -1;
        return;
    }

    omniboxSelectedIndex = 0; // Default top result highlighted so Enter selects the top ARTIST or SONG
    searchSuggestions.innerHTML = omniboxItems.map((item, idx) => {
        const isArtist = item.type === 'artist';
        const thumbHtml = item.cover || item.picture
            ? `<img src="${escapeHtml(item.cover || item.picture)}" alt="" class="search-item-thumb ${isArtist ? 'artist-thumb' : ''}" loading="lazy">`
            : '';
        const primary = isArtist ? escapeHtml(item.name) : escapeHtml(item.title);
        const secondary = isArtist ? '' : `<span class="search-item-secondary">${escapeHtml(item.artist)}</span>`;
        const badgeClass = isArtist ? 'badge-artist' : 'badge-song';
        const badgeLabel = isArtist ? 'ARTIST' : 'SONG';

        return `
            <li class="search-suggestion-item${idx === 0 ? ' selected' : ''}" role="option" data-index="${idx}">
                <span class="search-item-main">
                    ${thumbHtml}
                    <span class="search-item-text">
                        <span class="search-item-primary">${primary}</span>
                        ${secondary}
                    </span>
                </span>
                <span class="search-item-badge ${badgeClass}">${badgeLabel}</span>
            </li>
        `;
    }).join('');

    searchSuggestions.style.display = 'block';

    searchSuggestions.querySelectorAll('.search-suggestion-item').forEach((rowEl) => {
        rowEl.addEventListener('mousedown', (e) => {
            // Prevent input blur before click registers
            e.preventDefault();
        });
        rowEl.addEventListener('click', () => {
            const idx = parseInt(rowEl.getAttribute('data-index'), 10);
            if (!isNaN(idx) && omniboxItems[idx]) {
                selectOmniboxItem(omniboxItems[idx]);
            }
        });
    });
}

function triggerOmniboxAutocomplete(rawQuery) {
    clearTimeout(debounceOmniboxTimeout);
    const reqId = ++omniboxRequestId;
    const trimmed = String(rawQuery || '').trim();

    if (!trimmed) {
        hideSearchSuggestions();
        return;
    }

    const cacheKey = normOmnibox(trimmed);
    if (!cacheKey) {
        hideSearchSuggestions();
        return;
    }
    const cachedRemote = omniboxSuggestCache.get(cacheKey) || null;

    // 1. Instant 0ms local render (from curated artists + loaded artistTracks + any cached query)
    const immediate = buildOmniboxSuggestions(trimmed, cachedRemote);
    if (immediate.length > 0) {
        renderSearchSuggestions(immediate);
    }

    if (cachedRemote) return;

    // 2. Debounced fetch to Edge-cached /suggest endpoint using normalized cacheKey so CDN hit rates stay high
    debounceOmniboxTimeout = setTimeout(async () => {
        try {
            const res = await fetch(`/suggest?q=${encodeURIComponent(cacheKey)}`);
            if (reqId !== omniboxRequestId || !res.ok) return;
            const data = await res.json();
            if (reqId !== omniboxRequestId) return;
            omniboxSuggestCache.set(cacheKey, data);
            const merged = buildOmniboxSuggestions(trimmed, data);
            renderSearchSuggestions(merged);
        } catch (err) {
            console.warn('Omnibox suggest error:', err);
        }
    }, 280);
}

async function resolveSearchIntent(rawInput) {
    const trimmed = String(rawInput || '').trim();
    if (!trimmed) return { mode: 'default' };

    // Explicit "Artist - Song" format
    if (trimmed.includes(' - ')) {
        const [artistPart, ...songParts] = trimmed.split(' - ');
        const songPart = songParts.join(' - ').trim();
        if (artistPart.trim() && songPart) {
            return {
                mode: 'song',
                query: `${artistPart.trim()} ${songPart}`,
                artist: artistPart.trim(),
                title: songPart
            };
        }
    }

    const qNorm = normOmnibox(trimmed);

    // Exact match with current loaded artist or curated catalog -> instant Artist Mystery Mode
    if (previousArtist && normOmnibox(previousArtist) === qNorm) {
        return { mode: 'artist', artist: previousArtist };
    }
    const curatedMatch = CURATED_ARTIST_NAMES.find(name => normOmnibox(name) === qNorm);
    if (curatedMatch) {
        return { mode: 'artist', artist: curatedMatch };
    }

    // Consult cached /suggest or fetch /suggest once to distinguish Artist vs Song
    let suggestData = omniboxSuggestCache.get(qNorm) || null;
    if (!suggestData && qNorm) {
        try {
            const res = await fetch(`/suggest?q=${encodeURIComponent(qNorm)}`);
            if (res.ok) {
                suggestData = await res.json();
                omniboxSuggestCache.set(qNorm, suggestData);
            }
        } catch (_) {}
    }

    if (suggestData && Array.isArray(suggestData.artists)) {
        const exactArtist = suggestData.artists.find(a => normOmnibox(a.name) === qNorm);
        if (exactArtist) {
            return { mode: 'artist', artist: exactArtist.name, artistId: exactArtist.id || null };
        }
        const prefixArtist = suggestData.artists.find(a => normOmnibox(a.name).startsWith(qNorm));
        if (prefixArtist) {
            const exactSong = Array.isArray(suggestData.tracks)
                ? suggestData.tracks.find(t => normOmnibox(t.title) === qNorm)
                : null;
            if (!exactSong) {
                return { mode: 'artist', artist: prefixArtist.name, artistId: prefixArtist.id || null };
            }
        }
    }

    if (suggestData && Array.isArray(suggestData.tracks) && suggestData.tracks.length > 0) {
        const topItems = buildOmniboxSuggestions(trimmed, suggestData);
        const topSong = topItems.find(i => i.type === 'song') || suggestData.tracks[0];
        if (topSong) {
            return {
                mode: 'song',
                query: `${topSong.artist} ${topSong.title}`,
                artist: topSong.artist,
                title: topSong.title
            };
        }
    }

    // Fallback: treat as artist search
    return { mode: 'artist', artist: trimmed };
}

if (startBtn) {
    startBtn.addEventListener('click', async () => {
        cancelInputTyping(true);
        // If user actively arrow-navigated to a specific dropdown row, honor that selection
        if (
            searchSuggestions &&
            searchSuggestions.style.display === 'block' &&
            omniboxSelectedIndex > 0 &&
            omniboxItems[omniboxSelectedIndex]
        ) {
            await selectOmniboxItem(omniboxItems[omniboxSelectedIndex]);
            return;
        }

        const inputValue = artistInput ? artistInput.value.trim() : '';
        hideSearchSuggestions();
        stopWPMUpdater();

        if (!inputValue) {
            syncShelfVisibility('');
            loadDefaultPlaylist();
            resetGame();
            return;
        }

        startBtn.disabled = true;
        resetGame();

        try {
            const intent = await resolveSearchIntent(inputValue);
            if (intent.mode === 'song') {
                syncShelfVisibility(intent.artist || '', intent.title || '');
                await handleSongSearch(intent.query || inputValue, intent.artist, intent.title);
            } else {
                const targetArtist = intent.artist || inputValue;
                if (artistInput) artistInput.value = targetArtist;
                syncArtistClearButton();
                syncShelfVisibility(targetArtist);
                await handleArtistSearch(targetArtist, intent.artistId || null);
            }
            if (typingArea && !typingArea.disabled) typingArea.focus();
        } catch (error) {
            alert(error.message);
        } finally {
            startBtn.disabled = false;
        }
    });
}

if (artistClearBtn) {
    artistClearBtn.addEventListener('click', (event) => {
        event.preventDefault();
        if (artistInput) {
            artistInput.value = '';
            syncArtistClearButton();
            hideSearchSuggestions();
            artistInput.focus();
        }
    });
}

if (artistInput) {
    artistInput.addEventListener('input', () => {
        syncArtistClearButton();
        cancelInputTyping(false);
        triggerOmniboxAutocomplete(artistInput.value);
    });

    artistInput.addEventListener('focus', () => {
        syncArtistClearButton();
        cancelInputTyping(true);
        if (artistInput.value && artistInput.value.trim()) {
            triggerOmniboxAutocomplete(artistInput.value);
        }
    });

    artistInput.addEventListener('keydown', function(event) {
        const dropdownOpen = Boolean(
            searchSuggestions &&
            searchSuggestions.style.display === 'block' &&
            omniboxItems.length > 0
        );

        if (dropdownOpen && event.key === 'ArrowDown') {
            event.preventDefault();
            omniboxSelectedIndex = (omniboxSelectedIndex + 1) % omniboxItems.length;
            updateOmniboxSelectionUI();
            return;
        }
        if (dropdownOpen && event.key === 'ArrowUp') {
            event.preventDefault();
            omniboxSelectedIndex = (omniboxSelectedIndex - 1 + omniboxItems.length) % omniboxItems.length;
            updateOmniboxSelectionUI();
            return;
        }
        if (event.key === 'Escape') {
            hideSearchSuggestions();
            return;
        }
        if (event.key === 'Enter') {
            event.preventDefault();
            if (dropdownOpen && omniboxSelectedIndex >= 0 && omniboxItems[omniboxSelectedIndex]) {
                selectOmniboxItem(omniboxItems[omniboxSelectedIndex]);
            } else if (startBtn) {
                startBtn.click();
            }
        }
    });
}

if (typeof document !== 'undefined') {
    document.addEventListener('click', (event) => {
        if (!searchSuggestions || searchSuggestions.style.display === 'none') return;
        const wrapper = artistInput && artistInput.closest ? artistInput.closest('.search-omnibox-wrapper') : null;
        if (wrapper && !wrapper.contains(event.target)) {
            hideSearchSuggestions();
        }
    });
}

if (endGameBtn) {
    endGameBtn.addEventListener('click', () => {
        endGame();
    });
}

function parseChallengeParams(queryString) {
    if (!queryString && typeof window !== 'undefined' && window.location) {
        queryString = window.location.search || window.location.hash || '';
    }
    if (!queryString) return null;
    const cleanQuery = queryString.replace(/^[?#]+/, '');
    const params = new URLSearchParams(cleanQuery);

    // Check for compact encoded challenge token (?c= or #c=)
    const token = params.get('c');
    if (token) {
        const decoded = decodeChallengeToken(token);
        if (decoded && (decoded.artist || decoded.track)) {
            return decoded;
        }
    }

    const artist = params.get('artist') || null;
    const track = params.get('track') || null;
    const wpmRaw = params.get('wpm');
    const accRaw = params.get('acc');
    const startRaw = params.get('start');

    const wpm = (wpmRaw && !isNaN(parseInt(wpmRaw, 10))) ? parseInt(wpmRaw, 10) : null;
    const acc = (accRaw && !isNaN(parseInt(accRaw, 10))) ? parseInt(accRaw, 10) : null;
    const start = (startRaw && !isNaN(parseInt(startRaw, 10))) ? parseInt(startRaw, 10) : null;

    const punc = params.has('punc') ? (params.get('punc') === '1' || params.get('punc') === 'true') : false;
    const num = params.has('num') ? (params.get('num') === '1' || params.get('num') === 'true') : false;
    const adlib = params.has('adlib') ? (params.get('adlib') === '1' || params.get('adlib') === 'true') : true;

    if (!artist && !track) return null;
    return { artist, track, wpm, acc, start, punc, num, adlib };
}

async function loadSharedChallenge(artistName, trackTitle, targetStartIndex = null, options = null) {
    resetGame(true);
    isSharedGame = true;
    currentGameMode = 'song';

    // Synchronize typing conditions so challengers play under identical conditions
    if (options) {
        if (options.punc !== undefined && removePunctuationCheckbox) {
            removePunctuationCheckbox.checked = Boolean(options.punc);
        }
        if (options.num !== undefined && includeNumbersCheckbox) {
            includeNumbersCheckbox.checked = Boolean(options.num);
        }
        if (options.adlib !== undefined && removeAdlibsCheckbox) {
            removeAdlibsCheckbox.checked = Boolean(options.adlib);
        }
    }

    // Disable condition toggles during challenge play to prevent changing conditions
    if (removePunctuationCheckbox) removePunctuationCheckbox.disabled = true;
    if (includeNumbersCheckbox) includeNumbersCheckbox.disabled = true;
    if (removeAdlibsCheckbox) removeAdlibsCheckbox.disabled = true;

    const searchQuery = artistName ? `${artistName} ${trackTitle}` : trackTitle;
    cancelInputTyping(false);
    if (artistInput) artistInput.value = artistName ? `${artistName} - ${trackTitle}` : trackTitle;
    syncArtistClearButton();

    updateChallengeBanner();

    startLoadingBar();
    try {
        const normalizedSearchQuery = String(searchQuery || '').trim().toLowerCase();
        const response = await fetch(`/tracks?artist=${encodeURIComponent(normalizedSearchQuery)}`);
        if (!response.ok) throw new Error('Failed to find track on Deezer.');
        const data = await response.json();
        if (!data.data || data.data.length === 0) {
            throw new Error(`Track not found: ${searchQuery}`);
        }

        let match = data.data[0];
        if (trackTitle && artistName) {
            const normTitle = normalizeText(trackTitle);
            const normArtist = normalizeText(artistName);
            const exact = data.data.find(t => 
                normalizeText(t.title).includes(normTitle) ||
                (t.artist && normalizeText(t.artist.name).includes(normArtist))
            );
            if (exact) match = exact;
        }

        selectedTrack = match;
        hydrateSelectedTrackPreview();
        const lyricsArtist = (match.artist && match.artist.name) || artistName || '';
        const lyricsTrack = match.title || trackTitle || '';

        updateChallengeBanner();

        const lyrics = await fetchLyrics(lyricsArtist, lyricsTrack);
        cachedSongLyrics[`${lyricsArtist}-${lyricsTrack}`.toLowerCase()] = { lyrics, track: match };

        typeSection = extractRandomSection(lyrics, 150, 300, targetStartIndex);
        updateDisplayedText();
        if (endGameBtn) endGameBtn.style.display = 'inline-block';
    } catch (error) {
        console.error('Error loading shared challenge:', error);
        stopLoadingBar();
        if (challengeBanner) {
            challengeBanner.style.display = 'flex';
            challengeBanner.innerHTML = `⚠️ Could not load challenge for "<strong>${escapeHtml(trackTitle)}</strong>". <button id="challenge-fallback-btn" style="margin-left:8px;padding:4px 8px;cursor:pointer;background:#333;color:#fff;border:1px solid #555;border-radius:4px;">Play random song</button>`;
            const fallbackBtn = document.getElementById('challenge-fallback-btn');
            if (fallbackBtn) {
                fallbackBtn.addEventListener('click', () => {
                    isSharedGame = false;
                    challengerWPM = null;
                    challengerAcc = null;
                    if (challengeBanner) challengeBanner.style.display = 'none';
                    if (removePunctuationCheckbox) removePunctuationCheckbox.disabled = false;
                    if (includeNumbersCheckbox) includeNumbersCheckbox.disabled = false;
                    if (removeAdlibsCheckbox) removeAdlibsCheckbox.disabled = false;
                    loadDefaultPlaylist();
                });
            }
        }
    } finally {
        stopLoadingBar();
    }
}

function getArtistFromLocationPath(pathname) {
    if (typeof window !== 'undefined' && window.__INITIAL_ARTIST__ && window.__INITIAL_ARTIST__.name) {
        return window.__INITIAL_ARTIST__.name;
    }
    if (!pathname && typeof window !== 'undefined' && window.location) {
        pathname = window.location.pathname;
    }
    if (!pathname || pathname === '/' || pathname === '/index.html') return null;

    const cleanPath = pathname.replace(/^\/+|\/+$/g, '');
    const parts = cleanPath.split('/');
    const slug = (parts.length === 2 && parts[0].toLowerCase() === 'artist') ? parts[1] : (parts.length === 1 ? parts[0] : null);
    if (!slug || slug.includes('.')) return null;

    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/i.test(slug)) return null;
    return slug
        .split('-')
        .filter(Boolean)
        .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
        .join(' ');
}

async function parseAndLoadUrlParameters() {
    if (typeof window === 'undefined' || !window.location) return false;
    const query = window.location.search || window.location.hash || '';
    const parsed = query ? parseChallengeParams(query) : null;

    if (parsed) {
        challengerWPM = parsed.wpm;
        challengerAcc = parsed.acc;
        challengeStartIndex = parsed.start;

        if (parsed.track) {
            isSharedGame = true;
            await loadSharedChallenge(parsed.artist, parsed.track, parsed.start, {
                punc: parsed.punc,
                num: parsed.num,
                adlib: parsed.adlib
            });
            return true;
        } else if (parsed.artist) {
            if (artistInput) artistInput.value = parsed.artist;
            syncArtistClearButton();
            await handleArtistSearch(parsed.artist);
            return true;
        }
    }

    const routeArtist = getArtistFromLocationPath(window.location.pathname);
    if (routeArtist) {
        if (artistInput) artistInput.value = routeArtist;
        syncArtistClearButton();
        try {
            await handleArtistSearch(routeArtist);
            return true;
        } catch (err) {
            console.warn(`Could not load artist route "${routeArtist}", falling back to default playlist:`, err);
            return false;
        }
    }

    return false;
}

function bindArtistTrackCards(typingSpeed = 22) {
    if (typeof document === 'undefined') return;
    const cards = document.querySelectorAll('.artist-track-card');
    cards.forEach((card) => {
        card.addEventListener('click', async () => {
            const artist = card.getAttribute('data-artist') || '';
            const track = card.getAttribute('data-track') || '';
            if (!track) return;

            document.querySelectorAll('.artist-track-card').forEach(btn => {
                if (btn.classList) btn.classList.remove('active');
            });
            if (card.classList) card.classList.add('active');

            const displayLabel = artist ? `${artist} - ${track}` : track;
            hideSearchSuggestions();
            stopWPMUpdater();
            resetGame();
            if (typeof window !== 'undefined' && typeof window.scrollTo === 'function') {
                window.scrollTo({ top: 0, behavior: 'smooth' });
            }
            fakeTypeValue(artistInput, displayLabel, typingSpeed);
            startLoadingBar();

            try {
                const query = artist ? `${artist} ${track}` : track;
                await handleSongSearch(query, artist, track);
                if (typingArea && !typingArea.disabled) typingArea.focus();
            } catch (error) {
                alert(error.message);
            } finally {
                stopLoadingBar();
            }
        });
    });
}

if (typeof window !== 'undefined') {
    window.addEventListener('DOMContentLoaded', async () => {
        const titleElement = document.querySelector('.navbar-title');
        const titleText = 'TuneTyper';
        let index = 0;

        function typeNavbarTitle() {
            if (index < titleText.length) {
                if (titleElement) titleElement.textContent += titleText.charAt(index);
                index++;
                setTimeout(typeNavbarTitle, 75);  
            }
        }

        if (titleElement) titleElement.textContent = '';
        typeNavbarTitle();
        bindArtistTrackCards();
        syncArtistClearButton();
        syncTypingAreaCaseStyle();

        const loadedFromUrl = await parseAndLoadUrlParameters();
        if (!loadedFromUrl) {
            if (artistInput && !isMobileInputMode()) artistInput.focus();
            loadDefaultPlaylist();
        } else if (!isMobileInputMode() && typingArea && !typingArea.disabled) {
            typingArea.focus();
        }
    });
}

// Button Logic
async function handleArtistSearch(artistName, knownArtistId = null) {
    currentGameMode = 'artist';
    if (artistName === previousArtist && artistTracks.length > 0) {
        console.log(`Using cached tracks for artist: ${artistName}`);
    } else {
        console.log(`Fetching tracks for new artist: ${artistName}`);

        const artistId = knownArtistId || await fetchArtistId(artistName);
        if (!artistId) throw new Error('Artist not found.');

        artistTracks = await fetchTopTracks(artistId, 100);
        if (artistTracks.length === 0) throw new Error('No top tracks found.');

        artistCandidateCache[`id:${artistId}`] = artistTracks;
        // Update the cached artist
        previousArtist = artistName;
    }

    await tryFetchLyricsFromTracks(artistTracks);
    ensureSelectedArtistCandidates();
}

async function handleSongSearch(songName, preferredArtist = '', preferredTitle = '') {
    currentGameMode = 'song';
    const cacheKey = songName.toLowerCase().trim();

    if (cachedSongLyrics[cacheKey]) {
        console.log(`Using cached lyrics for: ${songName}`);
        const cachedEntry = cachedSongLyrics[cacheKey];
        const lyricsText = typeof cachedEntry === 'string' ? cachedEntry : cachedEntry.lyrics;
        if (cachedEntry && typeof cachedEntry === 'object' && cachedEntry.track) {
            selectedTrack = cachedEntry.track;
            hydrateSelectedTrackPreview();
        }
        typeSection = extractRandomSection(lyricsText);
        updateDisplayedText();
        if (endGameBtn) endGameBtn.style.display = 'inline-block';
        return; 
    }

    // Zero-API optimization: reuse track metadata if already loaded in artistTracks
    if (preferredTitle && Array.isArray(artistTracks) && artistTracks.length > 0) {
        const targetTitleNorm = normOmnibox(preferredTitle);
        const targetArtistNorm = preferredArtist ? normOmnibox(preferredArtist) : '';
        const inMemoryTrack = artistTracks.find(t =>
            t &&
            (normOmnibox(t.title_short || t.title) === targetTitleNorm || normOmnibox(t.title) === targetTitleNorm) &&
            (!targetArtistNorm || (t.artist && normOmnibox(t.artist.name) === targetArtistNorm))
        );
        if (inMemoryTrack) {
            const trackArtist = inMemoryTrack.artist.name;
            const trackTitle = inMemoryTrack.title;
            const lyrics = await fetchLyrics(trackArtist, trackTitle);
            cachedSongLyrics[cacheKey] = { lyrics, track: inMemoryTrack };
            selectedTrack = inMemoryTrack;
            hydrateSelectedTrackPreview();
            typeSection = extractRandomSection(lyrics);
            updateDisplayedText();
            if (endGameBtn) endGameBtn.style.display = 'inline-block';
            return;
        }
    }

    console.log(`Fetching lyrics for new song: ${songName}`);

    try {
        const normalizedQuery = songName.trim().toLowerCase();
        const response = await fetch(`/tracks?artist=${encodeURIComponent(normalizedQuery)}`);
        const data = await response.json();

        if (!data.data || data.data.length === 0) throw new Error('No matching tracks found for the song.');

        let topSearchResult = data.data[0];
        if (preferredArtist && preferredTitle) {
            const pArtistNorm = normOmnibox(preferredArtist);
            const pTitleNorm = normOmnibox(preferredTitle);
            const exact = data.data.find(t =>
                t.artist &&
                normOmnibox(t.artist.name) === pArtistNorm &&
                (normOmnibox(t.title_short || t.title) === pTitleNorm || normOmnibox(t.title).includes(pTitleNorm))
            );
            if (exact) topSearchResult = exact;
        }

        const trackArtist = topSearchResult.artist.name;
        const trackTitle = topSearchResult.title;

        console.log(`Top result: ${trackTitle} by ${trackArtist}`);

        const lyrics = await fetchLyrics(trackArtist, trackTitle);
        cachedSongLyrics[cacheKey] = { lyrics, track: topSearchResult };

        selectedTrack = topSearchResult;
        hydrateSelectedTrackPreview();

        typeSection = extractRandomSection(lyrics);
        updateDisplayedText();
        endGameBtn.style.display = 'inline-block';
    } catch (error) {
        throw new Error(`Lyrics not found for the song: ${songName}`);
    }
}

async function tryFetchLyricsFromTracks(tracks) {
    const triedTracks = new Set();
    let lyrics = null;

    while (!lyrics && triedTracks.size < tracks.length) {
        
        const randomIndex = Math.floor(Math.random() * tracks.length);
        if (triedTracks.has(randomIndex)) continue;

        triedTracks.add(randomIndex);
        const track = tracks[randomIndex];
        console.log(`Trying track: {track.title} by ${track.artist.name}`);
        try {
            lyrics = await fetchLyrics(track.artist.name, track.title);
            selectedTrack = tracks[randomIndex];
            hydrateSelectedTrackPreview();
        } catch (error) {
            console.warn(`Lyrics not found for track: ${track.title}`);
        }
    }

    if (!lyrics) {
        throw new Error('Failed to fetch lyrics for any track.');
    }

    typeSection = extractRandomSection(lyrics);
    updateDisplayedText();
    if (endGameBtn) endGameBtn.style.display = 'inline-block';
}

// Loading Bar
let loadingInterval = null;
let loadingCount = 0;
let loadingResetTimeout = null;
let loadingBar = null;

if (typeof document !== 'undefined') {
    const loadingBarContainer = document.createElement('div');
    loadingBarContainer.id = 'loading-bar-container';
    loadingBarContainer.style.position = 'fixed';
    loadingBarContainer.style.top = '0';
    loadingBarContainer.style.left = '0';
    loadingBarContainer.style.width = '100%';
    loadingBarContainer.style.height = '4px';
    loadingBarContainer.style.backgroundColor = '#333';
    loadingBarContainer.style.zIndex = '1000';

    loadingBar = document.createElement('div');
    loadingBar.id = 'loading-bar';
    loadingBar.style.width = '0%';
    loadingBar.style.height = '100%';
    loadingBar.style.backgroundColor = '#4caf50';
    loadingBar.style.transition = 'width 0.3s ease-in-out';

    loadingBarContainer.appendChild(loadingBar);
    document.body.prepend(loadingBarContainer);
}

function startLoadingBar() {
    if (!loadingBar) return;
    loadingCount++;
    if (loadingCount > 1) {
        return; // already animating, do not reset or spawn competing timers
    }

    if (loadingResetTimeout) {
        clearTimeout(loadingResetTimeout);
        loadingResetTimeout = null;
    }
    clearInterval(loadingInterval);

    loadingBar.style.transition = 'width 0.3s ease-in-out';
    loadingBar.style.width = '15%';
    let progress = 15;

    loadingInterval = setInterval(() => {
        if (progress < 65) {
            progress += 15;
        } else if (progress < 90) {
            progress += 5;
        }
        if (loadingBar) loadingBar.style.width = progress + '%';
    }, 300);
}

function stopLoadingBar() {
    loadingCount = Math.max(0, loadingCount - 1);
    if (loadingCount > 0) return; // Wait for nested calls to finish

    clearInterval(loadingInterval);
    loadingInterval = null;

    if (!loadingBar) return;
    loadingBar.style.width = '100%';

    if (loadingResetTimeout) clearTimeout(loadingResetTimeout);
    loadingResetTimeout = setTimeout(() => {
        if (loadingCount === 0 && loadingBar) {
            loadingBar.style.transition = 'none';
            loadingBar.style.width = '0%';
            void loadingBar.offsetWidth;
            loadingBar.style.transition = 'width 0.3s ease-in-out';
        }
        loadingResetTimeout = null;
    }, 400);
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        calculateWPM,
        calculateAccuracy,
        normalizeTextForTyping,
        normalizeText,
        resetGame,
        endGame,
        handleTypingInput,
        generateChallengeUrl,
        parseChallengeParams,
        encodeChallengeToken,
        decodeChallengeToken,
        generateShareText,
        extractRandomSection,
        loadSharedChallenge,
        startGuessingPhase,
        renderMysteryTitle,
        updateHintsUI,
        skipGuess,
        handleGuess,
        populateCandidateSongs,
        filterAndShowSuggestions,
        isTrackBySelectedArtist,
        getSuggestionMatchRank,
        getArtistFromLocationPath,
        parseAndLoadUrlParameters,
        buildOmniboxSuggestions,
        resolveSearchIntent,
        omniboxSuggestCache,
        trackDetailsCache,
        isPreviewUrlFresh,
        fetchTrackDetails,
        handleArtistSearch,
        handleSongSearch,
        ensureSelectedArtistCandidates,
        playSnippet,
        showFinalInfo,
        isMobileInputMode,
        sanitizeRawTypingValue,
        adaptTypedCaseForMobile,
        syncArtistClearButton,
        fakeTypeValue,
        getCommonPrefixLength,
        cancelInputTyping,
        bindArtistTrackCards,
        syncShelfVisibility,
        _getState: () => ({
            totalKeystrokes,
            errorKeystrokes,
            previousRawTyped,
            currentWordIndex,
            processedWords,
            startTime,
            endTime,
            finalWPM,
            finalAccuracy,
            isSharedGame,
            currentGameMode,
            previousArtist,
            challengerWPM,
            challengerAcc,
            challengeStartIndex,
            currentStartIndex,
            selectedTrack,
            gaveUp,
            attemptHistory,
            guessCount,
            hintStage,
            artistTracks,
            cachedSongLyrics,
            candidateSongs,
            artistCandidateCache,
            trackExtraDetails,
            mysteryTitle,
            hintCoverImg,
            hintBadges,
            guessSuggestions,
            removePunctuationCheckbox,
            includeNumbersCheckbox,
            removeAdlibsCheckbox,
            mobileInputOverride,
            sectionOne,
            sectionSelected,
            sectionTwo
        }),
        _setState: (state) => {
            if ('totalKeystrokes' in state) totalKeystrokes = state.totalKeystrokes;
            if ('errorKeystrokes' in state) errorKeystrokes = state.errorKeystrokes;
            if ('previousRawTyped' in state) previousRawTyped = state.previousRawTyped;
            if ('currentWordIndex' in state) currentWordIndex = state.currentWordIndex;
            if ('processedWords' in state) processedWords = state.processedWords;
            if ('startTime' in state) startTime = state.startTime;
            if ('endTime' in state) endTime = state.endTime;
            if ('finalWPM' in state) finalWPM = state.finalWPM;
            if ('finalAccuracy' in state) finalAccuracy = state.finalAccuracy;
            if ('isSharedGame' in state) isSharedGame = state.isSharedGame;
            if ('currentGameMode' in state) currentGameMode = state.currentGameMode;
            if ('previousArtist' in state) previousArtist = state.previousArtist;
            if ('challengerWPM' in state) challengerWPM = state.challengerWPM;
            if ('challengerAcc' in state) challengerAcc = state.challengerAcc;
            if ('challengeStartIndex' in state) challengeStartIndex = state.challengeStartIndex;
            if ('currentStartIndex' in state) currentStartIndex = state.currentStartIndex;
            if ('selectedTrack' in state) selectedTrack = state.selectedTrack;
            if ('gaveUp' in state) gaveUp = state.gaveUp;
            if ('attemptHistory' in state) attemptHistory = state.attemptHistory;
            if ('guessCount' in state) guessCount = state.guessCount;
            if ('hintStage' in state) hintStage = state.hintStage;
            if ('artistTracks' in state) artistTracks = state.artistTracks;
            if ('cachedSongLyrics' in state) cachedSongLyrics = state.cachedSongLyrics;
            if ('candidateSongs' in state) candidateSongs = state.candidateSongs;
            if ('artistCandidateCache' in state) artistCandidateCache = state.artistCandidateCache;
            if ('trackExtraDetails' in state) trackExtraDetails = state.trackExtraDetails;
            if ('mobileInputOverride' in state) mobileInputOverride = state.mobileInputOverride;
            if ('sectionOne' in state) sectionOne = state.sectionOne;
            if ('sectionSelected' in state) sectionSelected = state.sectionSelected;
            if ('sectionTwo' in state) sectionTwo = state.sectionTwo;
        }
    };
}