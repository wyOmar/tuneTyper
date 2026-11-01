/**
 * scripts/generate-artist-og.js
 * Generates 1200x630 Open Graph / Twitter social preview cards for all curated featured artists.
 * Each card features:
 * - TuneTyper branding + Artist name heading
 * - Call-to-action tagline ("Type the lyrics to <Track>. Guess the tune & beat your WPM.")
 * - Lead track album cover & metadata card
 * - Realistic in-game typing text display with iconic lyrics, cursor, and completion styling
 * - Typing stats (WPM + accuracy) and play button linking to the artist landing route
 *
 * Usage:
 *   node scripts/generate-artist-og.js
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const axios = require('axios');
const { Resvg } = require('@resvg/resvg-js');
const { FEATURED_ARTISTS } = require('../artists');

const OUTPUT_DIR = path.join(__dirname, '..', 'public', 'og', 'artists');
const CACHE_DIR = path.join(__dirname, '..', 'assets', 'covers-cache');
const LOGO_PATH = path.join(__dirname, '..', 'public', 'favicon', 'android-chrome-512x512.png');

const ARTIST_OG_SNIPPETS = {
    'taylor-swift': {
        wpm: 88,
        done: "It's cool, that's what I tell 'em, no rules in breakable heaven, but ooh, whoa, ",
        ok: 'o',
        caret: 'h',
        todo: ", it's a cruel summer with you..."
    },
    'sabrina-carpenter': {
        wpm: 94,
        done: "Now he's thinkin' 'bout me every night, oh, is it that sweet? I guess so, say you can't ",
        ok: 's',
        caret: 'l',
        todo: "eep, baby, I know, that's that me espresso..."
    },
    'chappell-roan': {
        wpm: 86,
        done: "You'd have to stop the world just to stop the feeling, good luck, babe, well, good ",
        ok: 'l',
        caret: 'u',
        todo: "ck, babe! You're gonna have to stop the world just to stop the feeling..."
    },
    'olivia-rodrigo': {
        wpm: 92,
        done: "Bloodsucker, fame fucker, bleedin' me dry like a goddamn ",
        ok: 'v',
        caret: 'a',
        todo: "mpire, one look at you and I should've known..."
    },
    'billie-eilish': {
        wpm: 82,
        done: "I want you to stay 'til I'm in the grave, 'til I'm rottin' away, dead and ",
        ok: 'b',
        caret: 'u',
        todo: "ried, 'til I'm in the casket you carry..."
    },
    'eminem': {
        wpm: 128,
        done: "I'm beginnin' to feel like a Rap God, Rap God, all my people from the front to the back ",
        ok: 'n',
        caret: 'o',
        todo: "d, back nod, now who thinks their arms are long enough to slap box?..."
    },
    'kendrick-lamar': {
        wpm: 104,
        done: "Psst, I see dead people. Mustard on the beat, hoe, ayy, Mustard on the ",
        ok: 'b',
        caret: 'e',
        todo: "at, hoe! Deebo, any rap nigga, he a free throw..."
    },
    'the-weeknd': {
        wpm: 96,
        done: "I said, ooh, I'm blinded by the lights, no, I can't sleep until I feel your ",
        ok: 't',
        caret: 'o',
        todo: "uch, I said, ooh, I'm drowning in the night..."
    },
    'ariana-grande': {
        wpm: 89,
        done: "We can't be friends, but I'd like to just pretend, you cling to your papers and ",
        ok: 'p',
        caret: 'e',
        todo: "ns, wait until you like me again, wait for your love..."
    },
    'bruno-mars': {
        wpm: 84,
        done: "If the world was ending, I'd wanna be next to you, if the party was over and our time on Earth was ",
        ok: 't',
        caret: 'h',
        todo: "rough, I'd wanna hold you just for a while..."
    },
    'drake': {
        wpm: 90,
        done: "She say, 'Do you love me?' I tell her, 'Only partly, I only love my bed and my momma, I'm ",
        ok: 's',
        caret: 'o',
        todo: "rry', fifty Dub, I even got it tatted on me..."
    },
    'charli-xcx': {
        wpm: 108,
        done: "I went to the city and I met a boy, bumpin' that, bumpin' that, bumpin' that, ",
        ok: '3',
        caret: '6',
        todo: "0, when you're in the mirror do you like what you see?..."
    },
    'lana-del-rey': {
        wpm: 76,
        done: "Kiss me hard before you go, summertime sadness, I just wanted you to know that, baby, you the ",
        ok: 'b',
        caret: 'e',
        todo: "st, I got that summertime, summertime sadness..."
    },
    'post-malone': {
        wpm: 85,
        done: "Seasons change and our love went cold, feed the flame 'cause we can't let it go, run away, but we're runnin' in ",
        ok: 'c',
        caret: 'i',
        todo: "rcles, run away, run away..."
    },
    'travis-scott': {
        wpm: 112,
        done: "Just come outside, for the night, take your time, get your light, fein, fein, fein, ",
        ok: 'f',
        caret: 'e',
        todo: "in, fein! The career's more at stake when you in your prime..."
    },
    'dua-lipa': {
        wpm: 95,
        done: "If you wanna run away with me, I know a galaxy and I can take you for a ride, I had a premonition that we fell into a ",
        ok: 'r',
        caret: 'h',
        todo: "ythm, where the music don't stop for life..."
    },
    'ed-sheeran': {
        wpm: 93,
        done: "The club isn't the best place to find a lover so the bar is where I go, me and my friends at the table doing ",
        ok: 's',
        caret: 'h',
        todo: "ots, drinking fast and then we talk slow..."
    },
    'lady-gaga': {
        wpm: 97,
        done: "Can't read my, can't read my, no, he can't read my poker face, pa-pa-poker face, pa-pa-",
        ok: 'p',
        caret: 'o',
        todo: "ker face, can't read my, can't read my, no, he can't read my poker face..."
    },
    'coldplay': {
        wpm: 78,
        done: "Look at the stars, look how they shine for you, and everything you do, yeah, they were all ",
        ok: 'y',
        caret: 'e',
        todo: "llow, I came along, I wrote a song for you..."
    },
    'queen': {
        wpm: 87,
        done: "Is this the real life? Is this just fantasy? Caught in a landslide, no escape from ",
        ok: 'r',
        caret: 'e',
        todo: "ality, open your eyes, look up to the skies and see..."
    },
    'arctic-monkeys': {
        wpm: 91,
        done: "Have you got colour in your cheeks? Do you ever get that fear that you can't shift the type that sticks around like summat in your ",
        ok: 't',
        caret: 'e',
        todo: "eth? Well, there's some aces up your sleeve..."
    },
    'radiohead': {
        wpm: 75,
        done: "When you were here before, couldn't look you in the eye, you're just like an angel, your skin makes me ",
        ok: 'c',
        caret: 'r',
        todo: "y, you float like a feather in a beautiful world..."
    },
    'kanye-west': {
        wpm: 105,
        done: "Work it, make it, do it, makes us harder, better, faster, stronger, more than ever, hour after hour, work is ",
        ok: 'n',
        caret: 'e',
        todo: "ver over, work it, make it, do it, makes us..."
    },
    'frank-ocean': {
        wpm: 81,
        done: "That's the way everyday goes, every time we have no control, if the sky is pink and white, if the ground is black and ",
        ok: 'y',
        caret: 'e',
        todo: "llow, it's the same way you showed me..."
    },
    'tyler-the-creator': {
        wpm: 92,
        done: "'Cause you make my earth quake, oh, you make my earth quake, riding around, your love be shakin' me ",
        ok: 'u',
        caret: 'p',
        todo: ", and it's making my heart break, 'cause you make my earth quake..."
    },
    'sza': {
        wpm: 88,
        done: "I might kill my ex, not the best idea, his new girlfriend's next, how'd I get here? I might kill my ex, I still love him ",
        ok: 't',
        caret: 'h',
        todo: "ough, rather be in jail than alone..."
    },
    'harry-styles': {
        wpm: 96,
        done: "Hold on, as it was, you know it's not the same as it was, in this world, it's just us, you know it's not the same as it ",
        ok: 'w',
        caret: 'a',
        todo: "s, as it was, as it was, you know it's not the same..."
    },
    'beyonce': {
        wpm: 98,
        done: "I feel like fallin' in love, I'm in the mood to fuck somethin' up, I need some drink in my cup, hey, pour me a ",
        ok: 'd',
        caret: 'r',
        todo: "ink, cuff it, cuff it, cuff it, cuff it, baby..."
    },
    'rihanna': {
        wpm: 93,
        done: "When the sun shines, we'll shine together, told you I'll be here forever, said I'll always be your friend, took an oath, I'ma stick it out to the ",
        ok: 'e',
        caret: 'n',
        todo: "d, now that it's raining more than ever..."
    },
    'linkin-park': {
        wpm: 102,
        done: "It starts with one, one thing, I don't know why, it doesn't even matter how hard you try, keep that in mind, I designed this rhyme to explain in due ",
        ok: 't',
        caret: 'i',
        todo: "me, all I know, time is a valuable thing..."
    }
};

function escapeHtml(str) {
    if (!str) return '';
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

async function getCoverDataUri(artist) {
    const leadTrack = artist.tracks && artist.tracks[0];
    if (!leadTrack || !leadTrack.cover) {
        return '';
    }

    if (!fs.existsSync(CACHE_DIR)) {
        fs.mkdirSync(CACHE_DIR, { recursive: true });
    }

    const cachedFile = path.join(CACHE_DIR, `${artist.slug}.jpg`);
    let imageBuffer;
    if (fs.existsSync(cachedFile)) {
        imageBuffer = fs.readFileSync(cachedFile);
    } else {
        const response = await axios.get(leadTrack.cover, { responseType: 'arraybuffer' });
        imageBuffer = Buffer.from(response.data);
        fs.writeFileSync(cachedFile, imageBuffer);
    }

    return `data:image/jpeg;base64,${imageBuffer.toString('base64')}`;
}

function buildHtml(artist, coverDataUri, logoDataUri) {
    const snippet = ARTIST_OG_SNIPPETS[artist.slug] || {
        wpm: 90,
        done: "Type the lyrics, feel the rhythm, and sing along to every word: ",
        ok: 'c',
        caret: 'a',
        todo: "n you guess the tune before time runs out?"
    };

    const leadTrack = (artist.tracks && artist.tracks[0]) || {
        title: 'Popular Tracks',
        album: 'Best Hits',
        year: '2024'
    };

    const safeArtist = escapeHtml(artist.name);
    const safeTrackTitle = escapeHtml(leadTrack.title);
    const safeAlbum = escapeHtml(leadTrack.album);
    const safeYear = escapeHtml(leadTrack.year || '');
    const safeMeta = safeYear ? `${safeAlbum} &bull; ${safeYear}` : safeAlbum;

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body {
        width: 1200px;
        height: 630px;
        overflow: hidden;
        background: #121212;
        color: #fff;
        font-family: "DejaVu Sans", Arial, sans-serif;
    }
    .frame {
        position: absolute;
        inset: 0;
        padding: 50px 64px;
        display: flex;
        flex-direction: column;
        background:
            radial-gradient(circle at 92% 14%, rgba(76, 175, 80, 0.20), transparent 45%),
            radial-gradient(circle at 6% 96%, rgba(76, 175, 80, 0.12), transparent 42%),
            #121212;
    }
    .header {
        display: flex;
        justify-content: space-between;
        align-items: center;
    }
    .brand {
        display: flex;
        align-items: center;
        gap: 18px;
    }
    .brand img {
        width: 58px;
        height: 58px;
        border-radius: 12px;
    }
    .brand h1 {
        font-family: "DejaVu Sans Mono", monospace;
        font-size: 44px;
        font-weight: bold;
        letter-spacing: -0.5px;
    }
    .brand h1 .sep {
        color: #555;
        margin: 0 10px;
        font-weight: 300;
    }
    .brand h1 .artist {
        color: #fff;
    }
    .brand h1 .cursor {
        display: inline-block;
        width: 5px;
        height: 40px;
        margin-left: 6px;
        vertical-align: -5px;
        background: #4caf50;
    }
    .tagline {
        margin-top: 14px;
        font-size: 26px;
        color: #c0c0c0;
    }
    .tagline strong { color: #4caf50; font-weight: bold; }

    /* Middle card area */
    .content {
        margin-top: 36px;
        display: flex;
        gap: 32px;
        align-items: stretch;
    }
    .track-card {
        width: 250px;
        background: #181818;
        border: 2px solid #2e2e2e;
        border-radius: 14px;
        padding: 16px;
        display: flex;
        flex-direction: column;
        align-items: center;
        box-shadow: 0 12px 28px rgba(0, 0, 0, 0.5);
    }
    .track-cover {
        width: 214px;
        height: 214px;
        border-radius: 10px;
        object-fit: cover;
        box-shadow: 0 6px 18px rgba(0, 0, 0, 0.4);
    }
    .track-info {
        margin-top: 14px;
        width: 100%;
        text-align: left;
    }
    .track-title {
        font-size: 20px;
        font-weight: bold;
        color: #fff;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }
    .track-meta {
        margin-top: 4px;
        font-size: 14px;
        color: #888;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }

    /* Typing display box */
    .display {
        flex: 1;
        padding: 28px 32px;
        background: #1e1e1e;
        border: 2px solid #333;
        border-radius: 14px;
        font-family: "DejaVu Sans Mono", monospace;
        font-size: 30px;
        line-height: 1.6;
        color: #fff;
        box-shadow: 0 12px 30px rgba(0, 0, 0, 0.5);
        display: flex;
        flex-direction: column;
        justify-content: center;
    }
    .display .done { color: #4caf50; }
    .display .current { text-decoration: underline; text-underline-offset: 6px; }
    .display .ok { color: #4caf50; }
    .display .caret { box-shadow: inset 3px 0 0 #d1d1d1; }
    .display .todo { color: #7e7e7e; }

    .footer {
        margin-top: auto;
        display: flex;
        justify-content: flex-end;
        align-items: center;
        font-family: "DejaVu Sans Mono", monospace;
    }
    .cta-btn {
        font-size: 24px;
        font-weight: bold;
        color: #121212;
        background: #4caf50;
        padding: 12px 28px;
        border-radius: 10px;
        letter-spacing: 0.5px;
        box-shadow: 0 4px 14px rgba(76, 175, 80, 0.35);
        white-space: nowrap;
    }
</style>
</head>
<body>
    <div class="frame">
        <div class="header">
            <div class="brand">
                <img src="${logoDataUri}" alt="">
                <h1>TuneTyper<span class="sep">/</span><span class="artist">${safeArtist}</span><span class="cursor"></span></h1>
            </div>
        </div>
        <p class="tagline">Type the lyrics to <strong>${safeTrackTitle}</strong>. Guess the tune &amp; beat your WPM.</p>

        <div class="content">
            <div class="track-card">
                <img class="track-cover" src="${coverDataUri}" alt="${safeTrackTitle}">
                <div class="track-info">
                    <div class="track-title">${safeTrackTitle}</div>
                    <div class="track-meta">${safeMeta}</div>
                </div>
            </div>

            <div class="display">
                <p>
                    <span class="done">${escapeHtml(snippet.done)}</span><span class="current"><span class="ok">${escapeHtml(snippet.ok)}</span><span class="caret">${escapeHtml(snippet.caret)}</span></span><span class="todo">${escapeHtml(snippet.todo)}</span>
                </p>
            </div>
        </div>

        <div class="footer">
            <span class="cta-btn">type.vincentchan.uk/${escapeHtml(artist.slug)}</span>
        </div>
    </div>
</body>
</html>`;
}

/**
 * Build 1200x630 SVG for artist Open Graph card
 */
function buildArtistOgSvg(artist, coverDataUri, logoDataUri) {
    const snippet = ARTIST_OG_SNIPPETS[artist.slug] || {
        wpm: 90,
        done: "Type the lyrics, feel the rhythm, and sing along to every word: ",
        ok: 'c',
        caret: 'a',
        todo: "n you guess the tune before time runs out?"
    };

    const leadTrack = (artist.tracks && artist.tracks[0]) || {
        title: 'Popular Tracks',
        album: 'Best Hits',
        year: '2024'
    };

    const safeArtist = escapeHtml(artist.name);
    const safeTrackTitle = escapeHtml(leadTrack.title);
    const safeAlbum = escapeHtml(leadTrack.album);
    const safeYear = escapeHtml(leadTrack.year || '');
    const safeMeta = safeYear ? `${safeAlbum} &#x2022; ${safeYear}` : safeAlbum;

    const urlText = 'type.vincentchan.uk/' + artist.slug;
    const charWidth = 24 * 1233 / 2048;
    const btnTextWidth = urlText.length * charWidth;
    const btnWidth = Math.round(btnTextWidth + 56);
    const btnHeight = 52;
    const btnX = 1136 - btnWidth;
    const btnY = 548;

    // Word tokens for realistic typing display box
    const doneWords = snippet.done.trim().split(/\s+/).filter(Boolean);
    const todoWords = snippet.todo.trim().split(/\s+/).filter(Boolean);
    const activeWordStr = snippet.ok + snippet.caret + (todoWords[0] || '');
    const restTodoWords = todoWords.slice(1);

    const allWordTokens = [
        ...doneWords.map(w => ({ text: w, type: 'done' })),
        { text: activeWordStr, type: 'active', ok: snippet.ok, caret: snippet.caret, todoWord: todoWords[0] || '' },
        ...restTodoWords.map(w => ({ text: w, type: 'todo' }))
    ];

    const lines = [];
    let currentLineTokens = [];
    let currentLineLen = 0;
    const maxCharsPerLine = 38;

    for (const token of allWordTokens) {
        const addedLen = currentLineTokens.length === 0 ? token.text.length : (1 + token.text.length);
        if (currentLineLen + addedLen <= maxCharsPerLine) {
            currentLineTokens.push(token);
            currentLineLen += addedLen;
        } else {
            lines.push(currentLineTokens);
            currentLineTokens = [token];
            currentLineLen = token.text.length;
            if (lines.length === 2) {
                break;
            }
        }
    }
    if (lines.length < 3 && currentLineTokens.length > 0) {
        lines.push(currentLineTokens);
    }

    const fontSize = 30;
    const fontCharWidth = fontSize * 1233 / 2048; // ~18.06px
    const startX = 378;
    const lineSpacing = 48;
    const boxCenterY = 196 + 320 / 2; // 356
    const totalH = (lines.length - 1) * lineSpacing;
    const startY = Math.round(boxCenterY - totalH / 2 + (fontSize * 0.35));

    let displayLinesSvg = '';

    lines.forEach((lineTokens, lineIdx) => {
        const y = startY + lineIdx * lineSpacing;
        let lineHasActive = false;
        let activeCursorX = startX;
        let charAcc = 0;

        let tspans = '';
        lineTokens.forEach((tok, tokIdx) => {
            const prefixSpace = tokIdx === 0 ? '' : ' ';
            if (tok.type === 'done') {
                tspans += `<tspan fill="#4caf50">${escapeHtml(prefixSpace + tok.text)}</tspan>`;
                charAcc += prefixSpace.length + tok.text.length;
            } else if (tok.type === 'active') {
                lineHasActive = true;
                const okChars = tok.ok || '';
                const caretChar = tok.caret || '';
                const todoWordChars = tok.todoWord || '';
                if (prefixSpace) {
                    tspans += `<tspan fill="#4caf50"> </tspan>`;
                    charAcc += 1;
                }
                const caretCharPos = charAcc + okChars.length;
                activeCursorX = startX + caretCharPos * fontCharWidth;

                tspans += `<tspan fill="#4caf50" text-decoration="underline">${escapeHtml(okChars)}</tspan>`;
                tspans += `<tspan fill="#ffffff" text-decoration="underline">${escapeHtml(caretChar)}</tspan>`;
                if (todoWordChars) {
                    tspans += `<tspan fill="#7e7e7e">${escapeHtml(todoWordChars)}</tspan>`;
                }
                charAcc += okChars.length + caretChar.length + todoWordChars.length;
            } else {
                tspans += `<tspan fill="#7e7e7e">${escapeHtml(prefixSpace + tok.text)}</tspan>`;
                charAcc += prefixSpace.length + tok.text.length;
            }
        });

        if (lineHasActive) {
            const cursorY = y - fontSize * 0.82;
            const cursorH = fontSize * 1.02;
            displayLinesSvg += `<rect x="${activeCursorX.toFixed(1)}" y="${cursorY.toFixed(1)}" width="3" height="${cursorH.toFixed(1)}" fill="#ffffff" rx="1"/>\n        `;
        }
        displayLinesSvg += `<text x="${startX}" y="${y}" font-size="${fontSize}" font-family="DejaVu Sans Mono, monospace" xml:space="preserve">${tspans}</text>\n        `;
    });

    const artistCursorX = 140 + ('TuneTyper / ' + artist.name).length * 26.5;

    return `<svg width="1200" height="630" viewBox="0 0 1200 630" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <radialGradient id="bg1" cx="92%" cy="14%" r="45%">
      <stop offset="0%" stop-color="#4caf50" stop-opacity="0.20"/>
      <stop offset="100%" stop-color="#121212" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="bg2" cx="6%" cy="96%" r="42%">
      <stop offset="0%" stop-color="#4caf50" stop-opacity="0.12"/>
      <stop offset="100%" stop-color="#121212" stop-opacity="0"/>
    </radialGradient>
    <clipPath id="logoClip"><rect x="64" y="46" width="58" height="58" rx="12"/></clipPath>
    <clipPath id="coverClip"><rect x="82" y="212" width="214" height="214" rx="10"/></clipPath>
  </defs>

  <rect width="1200" height="630" fill="#121212"/>
  <rect width="1200" height="630" fill="url(#bg1)"/>
  <rect width="1200" height="630" fill="url(#bg2)"/>

  <!-- Brand -->
  <image href="${logoDataUri}" x="64" y="46" width="58" height="58" clip-path="url(#logoClip)"/>
  <text x="140" y="90" fill="#ffffff" font-size="44" font-weight="bold" font-family="DejaVu Sans Mono, monospace">TuneTyper<tspan fill="#555555" font-weight="300"> / </tspan><tspan fill="#ffffff">${safeArtist}</tspan></text>
  <rect x="${artistCursorX.toFixed(1)}" y="58" width="5" height="38" fill="#4caf50"/>

  <!-- Tagline -->
  <text x="64" y="146" fill="#c0c0c0" font-size="26" font-family="DejaVu Sans, Arial, sans-serif">
    Type the lyrics to <tspan fill="#4caf50" font-weight="bold">${safeTrackTitle}</tspan>. Guess the tune &amp; beat your WPM.
  </text>

  <!-- Track Card -->
  <g id="track-card">
    <rect x="64" y="196" width="250" height="320" rx="14" fill="#181818" stroke="#2e2e2e" stroke-width="2"/>
    <image href="${coverDataUri}" x="82" y="212" width="214" height="214" clip-path="url(#coverClip)"/>
    <text x="82" y="462" fill="#ffffff" font-size="20" font-weight="bold" font-family="DejaVu Sans, Arial, sans-serif">${safeTrackTitle}</text>
    <text x="82" y="490" fill="#888888" font-size="14" font-family="DejaVu Sans, Arial, sans-serif">${safeMeta}</text>
  </g>

  <!-- Display Box -->
  <g id="display-box">
    <rect x="346" y="196" width="790" height="320" rx="14" fill="#1e1e1e" stroke="#333333" stroke-width="2"/>
    ${displayLinesSvg}
  </g>

  <!-- Footer with single merged URL button -->
  <g id="footer">
    <rect x="${btnX}" y="${btnY}" width="${btnWidth}" height="${btnHeight}" rx="10" fill="#4caf50"/>
    <text x="${btnX + btnWidth / 2}" y="${btnY + 34}" fill="#121212" font-size="24" font-weight="bold" font-family="DejaVu Sans Mono, monospace" text-anchor="middle">
      ${urlText}
    </text>
  </g>
</svg>`;
}

async function generateAll() {
    console.log(`Starting Open Graph social card generation for ${FEATURED_ARTISTS.length} artists...`);

    if (!fs.existsSync(OUTPUT_DIR)) {
        fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    }

    const logoBuffer = fs.readFileSync(LOGO_PATH);
    const logoDataUri = `data:image/png;base64,${logoBuffer.toString('base64')}`;

    const fontDir = path.join(__dirname, '..', 'assets', 'fonts');
    const fontFiles = [
        path.join(fontDir, 'DejaVuSans.ttf'),
        path.join(fontDir, 'DejaVuSans-Bold.ttf'),
        path.join(fontDir, 'DejaVuSansMono.ttf'),
        path.join(fontDir, 'DejaVuSansMono-Bold.ttf')
    ].filter(f => fs.existsSync(f));

    let generatedCount = 0;

    for (let i = 0; i < FEATURED_ARTISTS.length; i++) {
        const artist = FEATURED_ARTISTS[i];
        const outPng = path.join(OUTPUT_DIR, `${artist.slug}.png`);

        process.stdout.write(`[${i + 1}/${FEATURED_ARTISTS.length}] Generating ${artist.name} (${artist.slug})... `);
        try {
            const coverDataUri = await getCoverDataUri(artist);
            const svg = buildArtistOgSvg(artist, coverDataUri, logoDataUri);

            const resvg = new Resvg(svg, {
                font: {
                    fontFiles: fontFiles.length > 0 ? fontFiles : undefined,
                    loadSystemFonts: true,
                    monospaceFamily: 'DejaVu Sans Mono',
                    sansSerifFamily: 'DejaVu Sans'
                },
                fitTo: { mode: 'width', value: 1200 }
            });

            const pngBuffer = resvg.render().asPng();
            fs.writeFileSync(outPng, pngBuffer);

            if (fs.existsSync(outPng) && fs.statSync(outPng).size > 10000) {
                const sizeKb = Math.round(fs.statSync(outPng).size / 1024);
                process.stdout.write(`OK (${sizeKb} KB)\n`);
                generatedCount++;
            } else {
                process.stdout.write(`FAILED (output missing or empty)\n`);
            }
        } catch (err) {
            process.stdout.write(`ERROR: ${err.message}\n`);
        }
    }

    console.log(`\nSuccessfully generated ${generatedCount}/${FEATURED_ARTISTS.length} artist social preview cards in public/og/artists/`);
}

if (require.main === module) {
    generateAll().catch(err => {
        console.error('Fatal error during OG generation:', err);
        process.exit(1);
    });
}

module.exports = {
    ARTIST_OG_SNIPPETS,
    buildHtml,
    buildArtistOgSvg,
    generateAll
};
