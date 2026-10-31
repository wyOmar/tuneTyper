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
const searchTypeDropdown = typeof document !== 'undefined' ? document.getElementById('search-type') : null;
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
let trackExtraDetails = null;
let suggestionSelectedIndex = -1;
let debounceSuggestTimeout = null;
let suggestRequestId = 0;
// Lyrics variables
let sectionOne = "";
let sectionTwo = "";
let sectionSelected = "";

// API Fetch Functions
async function fetchLyrics(artist, track) {
    startLoadingBar();
    const response = await fetch(`/lyrics?artist=${encodeURIComponent(artist)}&track=${encodeURIComponent(track)}`);
    stopLoadingBar();
    if (!response.ok) throw new Error('Lyrics not found.');
    const data = await response.json();
    if (!data.lyrics) throw new Error('Lyrics unavailable.');
    return data.lyrics;
}

async function fetchArtistId(artistName) {
    // Exists because to fetchTopTracks we need their DeezerID
    // Sometimes the most popular song of the artist we search is a collab song or they are a feature, so we look at the top 5 results to guarantee we get the id of the artist we want
    const response = await fetch(`/tracks?artist=${encodeURIComponent(artistName)}`);
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
    if (searchTypeDropdown) searchTypeDropdown.disabled = false;
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
    const removePunctuation = !removePunctuationCheckbox.checked;
    const removeAdlibs = !removeAdlibsCheckbox.checked;
    const removeNumbers = !includeNumbersCheckbox.checked;
    const textToDisplay = normalizeTextForTyping(typeSection, removePunctuation, removeAdlibs, removeNumbers);
    processedWords = textToDisplay.split(/\s+/).filter(Boolean);

    displayText.innerHTML = processedWords
        .map((word, index) => `<span id="word-${index}" class="word">${escapeHtml(word)}</span>`)
        .join(' ');
    displayText.scrollTop = 0;

    updateWordHighlight();
    typingArea.disabled = false;
    typingArea.focus();
}

function updateWordHighlight() {
    displayText.querySelectorAll('.word').forEach((span, index) => {
        span.classList.toggle('correct', index < currentWordIndex);
        span.classList.toggle('current', index === currentWordIndex);
    });

    renderWordProgress(currentWordIndex, '');
    scrollCurrentWordIntoView();
}

// Typeracer/Monkeytype-style feedback: colour each character of the word being typed
// green (correct) or red (incorrect), show overflow characters, and draw a caret.
function renderWordProgress(index, typed, showCaret = true) {
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

// Keep the current word visible inside the (fixed-height) display box
function scrollCurrentWordIntoView() {
    const wordElement = document.getElementById(`word-${currentWordIndex}`);
    if (!wordElement) return;

    const top = wordElement.offsetTop;
    const bottom = top + wordElement.offsetHeight;
    const viewTop = displayText.scrollTop;
    const viewBottom = viewTop + displayText.clientHeight;

    if (top < viewTop || bottom > viewBottom) {
        displayText.scrollTop = top - parseFloat(getComputedStyle(displayText).paddingTop);
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
                const raw = typingArea.value.replace(/^\s+/, '');
                const currentWord = processedWords[currentWordIndex] || '';
                const expected = normalizeTextForTyping(currentWord);
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

async function fetchTrackDetails(trackId) {
    trackExtraDetails = null;
    if (!trackId) return;
    try {
        const res = await fetch(`/track-details?trackId=${encodeURIComponent(trackId)}`);
        if (res.ok) {
            trackExtraDetails = await res.json();
            if (guessSection.style.display !== 'none') {
                updateHintsUI();
            }
        }
    } catch (err) {
        console.warn('Could not fetch track details:', err);
    }
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

function playSnippet() {
    if (!selectedTrack || !selectedTrack.preview) {
        alert('Audio snippet preview unavailable for this track.');
        return;
    }

    if (isSnippetPlaying) {
        stopSnippet();
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
    const pathname = (typeof window !== 'undefined' && window.location && window.location.pathname) ? window.location.pathname : '/';

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
    const searchType = searchTypeDropdown ? searchTypeDropdown.value : 'artist';

    let guessLine = '';
    let emojiGrid = '';

    if (isSharedGame || searchType === 'song') {
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
    const invite = (gaveUp || isSharedGame || searchType === 'song') ? `Beat my score: ${shareUrl}` : `Can you beat me? ${shareUrl}`;

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

    let infoHTML = `
         <div style="display: flex; align-items: flex-start;">
            <!-- Album Art Section -->
            <div style="flex-shrink: 0; margin-right: 20px; width: 250px;">
                <h3 style="margin-bottom: 10px;">${escapeHtml(trackTitle)} <br> <span style="font-size: 16px; color: #aaa; font-weight: normal;">${escapeHtml(artistName)}</span></h3>
                <img id="album-image" src="${albumCover}" alt="${escapeHtml(albumTitle)}" style="width: 250px; height: 250px; border-radius: 8px; object-fit: cover;">
                <audio id="song-preview" controls style="width: 100%; margin-top: 12px;">
                    <source src="${trackPreview}" type="audio/mpeg">
                    Your browser does not support the audio element.
                </audio>
            </div>

            <!-- Lyrics Section & Share Score Underneath -->
            <div style="flex: 1; min-width: 0; display: flex; flex-direction: column;">
                ${challengeOutcomeHTML}
                <div class="lyrics-box" style="margin-bottom: 10px;">
                    <p id="display-lyrics" class="display-lyrics">
                        ${sectionOne.replace(/\r/g, '\n').replace(/\n\n/g, '<br>').replace(/\n/g, '<br>')}
                        <div class="selectedLyrics">${sectionSelected.replace(/\r/g, '\n').replace(/\n\n/g, '<br>').replace(/\n/g, '<br>')}</div>
                        ${sectionTwo.replace(/\r/g, '\n').replace(/\n\n/g, '<br>').replace(/\n/g, '<br>')}
                    </p>
                </div>
                <div class="share-container">
                    <button id="share-score-btn" class="share-btn">📋 Share Score</button>
                    <button id="share-challenge-btn" class="share-btn challenge-link-btn">🔗 Copy Challenge Link</button>
                </div>
            </div>
        </div>
    `;

    songInfo.innerHTML = infoHTML;
    guessSection.style.display = 'none';
    searchTypeDropdown.disabled = false;

    const shareBtn = document.getElementById('share-score-btn');
    if (shareBtn) {
        shareBtn.addEventListener('click', copyShareScore);
    }

    const challengeBtn = document.getElementById('share-challenge-btn');
    if (challengeBtn) {
        challengeBtn.addEventListener('click', copyChallengeLink);
    }

    const audioElement = document.getElementById('song-preview');
    if (audioElement) {
        audioElement.volume = 0.25;
    }

    // Bring the highlighted (typed) lyrics into view inside the lyrics box
    scrollToSelectedLyrics();
    // The album art changes the lyrics box width once loaded, which reflows the text, so re-align then
    const albumImage = document.getElementById('album-image');
    if (albumImage && !albumImage.complete) {
        albumImage.addEventListener('load', scrollToSelectedLyrics, { once: true });
    }
}

function scrollToSelectedLyrics() {
    const lyricsBox = songInfo.querySelector('.lyrics-box');
    const selected = lyricsBox && lyricsBox.querySelector('.selectedLyrics');
    if (!selected) return;

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

    const searchType = searchTypeDropdown ? searchTypeDropdown.value : 'artist';
    if (isSharedGame || searchType === "song") {
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
        if (searchTypeDropdown) searchTypeDropdown.disabled = true;
        startWPMUpdater();
    }

    if (!typingArea) return;

    // Ignore leading whitespace (e.g. a stray space at the start of a word)
    const rawTyped = typingArea.value.replace(/^\s+/, '');
    if (rawTyped !== typingArea.value) typingArea.value = rawTyped;

    const currentWord = processedWords[currentWordIndex];
    const normalizedTypedText = normalizeTextForTyping(rawTyped); // trimmed
    const normalizedCurrentWord = normalizeTextForTyping(currentWord);
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
            if (searchTypeDropdown) searchTypeDropdown.disabled = false;
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

    // wpmResult.textContent = `${calculateWPM()}`;
    // //CurrentWPM
}

if (typingArea) {
    typingArea.addEventListener('input', handleTypingInput);
}

// Backspace safety net: if the current word is typed correctly but has extra characters after it
// (e.g. "cantl" for "cant"), Ctrl/Alt+Backspace only removes the extras, and a burst of backspaces
// (held key or rapid presses) stops at the correct word instead of eating into it.
// Words with a mistake inside them (e.g. "canlt") get no protection, so muscle memory isn't affected.
const BACKSPACE_BURST_MS = 500;
let backspaceLockUntil = 0;

if (typingArea) {
    typingArea.addEventListener('keydown', (event) => {
        // Only space moves to the next word, so don't let Enter insert a newline in the typing box
        if (event.key === 'Enter') {
            event.preventDefault();
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

        const now = performance.now();
        const typed = normalizeTextForTyping(value);
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
        } else if (normalizeTextForTyping(value.slice(0, -1)) === word) {
            // This plain backspace removes the last extra character; lock further backspaces in the burst
            backspaceLockUntil = now + BACKSPACE_BURST_MS;
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

if (startBtn) {
    startBtn.addEventListener('click', async () => {
        const inputValue = artistInput ? artistInput.value.trim() : '';
        const searchType = searchTypeDropdown ? searchTypeDropdown.value : 'artist';
        stopWPMUpdater();

        if (searchType !== 'artist' && searchType !== 'song') {
            searchType = 'artist'; // default
        }

        if (!inputValue) {
            loadDefaultPlaylist();
            resetGame();
            return;
        }

        startBtn.disabled = true;
        resetGame();

        try {
            if (searchType === 'artist') {
                await handleArtistSearch(inputValue);
            } else if (searchType === 'song') {
                await handleSongSearch(inputValue);
            } else {
                throw new Error('Invalid search type selected.');
            }
        } catch (error) {
            alert(error.message);
        } finally {
            startBtn.disabled = false;
        }
    });
}

if (artistInput) {
    artistInput.addEventListener('keydown', function(event) {
        if (event.key === 'Enter') {
            event.preventDefault(); 
            if (startBtn) startBtn.click(); 
        }
    });
}

if (endGameBtn) {
    endGameBtn.addEventListener('click', () => {
        endGame();
        if (searchTypeDropdown) searchTypeDropdown.disabled = false;
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
    if (searchTypeDropdown) searchTypeDropdown.value = 'song';

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
    if (artistInput) artistInput.value = searchQuery;

    updateChallengeBanner();

    startLoadingBar();
    try {
        const response = await fetch(`/tracks?artist=${encodeURIComponent(searchQuery)}`);
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
        const lyricsArtist = (match.artist && match.artist.name) || artistName || '';
        const lyricsTrack = match.title || trackTitle || '';

        updateChallengeBanner();

        const lyrics = await fetchLyrics(lyricsArtist, lyricsTrack);
        cachedSongLyrics[`${lyricsArtist}-${lyricsTrack}`] = lyrics;

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

async function parseAndLoadUrlParameters() {
    if (typeof window === 'undefined' || !window.location || (!window.location.search && !window.location.hash)) return false;
    const query = window.location.search || window.location.hash || '';
    const parsed = parseChallengeParams(query);
    if (!parsed) return false;

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
        if (searchTypeDropdown) searchTypeDropdown.value = 'artist';
        await handleArtistSearch(parsed.artist);
        return true;
    }
    return false;
}

if (typeof window !== 'undefined') {
    window.addEventListener('DOMContentLoaded', async () => {
        if (artistInput) artistInput.focus();
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

        const loadedFromUrl = await parseAndLoadUrlParameters();
        if (!loadedFromUrl) {
            loadDefaultPlaylist();
        }
    });
}

// Button Logic
async function handleArtistSearch(artistName) {
    if (artistName === previousArtist && artistTracks.length > 0) {
        console.log(`Using cached tracks for artist: ${artistName}`);
    } else {
        console.log(`Fetching tracks for new artist: ${artistName}`);

        const artistId = await fetchArtistId(artistName);
        if (!artistId) throw new Error('Artist not found.');

        artistTracks = await fetchTopTracks(artistId);
        if (artistTracks.length === 0) throw new Error('No top tracks found.');

        // Update the cached artist
        previousArtist = artistName;
    }

    await tryFetchLyricsFromTracks(artistTracks);
}

async function handleSongSearch(songName) {
    const cacheKey = songName.toLowerCase().trim();

    if (cachedSongLyrics[cacheKey]) {
        console.log(`Using cached lyrics for: ${songName}`);
        typeSection = extractRandomSection(cachedSongLyrics[cacheKey]);
        updateDisplayedText();
        endGameBtn.style.display = 'inline-block';

        return; 
    }

    console.log(`Fetching lyrics for new song: ${songName}`);

    try {
        const response = await fetch(`/tracks?artist=${encodeURIComponent(songName)}`);
        const data = await response.json();

        if (data.data.length === 0) throw new Error('No matching tracks found for the song.');

        const topSearchResult = data.data[0];
        const trackArtist = topSearchResult.artist.name;
        const trackTitle = topSearchResult.title;

        console.log(`Top result: ${trackTitle} by ${trackArtist}`);

        const lyrics = await fetchLyrics(trackArtist, trackTitle);
        cachedSongLyrics[cacheKey] = lyrics;

        selectedTrack = topSearchResult;

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
        } catch (error) {
            console.warn(`Lyrics not found for track: ${track.title}`);
        }
    }

    if (!lyrics) {
        throw new Error('Failed to fetch lyrics for any track.');
    }

    typeSection = extractRandomSection(lyrics);
    updateDisplayedText();
    endGameBtn.style.display = 'inline-block';
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
            candidateSongs,
            artistCandidateCache,
            trackExtraDetails,
            mysteryTitle,
            hintCoverImg,
            hintBadges,
            guessSuggestions,
            removePunctuationCheckbox,
            includeNumbersCheckbox,
            removeAdlibsCheckbox
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
            if ('candidateSongs' in state) candidateSongs = state.candidateSongs;
            if ('artistCandidateCache' in state) artistCandidateCache = state.artistCandidateCache;
            if ('trackExtraDetails' in state) trackExtraDetails = state.trackExtraDetails;
        }
    };
}