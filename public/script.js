// Frontend
const artistInput = document.getElementById('artist-input');
const startBtn = document.getElementById('start-btn');
const typingArea = document.getElementById('typing-area');
const displayText = document.getElementById('display-text');
const wpmResult = document.getElementById('wpm-result');
const removePunctuationCheckbox = document.getElementById('remove-punctuation');
const removeAdlibsCheckbox = document.getElementById('remove-adlibs');
const songInfo = document.getElementById('song-info');
const guessSection = document.getElementById('guess-section');
const guessInput = document.getElementById('guess-input');
const giveUpButton = document.getElementById('give-up');
const guessFeedback = document.getElementById('guess-feedback');
const searchTypeDropdown = document.getElementById('search-type');
const endGameBtn = document.getElementById('end-game-btn');

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
            sectionTwo = lines.slice(index).join('\n');
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
    return lines.join('\n').slice(0, maxLength).trim();
}

function normalizeTextForTyping(text, removePunctuation = false, removeAdlibs = false) {
    // The API being used for lyrics, ovh, sometimes returns lyrics with weird characters like that weird "e"
    text = text.normalize('NFKD').replace(/е/g, 'e');
    text = text.normalize('NFKD').replace(/[^\x00-\x7F]/g, '');
    text = text.replace(/[\u2018\u2019\u201A\u201B]/g, "'")
               .replace(/[\u201C\u201D\u201E\u201F]/g, '"');
    if (removeAdlibs) {
        text = text.replace(/\(\s*[^()]{1,25}\s*\)/g, '');
    }
    if (removePunctuation) {
        text = text.replace(/[\p{P}\p{S}]/gu, '').toLowerCase();
    }

    return text.trim();
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

// Game Functions
function resetGame() {
    currentWordIndex = 0;
    startTime = null;
    testStarted = false;
    guessCount = 0;
    sectionOne = "";
    sectionTwo = "";
    sectionSelected = "";


    typingArea.value = '';
    typingArea.style.display = 'block';
    typingArea.disabled = true;
    displayText.innerHTML = '';
    wpmResult.textContent = '';
    songInfo.innerHTML = '';
    guessSection.style.display = 'none';
    guessFeedback.innerHTML = '';
    guessInput.value = '';
    removePunctuationCheckbox.disabled = false;
    removeAdlibsCheckbox.disabled = false;
    searchTypeDropdown.disabled = false;
    endGameBtn.style.display = 'none';
}

function updateDisplayedText() {
    const removePunctuation = !removePunctuationCheckbox.checked;
    const removeAdlibs = !removeAdlibsCheckbox.checked;
    const textToDisplay = normalizeTextForTyping(typeSection, removePunctuation, removeAdlibs);
    processedWords = textToDisplay.split(/\s+/).filter(Boolean);

    displayText.innerHTML = processedWords
        .map((word, index) => `<span id="word-${index}">${word}</span>`)
        .join(' ');

    updateWordHighlight();
    typingArea.disabled = false;
    typingArea.focus();
}

function updateWordHighlight() {
    document.querySelectorAll('span').forEach((span, index) => {
        span.classList.remove('current', 'correct');
        if (index < currentWordIndex) {
            span.classList.add('correct');
        }
    });

    const currentWordElement = document.getElementById(`word-${currentWordIndex}`);
    if (currentWordElement) {
        currentWordElement.classList.add('current');
    }
}

function calculateWPM() {
    if (!startTime) return 0;
    const elapsedTime = (new Date() - startTime) / 1000;
    return Math.round((currentWordIndex / elapsedTime) * 60);
}

function startWPMUpdater() {
    wpmInterval = setInterval(() => {
        wpmResult.textContent = `${calculateWPM()} WPM`;
    }, 2000);
}

function stopWPMUpdater() {
    clearInterval(wpmInterval);
}

function handleGuess() {
    const userGuess = normalizeText(guessInput.value);
    const correctAnswerOriginal = selectedTrack.title;

    const correctAnswerProcessed = removeParentheses(correctAnswerOriginal);
    const correctAnswer = normalizeText(correctAnswerProcessed);

    guessCount++;

    if (userGuess === correctAnswer) {
        showFinalInfo();
    } else {
        const partialHint = getPartialMatchHint(userGuess, correctAnswerProcessed);

        if (guessCount >= 1) {
            guessFeedback.innerHTML = `
                <span style="color: red;">Wrong! Hint:</span><br>
                <span style="font-size: 1.2em;">${partialHint}</span>
            `;
            songInfo.innerHTML = `<img id="album-image" src="${selectedTrack.album.cover_medium}" alt="${selectedTrack.album.title}">`;
            giveUpButton.style.display = 'block';
        } else {
            guessFeedback.innerHTML = `<span style="color: red;">Wrong again! Hint: ${partialHint}</span>`;
        }
    }
}

function getPartialMatchHint(userGuess, correctAnswer) {

    const userGuessNorm = userGuess.toLowerCase();
    const correctAnswerNorm = correctAnswer.toLowerCase();
    const length = correctAnswer.length;
    let hint = '';

    for (let i = 0; i < length; i++) {
        const correctChar = correctAnswer[i];
        if (correctChar === ' ') {
            hint += ' ';
        } else {
            const guessChar = (i < userGuessNorm.length) ? userGuessNorm[i] : '';

            if (guessChar === correctChar.toLowerCase()) {
                hint += correctChar;
            } else {
                hint += '_';
            }
        }
    }

    return hint;
}

function removeParentheses(str) {
    return str.replace(/\(.*?\)/g, '').trimEnd() + ' ';

}

function showFinalInfo() {

    let infoHTML = `
         <div style="display: flex; align-items: flex-start;">
            <!-- Album Art Section -->
            <div style="flex-shrink: 0; margin-right: 20px;">
                <h3>${selectedTrack.title} <br> ${selectedTrack.artist.name}</h3>
                <img id="album-image" src="${selectedTrack.album.cover_medium}" alt="${selectedTrack.album.title}">
                <audio id="song-preview" controls>
                    <source src="${selectedTrack.preview}" type="audio/mpeg">
                    Your browser does not support the audio element.
                </audio>
            </div>

            <!-- Lyrics Section -->
            <div class="lyrics-box">
            <p id="display-lyrics" class="display-lyrics">
                ${sectionOne.replace(/\r/g, '\n').replace(/\n\n/g, '<br>').replace(/\n/g, '<br>')}
                <div class="selectedLyrics">${sectionSelected.replace(/\r/g, '\n').replace(/\n\n/g, '<br>').replace(/\n/g, '<br>')}</div>
                ${sectionTwo.replace(/\r/g, '\n').replace(/\n\n/g, '<br>').replace(/\n/g, '<br>')}
            </p>
            </div>
        </div>
    `;

    songInfo.innerHTML = infoHTML;
    guessSection.style.display = 'none';
    searchTypeDropdown.disabled = false;

    const audioElement = document.getElementById('song-preview');
    if (audioElement) {
        audioElement.volume = 0.25;
    }
}

function giveUp() {
    showFinalInfo();
}
giveUpButton.addEventListener('click', giveUp);

function endGame() {
    stopWPMUpdater();
    typingArea.disabled = true;
    typingArea.style.display = 'none';
    wpmResult.textContent = `${calculateWPM()} WPM`;
    //Final WPM
    guessSection.style.display = 'none';
    endGameBtn.style.display = 'none';

    const searchType = searchTypeDropdown.value;
    if (searchType === "song") {
        showFinalInfo();
    } else {
        guessSection.style.display = 'block';
        guessInput.focus(); 
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
        searchTypeDropdown.disabled = true;
        startWPMUpdater();
    }

    const typedText = typingArea.value.trim();
    const currentWord = processedWords[currentWordIndex];
    const normalizedTypedText = normalizeTextForTyping(typedText);
    const normalizedCurrentWord = normalizeTextForTyping(currentWord);

    if (normalizedTypedText === normalizedCurrentWord) {
        typingArea.value = '';
        currentWordIndex++;
        updateWordHighlight();

        if (currentWordIndex === processedWords.length) {
            endGame();
            searchTypeDropdown.disabled = false;
            return;
        }
    } else if (!normalizedCurrentWord.startsWith(normalizedTypedText)) {
        typingArea.classList.add('incorrect');
    } else {
        typingArea.classList.remove('incorrect');
    }

    // wpmResult.textContent = `${calculateWPM()}`;
    // //CurrentWPM
});

guessInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
        event.preventDefault();
        handleGuess();
    }

    
});

removePunctuationCheckbox.addEventListener('change', () => {
    if (!testStarted) updateDisplayedText();
});

removeAdlibsCheckbox.addEventListener('change', () => {
    if (!testStarted) updateDisplayedText();
});

startBtn.addEventListener('click', async () => {
    const inputValue = artistInput.value.trim();
    const searchType = searchTypeDropdown.value; // "Artist","Song"

    if (searchType !== 'artist' && searchType !== 'song') {
        searchType = 'artist'; // default
    }

    if (!inputValue) {
        alert('Please enter a valid input.');
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
});

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

        previousArtist = trackArtist;
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