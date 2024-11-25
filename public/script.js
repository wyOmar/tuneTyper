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
let originalText = "";
let processedWords = [];
let currentWordIndex = 0;
let startTime = null;
let testStarted = false;
let selectedTrack = null;
let guessCount = 0;
let previousArtist = "";
let lastQueriedArtist = null;
let lastArtistTracks = [];
let cachedSongLyrics = {};
let fullLyrics = "";

// API Fetch Functions
async function fetchTracks(query) {
    const searchType = searchTypeDropdown.value;
    const response = await fetch(`/tracks?artist=${encodeURIComponent(query)}`);
    if (!response.ok) throw new Error('Failed to fetch tracks.');
    const data = await response.json();

    if (searchType === "song") {
        return data.data.filter(track => normalizeText(track.title).includes(normalizeText(query)));
    }
    return data.data;
}

async function fetchLyrics(artist, track) {
    const response = await fetch(`/lyrics?artist=${encodeURIComponent(artist)}&track=${encodeURIComponent(track)}`);
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
    const lines = text.split('\n').filter(line => line.trim());
    if (lines.length === 0) return '';

    for (let attempt = 0; attempt < 5; attempt++) {
        let selectedText = '';
        let totalLength = 0;
        let startIndex = Math.floor(Math.random() * lines.length);

        let index = startIndex;
        while (totalLength < minLength && index < lines.length) {
            const line = lines[index].trim();
            if (line) {
                selectedText += (selectedText ? ' ' : '') + line;
                totalLength = selectedText.length;
            }
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
            return selectedText.trim();
        }
    }

    // If all attempts fail, return the longest possible section
    console.log(`failed`)
    return lines.join(' ').slice(0, maxLength).trim();
    
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
    const textToDisplay = normalizeTextForTyping(originalText, removePunctuation, removeAdlibs);
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

function handleGuess() {
    const userGuess = normalizeText(guessInput.value);
    const correctAnswer = normalizeText(selectedTrack.title);

    guessCount++;

    if (userGuess === correctAnswer) {
        guessFeedback.innerHTML = '<span style="color: green;"></span>';
        showFinalInfo();

    } else {
        if (guessCount >= 1) {
            guessFeedback.innerHTML = '<span style="color: red;">Wrong! Hint:</span>';
            songInfo.innerHTML = `<img id="album-image" src="${selectedTrack.album.cover_medium}" alt="${selectedTrack.album.title}">`;
            giveUpButton.style.display = 'block';


        } else {
            guessFeedback.innerHTML = '<span style="color: red;">Wrong again!</span>';
        }
    }
}

function showFinalInfo() {
    

    let infoHTML = `
         <div style="display: flex; align-items: flex-start;">
            <!-- Album Art Section -->
            <div style="flex-shrink: 0; margin-right: 20px;">
                <h3>${selectedTrack.title} <br> ${selectedTrack.artist.name}</h3>
                <img id="album-image" src="${selectedTrack.album.cover_medium}" alt="${selectedTrack.album.title}">
                <audio id="song-preview" controls autoplay>
                    <source src="${selectedTrack.preview}" type="audio/mpeg">
                    Your browser does not support the audio element.
                </audio>
            </div>

            <!-- Lyrics Section -->
            <div class="lyrics-box">
                <p id="display-lyrics" class="display-lyrics">${fullLyrics.replace(/\r/g, '\n').replace(/\n\n/g, '<br>')}</p>
            </div>
        </div>
    `;
    //const searchType = searchTypeDropdown.value;
    //${completeLyrics.replace(/\n/g, '<br>')}
    // if (searchType !== "song") {
    //     infoHTML = `
    //         <p><strong>Guesses:</strong> ${guessCount}</p>
    //         ${infoHTML}
    //     `;
    // }

    songInfo.innerHTML = infoHTML;
    guessSection.style.display = 'none';
    searchTypeDropdown.disabled = false;

    const audioElement = document.getElementById('song-preview');
    if (audioElement) {
        audioElement.volume = 0.25;
    }
}

function giveUp() {
    guessFeedback.innerHTML = `<span style="color: orange;">The correct answer was: ${selectedTrack.title}</span>`;
    guessCount = "Revealed";
    showFinalInfo();
}

function endGame() {
    if (!testStarted) return;

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
typingArea.addEventListener('input', () => {
    if (!startTime) {
        startTime = new Date();
        testStarted = true;
        removePunctuationCheckbox.disabled = true;
        removeAdlibsCheckbox.disabled = true;
        searchTypeDropdown.disabled = true;
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

    wpmResult.textContent = `${calculateWPM()}`;
    //CurrentWPM
});

guessInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
        event.preventDefault();
        handleGuess();
    }
});

giveUpButton.addEventListener('click', giveUp);

removePunctuationCheckbox.addEventListener('change', () => {
    if (!testStarted) updateDisplayedText();
});

removeAdlibsCheckbox.addEventListener('change', () => {
    if (!testStarted) updateDisplayedText();
});

startBtn.addEventListener('click', async () => {
    const inputValue = artistInput.value.trim();
    const searchType = searchTypeDropdown.value; // "Artist","Song"

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

// Button Logic
async function handleArtistSearch(artistName) {
    if (artistName === previousArtist && lastArtistTracks.length > 0) {
        console.log(`Using cached tracks for artist: ${artistName}`);
    } else {
        console.log(`Fetching tracks for new artist: ${artistName}`);

        const artistId = await fetchArtistId(artistName);
        if (!artistId) throw new Error('Artist not found.');

        lastArtistTracks = await fetchTopTracks(artistId);
        if (lastArtistTracks.length === 0) throw new Error('No top tracks found.');

        // Update the cached artist
        previousArtist = artistName;
    }

    await tryFetchLyricsFromTracks(lastArtistTracks);
}

async function handleSongSearch(songName) {
    const cacheKey = songName.toLowerCase().trim();

    if (cachedSongLyrics[cacheKey]) {
        console.log(`Using cached lyrics for: ${songName}`);
        originalText = extractRandomSection(cachedSongLyrics[cacheKey]);
        fullLyrics = cachedSongLyrics[cacheKey]
        updateDisplayedText();
        endGameBtn.style.display = 'inline-block';

        if (!selectedTrack) {
            selectedTrack = {
                title: songName,
                artist: { name: previousArtist || 'Unknown Artist' },
                album: { cover_medium: '/placeholder.jpg' },
            };
        }

        return; 
    }

    console.log(`Fetching lyrics for new song: ${songName}`);

    try {
        const response = await fetch(`/tracks?artist=${encodeURIComponent(songName)}`);
        const data = await response.json();

        if (data.data.length === 0) throw new Error('No matching tracks found for the song.');

        const topResult = data.data[0];
        const likelyArtist = topResult.artist.name;
        const trackTitle = topResult.title;

        console.log(`Top result: ${trackTitle} by ${likelyArtist}`);

        const lyrics = await fetchLyrics(likelyArtist, trackTitle);
        fullLyrics = lyrics;
        cachedSongLyrics[cacheKey] = lyrics;

        selectedTrack = topResult;

        previousArtist = likelyArtist;
        originalText = extractRandomSection(lyrics);
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
        console.log(`Trying track: x by ${track.artist.name}`);
        // ${track.title}
        try {
            lyrics = await fetchLyrics(track.artist.name, track.title);
            selectedTrack = tracks[randomIndex];
            fullLyrics = lyrics;
        } catch (error) {
            console.warn(`Lyrics not found for track: ${track.title}`);
        }
    }

    if (!lyrics) {
        throw new Error('Failed to fetch lyrics for any track.');
    }

    originalText = extractRandomSection(lyrics);
    updateDisplayedText();
    endGameBtn.style.display = 'inline-block';
}

