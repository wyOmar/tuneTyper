// Frontend
const artistInput = document.getElementById('artist-input');
const startBtn = document.getElementById('start-btn');
const typingArea = document.getElementById('typing-area');
const displayText = document.getElementById('display-text');
const wpmResult = document.getElementById('wpm-result');
const removePunctuationCheckbox = document.getElementById('remove-punctuation');
const removeAdlibsCheckbox = document.getElementById('remove-adlibs');
const includeNumbersCheckbox = document.getElementById('include-numbers');
const songInfo = document.getElementById('song-info');
const guessSection = document.getElementById('guess-section');
const guessInput = document.getElementById('guess-input');
const guessInputContainer = document.querySelector('.guess-input-container');
const skipBtn = document.getElementById('skip-btn');
const searchTypeDropdown = document.getElementById('search-type');
const endGameBtn = document.getElementById('end-game-btn');

// Hint Elements
const mysteryTitle = document.getElementById('mystery-title');
const hintStageBadge = document.getElementById('hint-stage-badge');
const attemptTracker = document.getElementById('attempt-tracker');
const hintCoverImg = document.getElementById('hint-cover-img');
const hintBadges = document.getElementById('hint-badges');
const snippetPlayBtn = document.getElementById('snippet-play-btn');
const snippetIcon = document.getElementById('snippet-icon');
const snippetLabel = document.getElementById('snippet-label');
const snippetBar = document.getElementById('snippet-bar');
const guessSubmitBtn = document.getElementById('guess-submit-btn');
const guessSuggestions = document.getElementById('guess-suggestions');

// Variables
let typeSection = "";
let processedWords = [];
let currentWordIndex = 0;
let startTime = null;
let testStarted = false;
let selectedTrack = null;
let guessCount = 0;
let previousArtist = "";
let artistTracks = [];
let cachedSongLyrics = {};
let wpmInterval;
// Share Score & Accuracy variables
let totalKeystrokes = 0;
let errorKeystrokes = 0;
let previousRawTyped = '';
let finalWPM = 0;
let finalAccuracy = 100;
let gaveUp = false;
// Hint & Snippet variables
let hintStage = 1;
const SNIPPET_DURATIONS = [2, 5, 10, 18, 30];
let snippetAudio = null;
let snippetProgressAnim = null;
let isSnippetPlaying = false;
let attemptHistory = []; // stores 'wrong', 'skipped', or 'correct'
let candidateSongs = [];
let trackExtraDetails = null;
let suggestionSelectedIndex = -1;
let debounceSuggestTimeout = null;
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

async function fetchTopTracks(artistId) {
    const response = await fetch(`/top-tracks?artistId=${artistId}`);
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
function extractRandomSection(text, minLength = 150, maxLength = 300) {
    const lines = text.split(/\n/);
    if (lines.length === 0) return '';

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
function resetGame() {
    currentWordIndex = 0;
    startTime = null;
    testStarted = false;
    guessCount = 0;
    sectionOne = "";
    sectionTwo = "";
    sectionSelected = "";
    totalKeystrokes = 0;
    errorKeystrokes = 0;
    previousRawTyped = '';
    finalWPM = 0;
    finalAccuracy = 100;
    gaveUp = false;
    hintStage = 1;
    attemptHistory = [];
    candidateSongs = [];
    trackExtraDetails = null;
    stopSnippet();
    hideSuggestions();

    typingArea.value = '';
    typingArea.style.display = 'block';
    typingArea.disabled = true;
    displayText.innerHTML = '';
    wpmResult.textContent = '';
    songInfo.innerHTML = '';
    guessSection.style.display = 'none';
    guessInput.value = '';
    if (guessInputContainer) guessInputContainer.classList.remove('shake');
    if (mysteryTitle) mysteryTitle.innerHTML = '';
    removePunctuationCheckbox.disabled = false;
    removeAdlibsCheckbox.disabled = false;
    includeNumbersCheckbox.disabled = false;
    searchTypeDropdown.disabled = false;
    endGameBtn.style.display = 'none';
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
    const elapsedTime = (new Date() - startTime) / 1000;
    return Math.round((currentWordIndex / elapsedTime) * 60);
}

function calculateAccuracy() {
    if (totalKeystrokes === 0) return 100;
    return Math.max(0, Math.min(100, Math.round(((totalKeystrokes - errorKeystrokes) / totalKeystrokes) * 100)));
}

function startWPMUpdater() {
    wpmInterval = setInterval(() => {
        wpmResult.textContent = `${calculateWPM()} WPM`;
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

function populateCandidateSongs() {
    candidateSongs = [];
    const seen = new Set();

    if (artistTracks && artistTracks.length > 0) {
        artistTracks.forEach(t => {
            const clean = removeParentheses(t.title).trim();
            if (clean && !seen.has(clean.toLowerCase())) {
                seen.add(clean.toLowerCase());
                candidateSongs.push({ title: clean, artist: t.artist.name });
            }
        });
    }

    if (selectedTrack) {
        const cleanSelected = removeParentheses(selectedTrack.title).trim();
        if (cleanSelected && !seen.has(cleanSelected.toLowerCase())) {
            seen.add(cleanSelected.toLowerCase());
            candidateSongs.push({ title: cleanSelected, artist: selectedTrack.artist.name });
        }
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

    const summary = `<div style="width: 100%; text-align: center; font-size: 12px; color: #888; margin-top: 6px;">${words.length} word${words.length === 1 ? '' : 's'} • ${totalLetters} letters</div>`;

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

    // Progressive Album Cover
    if (hintCoverImg) {
        if (selectedTrack.album && selectedTrack.album.cover_medium) {
            hintCoverImg.src = selectedTrack.album.cover_medium;
            hintCoverImg.alt = selectedTrack.album.title || 'Album Art';
        }
        hintCoverImg.className = `hint-cover-img blur-stage-${hintStage}`;
    }

    // Progressive Metadata Badges:
    // Hint 1: Artist
    // Hint 2: Artist + Year
    // Hint 3: Artist + Year + Album
    // Hint 4: Artist + Year + Album + Track Length + Word Initials
    // Hint 5: All above + Full 30s audio
    if (hintBadges) {
        const badges = [];
        badges.push(`<span class="meta-pill">🎤 Artist: <strong>${escapeHtml(selectedTrack.artist.name)}</strong></span>`);

        if (hintStage >= 2) {
            if (trackExtraDetails && trackExtraDetails.release_date) {
                const year = trackExtraDetails.release_date.split('-')[0];
                badges.push(`<span class="meta-pill highlight">📅 Year: <strong>${escapeHtml(year)}</strong></span>`);
            } else {
                badges.push(`<span class="meta-pill highlight">💿 Studio Track</span>`);
            }
        }

        if (hintStage >= 3 && selectedTrack.album && selectedTrack.album.title) {
            badges.push(`<span class="meta-pill highlight">💿 Album: <strong>${escapeHtml(selectedTrack.album.title)}</strong></span>`);
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
    if (guessSuggestions) {
        guessSuggestions.style.display = 'none';
        guessSuggestions.innerHTML = '';
    }
    suggestionSelectedIndex = -1;
}

function filterAndShowSuggestions(query) {
    if (!query) {
        hideSuggestions();
        return;
    }

    const q = query.toLowerCase().trim();
    const matches = candidateSongs.filter(s => s.title.toLowerCase().includes(q)).slice(0, 6);

    if (matches.length > 0) {
        showSuggestions(matches);
    } else {
        clearTimeout(debounceSuggestTimeout);
        debounceSuggestTimeout = setTimeout(async () => {
            try {
                const res = await fetch(`/tracks?artist=${encodeURIComponent(query)}`);
                if (res.ok) {
                    const data = await res.json();
                    if (data.data && data.data.length > 0) {
                        const fetchedMatches = [];
                        const seen = new Set();
                        data.data.slice(0, 6).forEach(t => {
                            const clean = removeParentheses(t.title).trim();
                            if (clean && !seen.has(clean.toLowerCase())) {
                                seen.add(clean.toLowerCase());
                                fetchedMatches.push({ title: clean, artist: t.artist.name });
                            }
                        });
                        showSuggestions(fetchedMatches);
                    } else {
                        hideSuggestions();
                    }
                }
            } catch (err) {
                console.warn('Error fetching suggestions:', err);
            }
        }, 250);
    }
}

function removeParentheses(str) {
    return str.replace(/\(.*?\)/g, '').trimEnd() + ' ';
}

function generateShareText() {
    const trackTitle = selectedTrack ? selectedTrack.title : 'Unknown';
    const artistName = selectedTrack && selectedTrack.artist ? selectedTrack.artist.name : 'Unknown';
    const acc = finalAccuracy ?? calculateAccuracy();
    const wpm = finalWPM ?? calculateWPM();
    const searchType = searchTypeDropdown ? searchTypeDropdown.value : 'artist';

    let guessLine = '';
    let emojiGrid = '';

    if (searchType === 'song') {
        guessLine = '⚡ Direct Song Practice';
        emojiGrid = '🟩🟩🟩🟩🟩';
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

    const shareUrl = 'https://type.vincentchan.uk';
    const invite = (gaveUp || searchType === 'song') ? shareUrl : `Can you beat me? ${shareUrl}`;

    return [
        '🎵 TuneTyper',
        `🎤 "${trackTitle}" — ${artistName}`,
        `⚡ ${wpm} WPM | ${acc}% Acc`,
        guessLine,
        emojiGrid,
        invite
    ].join('\n');
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
    const toast = document.getElementById('share-toast');
    if (toast) {
        toast.style.display = 'block';
        toast.textContent = copied ? 'Copied to clipboard!' : 'Failed to copy';
        setTimeout(() => {
            toast.style.display = 'none';
        }, 2500);
    }
    if (shareBtn && copied) {
        const originalText = shareBtn.textContent;
        shareBtn.textContent = '✓ Copied!';
        setTimeout(() => {
            shareBtn.textContent = originalText;
        }, 2000);
    }
}

function showFinalInfo() {
    stopSnippet();
    hideSuggestions();

    if (!finalWPM) {
        finalWPM = calculateWPM();
        finalAccuracy = calculateAccuracy();
    }

    let infoHTML = `
         <div style="display: flex; align-items: flex-start;">
            <!-- Album Art Section -->
            <div style="flex-shrink: 0; margin-right: 20px; width: 250px;">
                <h3 style="margin-bottom: 10px;">${selectedTrack.title} <br> <span style="font-size: 16px; color: #aaa; font-weight: normal;">${selectedTrack.artist.name}</span></h3>
                <img id="album-image" src="${selectedTrack.album.cover_medium}" alt="${selectedTrack.album.title}" style="width: 250px; height: 250px; border-radius: 8px; object-fit: cover;">
                <audio id="song-preview" controls style="width: 100%; margin-top: 12px;">
                    <source src="${selectedTrack.preview}" type="audio/mpeg">
                    Your browser does not support the audio element.
                </audio>
            </div>

            <!-- Lyrics Section & Share Score Underneath -->
            <div style="flex: 1; min-width: 0; display: flex; flex-direction: column;">
                <div class="lyrics-box" style="margin-bottom: 10px;">
                    <p id="display-lyrics" class="display-lyrics">
                        ${sectionOne.replace(/\r/g, '\n').replace(/\n\n/g, '<br>').replace(/\n/g, '<br>')}
                        <div class="selectedLyrics">${sectionSelected.replace(/\r/g, '\n').replace(/\n\n/g, '<br>').replace(/\n/g, '<br>')}</div>
                        ${sectionTwo.replace(/\r/g, '\n').replace(/\n\n/g, '<br>').replace(/\n/g, '<br>')}
                    </p>
                </div>
                <div class="share-container">
                    <button id="share-score-btn" class="share-btn">📋 Share Score</button>
                    <span id="share-toast" class="share-toast" style="display: none;">Copied to clipboard!</span>
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
    stopWPMUpdater();
    typingArea.disabled = true;
    typingArea.style.display = 'none';
    finalWPM = calculateWPM();
    finalAccuracy = calculateAccuracy();
    wpmResult.textContent = `${finalWPM} WPM | ${finalAccuracy}% ACC`;
    //Final WPM
    guessSection.style.display = 'none';
    endGameBtn.style.display = 'none';

    const searchType = searchTypeDropdown.value;
    if (searchType === "song") {
        showFinalInfo();
    } else {
        startGuessingPhase();
    }
}

// Event Listeners

document.addEventListener('keydown', (event) => {
    // Shift + Enter to restart the game
    if (event.key === 'Enter' && event.shiftKey && typingArea.disabled) {
        event.preventDefault();
        startBtn.click();  // Restart the game
    }
});

typingArea.addEventListener('input', () => {
    if (!startTime) {
        startTime = new Date();
        testStarted = true;
        removePunctuationCheckbox.disabled = true;
        removeAdlibsCheckbox.disabled = true;
        includeNumbersCheckbox.disabled = true;
        searchTypeDropdown.disabled = true;
        startWPMUpdater();
    }

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
            if (!expectedChar || typedChar !== expectedChar) {
                errorKeystrokes++;
            }
        }
    }
    previousRawTyped = rawTyped;

    // Like TypeRacer: the word must be correct AND followed by a space to move on.
    // The final word finishes the test as soon as it's typed correctly.
    if (normalizedTypedText === normalizedCurrentWord && (endsWithSpace || isLastWord)) {
        if (endsWithSpace) {
            totalKeystrokes += 1;
        }
        previousRawTyped = '';
        typingArea.value = '';
        typingArea.classList.remove('incorrect');
        // Clear per-character state on the finished word; it's coloured green as a whole
        renderWordProgress(currentWordIndex, '', false);
        currentWordIndex++;
        updateWordHighlight();

        if (currentWordIndex === processedWords.length) {
            endGame();
            searchTypeDropdown.disabled = false;
        }
        return;
    }

    // Keep trailing spaces so a premature/wrong space shows up as an error
    const typedForDisplay = endsWithSpace
        ? normalizedTypedText + ' '.repeat(rawTyped.match(/\s+$/)[0].length)
        : normalizedTypedText;
    renderWordProgress(currentWordIndex, typedForDisplay);

    if (!normalizedCurrentWord.startsWith(typedForDisplay)) {
        typingArea.classList.add('incorrect');
    } else {
        typingArea.classList.remove('incorrect');
    }

    // wpmResult.textContent = `${calculateWPM()}`;
    // //CurrentWPM
});

// Backspace safety net: if the current word is typed correctly but has extra characters after it
// (e.g. "cantl" for "cant"), Ctrl/Alt+Backspace only removes the extras, and a burst of backspaces
// (held key or rapid presses) stops at the correct word instead of eating into it.
// Words with a mistake inside them (e.g. "canlt") get no protection, so muscle memory isn't affected.
const BACKSPACE_BURST_MS = 500;
let backspaceLockUntil = 0;

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

document.addEventListener('click', (event) => {
    if (!event.target.closest('.guess-input-wrapper')) {
        hideSuggestions();
    }
});

removePunctuationCheckbox.addEventListener('change', () => {
    if (!testStarted) updateDisplayedText();
});

removeAdlibsCheckbox.addEventListener('change', () => {
    if (!testStarted) updateDisplayedText();
});

includeNumbersCheckbox.addEventListener('change', () => {
    if (!testStarted) updateDisplayedText();
});

startBtn.addEventListener('click', async () => {
    const inputValue = artistInput.value.trim();
    const searchType = searchTypeDropdown.value; // "Artist","Song"
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

artistInput.addEventListener('keydown', function(event) {
    if (event.key === 'Enter') {
        event.preventDefault(); 
        startBtn.click(); 
    }
});

endGameBtn.addEventListener('click', () => {
    endGame();
    searchTypeDropdown.disabled = false;
});

window.addEventListener('DOMContentLoaded', () => {
    artistInput.focus();
    const titleElement = document.querySelector('.navbar-title');
    const titleText = 'TuneTyper';
    let index = 0;

    function typeNavbarTitle() {
        if (index < titleText.length) {
            titleElement.textContent += titleText.charAt(index);
            index++;
            setTimeout(typeNavbarTitle, 75);  
        }
    }

    
    titleElement.textContent = '';
    typeNavbarTitle();

});
window.addEventListener('DOMContentLoaded', loadDefaultPlaylist);

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
const loadingBarContainer = document.createElement('div');
loadingBarContainer.id = 'loading-bar-container';
loadingBarContainer.style.position = 'fixed';
loadingBarContainer.style.top = '0';
loadingBarContainer.style.left = '0';
loadingBarContainer.style.width = '100%';
loadingBarContainer.style.height = '4px';
loadingBarContainer.style.backgroundColor = '#333';
loadingBarContainer.style.zIndex = '1000';

const loadingBar = document.createElement('div');
loadingBar.id = 'loading-bar';
loadingBar.style.width = '0%';
loadingBar.style.height = '100%';
loadingBar.style.backgroundColor = '#4caf50';
loadingBar.style.transition = 'width 0.3s ease-in-out';

loadingBarContainer.appendChild(loadingBar);
document.body.prepend(loadingBarContainer);


// Loading Bar Logic
let loadingInterval;
function startLoadingBar() {
    loadingBar.style.width = '5%';
    let progress = 5;

    loadingInterval = setInterval(() => {
        if (progress < 65) {
            progress += 10;
        } else if (progress < 95) {
            progress += 5;
        }
        loadingBar.style.width = progress + '%';
    }, 1000);
}

function stopLoadingBar() {
    clearInterval(loadingInterval);
    loadingBar.style.width = '100%';
    setTimeout(() => {
        loadingBar.style.width = '0%';
    }, 500);
}