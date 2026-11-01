const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { Resvg } = require('@resvg/resvg-js');

// Load fallback logo once at startup
let cachedLogoDataUri = null;
function getLogoDataUri() {
    if (!cachedLogoDataUri) {
        try {
            const logoPath = path.join(__dirname, 'public', 'favicon', 'apple-touch-icon.png');
            if (fs.existsSync(logoPath)) {
                const buf = fs.readFileSync(logoPath);
                cachedLogoDataUri = `data:image/png;base64,${buf.toString('base64')}`;
            }
        } catch (_) {
            cachedLogoDataUri = '';
        }
    }
    return cachedLogoDataUri || '';
}

/**
 * Safely escape XML entities for SVG rendering
 */
function escapeXml(str) {
    if (!str || typeof str !== 'string') return '';
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

/**
 * Truncate a string cleanly with ellipsis if it exceeds maxLength
 */
function truncate(str, maxLength) {
    if (!str || typeof str !== 'string') return '';
    if (str.length <= maxLength) return str;
    return str.slice(0, Math.max(0, maxLength - 1)).trimEnd() + '…';
}

/**
 * Standalone binary challenge token decoder (Node.js & browser safe, zero DOM dependencies)
 * Supports:
 * - v3: 12-byte binary packed with Deezer trackId (16 Base64URL chars)
 * - v2: Binary packed with artist + track strings and flags
 * - v1: Legacy binary packed format
 */
function decodeChallengeToken(token) {
    try {
        if (!token || typeof token !== 'string') return null;
        let base64 = token.trim().replace(/-/g, '+').replace(/_/g, '/');
        while (base64.length % 4) base64 += '=';

        const buffer = Buffer.from(base64, 'base64');
        if (buffer.length === 0) return null;

        // 1. Binary packed v3 format (Deezer trackId, bits 7 & 6 set on byte 0, exactly 12 bytes)
        const isV3 = (buffer[0] & 0xc0) === 0xc0 && buffer.length === 12;
        if (isV3) {
            const wpm = ((buffer[0] & 0x3f) << 8) | buffer[1];
            const acc = buffer[2];
            const start = buffer.readUInt16BE(3);
            const flags = buffer[5];
            const punc = (flags & 1) !== 0;
            const num = (flags & 2) !== 0;
            const adlib = (flags & 4) !== 0;

            let trackId = 0n;
            for (let i = 6; i < 12; i++) {
                trackId = (trackId << 8n) | BigInt(buffer[i]);
            }
            const trackIdNum = Number(trackId);
            if (trackIdNum > 0) {
                return {
                    trackId: trackIdNum,
                    wpm: wpm > 0 ? wpm : null,
                    acc: acc > 0 ? acc : null,
                    start: start >= 0 ? start : null,
                    punc,
                    num,
                    adlib
                };
            }
        }

        // 2. Binary packed v2 format (flags byte, bit 7 set, bit 6 clear)
        const isV2 = (buffer[0] & 0x80) !== 0 && (buffer[0] & 0x40) === 0;
        if (isV2 && buffer.length >= 7) {
            const wpm = ((buffer[0] & 0x3f) << 8) | buffer[1];
            const acc = buffer[2];
            const start = buffer.readUInt16BE(3);
            const flags = buffer[5];
            const punc = (flags & 1) !== 0;
            const num = (flags & 2) !== 0;
            const adlib = (flags & 4) !== 0;
            const artistLen = buffer[6];

            if (buffer.length >= 7 + artistLen) {
                const artist = buffer.toString('utf8', 7, 7 + artistLen);
                const track = buffer.toString('utf8', 7 + artistLen);
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

        // 3. Binary packed v1 format (legacy 6-byte header, byte 0 < 0x80)
        if (buffer.length >= 6) {
            const wpm = (buffer[0] << 8) | buffer[1];
            const acc = buffer[2];
            const start = buffer.readUInt16BE(3);
            const artistLen = buffer[5];
            if (buffer.length >= 6 + artistLen) {
                const artist = buffer.toString('utf8', 6, 6 + artistLen);
                const track = buffer.toString('utf8', 6 + artistLen);
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

        return null;
    } catch (_) {
        return null;
    }
}

/**
 * Format raw song lyrics into styled lines for the SVG typing display box
 */
function prepareLyricsSnippet(rawLyrics, options = {}) {
    if (!rawLyrics || typeof rawLyrics !== 'string') return null;

    // Filter out metadata and bracketed notations (e.g. [Chorus], (Guitar Solo))
    const rawLines = rawLyrics
        .split(/\r?\n/)
        .map(line => line.trim())
        .filter(line => line.length > 0 && !/^\[.*\]$/.test(line) && !/^\(.*instrumental.*\)$/i.test(line));

    if (rawLines.length === 0) return null;

    // Take up to 4 readable lines
    const lines = rawLines.slice(0, 4).map(l => truncate(l, 44));
    if (lines.length === 0) return null;

    // In the first line, highlight the first word or two as "done" (green)
    // and underline the current character/caret to match TuneTyper in-game typing aesthetic
    const firstLineWords = lines[0].split(' ');
    let done = '';
    let current = '';
    let todo = '';

    if (firstLineWords.length >= 2) {
        done = firstLineWords[0] + ' ';
        current = firstLineWords[1];
        todo = firstLineWords.slice(2).join(' ');
        if (todo) todo = ' ' + todo;
    } else if (firstLineWords.length === 1) {
        const word = firstLineWords[0];
        const half = Math.max(1, Math.floor(word.length / 2));
        done = word.slice(0, half);
        current = word.slice(half);
        todo = '';
    }

    return {
        line1: { done, current, todo },
        remainingLines: lines.slice(1)
    };
}

/**
 * Build 1200x630 SVG for dynamic Song OpenGraph card
 */
function buildSongOgSvg({ track, artist, album, coverDataUri, logoDataUri, lyricsSnippet }) {
    const safeTrack = escapeXml(track || 'Unknown Track');
    const safeArtist = escapeXml(artist || 'Unknown Artist');
    const safeAlbum = escapeXml(album || track || 'Single');
    const safeTaglineTrack = escapeXml(truncate(track || 'Unknown Track', 32));
    const safeTaglineArtist = escapeXml(truncate(artist || 'Unknown Artist', 28));
    const safeCardTrack = escapeXml(truncate(track || 'Unknown Track', 22));
    const safeCardMeta = escapeXml(truncate(`${artist || 'Unknown Artist'} • ${album || 'Single'}`, 26));
    const safeCtaTrack = escapeXml(truncate(track || 'Song', 18));

    const logoUri = logoDataUri || getLogoDataUri();
    const coverUri = coverDataUri || logoUri;

    // Build the typing display box lines
    let typingLinesSvg = '';
    if (lyricsSnippet && lyricsSnippet.line1) {
        const { done, current, todo } = lyricsSnippet.line1;
        typingLinesSvg += `
        <text x="366" y="265" font-size="28" font-family="DejaVu Sans Mono, monospace" xml:space="preserve">
          <tspan fill="#4caf50">${escapeXml(done)}</tspan><tspan fill="#4caf50" text-decoration="underline">${escapeXml(current)}</tspan><tspan fill="#7e7e7e">${escapeXml(todo)}</tspan>
        </text>`;

        const startY = 320;
        const lineSpacing = 52;
        lyricsSnippet.remainingLines.forEach((line, index) => {
            const y = startY + index * lineSpacing;
            typingLinesSvg += `
        <text x="366" y="${y}" font-size="28" font-family="DejaVu Sans Mono, monospace" xml:space="preserve">
          <tspan fill="#7e7e7e">${escapeXml(line)}</tspan>
        </text>`;
        });
    } else {
        // Fallback display when lyrics are instrumental or unavailable
        typingLinesSvg = `
        <text x="366" y="270" font-size="30" font-family="DejaVu Sans Mono, monospace">
          <tspan fill="#4caf50">&#x266A; </tspan><tspan fill="#ffffff" font-weight="bold">Type the lyrics to this track</tspan>
        </text>
        <text x="366" y="325" font-size="26" font-family="DejaVu Sans Mono, monospace">
          <tspan fill="#7e7e7e">Test your speed &amp; guess the song</tspan>
        </text>
        <text x="366" y="380" font-size="26" font-family="DejaVu Sans Mono, monospace">
          <tspan fill="#7e7e7e">Play free in your browser at</tspan>
        </text>
        <text x="366" y="435" font-size="26" font-family="DejaVu Sans Mono, monospace">
          <tspan fill="#4caf50">type.vincentchan.uk</tspan>
        </text>`;
    }

    return `<svg width="1200" height="630" viewBox="0 0 1200 630" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <radialGradient id="bgGrad1" cx="88%" cy="12%" r="42%">
      <stop offset="0%" stop-color="#4caf50" stop-opacity="0.18"/>
      <stop offset="100%" stop-color="#121212" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="bgGrad2" cx="6%" cy="100%" r="40%">
      <stop offset="0%" stop-color="#4caf50" stop-opacity="0.10"/>
      <stop offset="100%" stop-color="#121212" stop-opacity="0"/>
    </radialGradient>
    <clipPath id="albumClip">
      <rect x="74" y="196" width="214" height="214" rx="10" ry="10" />
    </clipPath>
    <clipPath id="logoClip">
      <rect x="56" y="46" width="58" height="58" rx="12" ry="12" />
    </clipPath>
  </defs>

  <!-- Dark Background with emerald glows -->
  <rect width="1200" height="630" fill="#121212"/>
  <rect width="1200" height="630" fill="url(#bgGrad1)"/>
  <rect width="1200" height="630" fill="url(#bgGrad2)"/>

  <!-- Brand Header -->
  <g id="header">
    <image href="${logoUri}" x="56" y="46" width="58" height="58" clip-path="url(#logoClip)"/>
    <text x="132" y="90" fill="#ffffff" font-size="44" font-weight="bold" font-family="DejaVu Sans Mono, monospace">TuneTyper<tspan fill="#555555" font-weight="300"> / </tspan><tspan fill="#4caf50">${safeTaglineTrack}</tspan></text>
    <rect x="980" y="52" width="164" height="38" rx="19" fill="#4caf50" fill-opacity="0.15" stroke="#4caf50" stroke-opacity="0.35" stroke-width="1.5"/>
    <text x="1062" y="77" fill="#4caf50" font-size="14" font-weight="bold" font-family="DejaVu Sans Mono, monospace" text-anchor="middle" letter-spacing="1.5">SONG CHALLENGE</text>
  </g>

  <!-- Tagline -->
  <text x="56" y="148" fill="#c0c0c0" font-size="24" font-family="DejaVu Sans, Arial, sans-serif">
    Type the lyrics to <tspan fill="#4caf50" font-weight="bold">${safeTaglineTrack}</tspan> by <tspan fill="#ffffff" font-weight="bold">${safeTaglineArtist}</tspan>. Guess the tune &amp; beat your WPM.
  </text>

  <!-- Left: Track Card -->
  <g id="track-card">
    <rect x="56" y="180" width="250" height="320" rx="14" fill="#181818" stroke="#2e2e2e" stroke-width="2"/>
    <image href="${coverUri}" x="74" y="196" width="214" height="214" clip-path="url(#albumClip)"/>
    <text x="74" y="445" fill="#ffffff" font-size="20" font-weight="bold" font-family="DejaVu Sans, Arial, sans-serif">${safeCardTrack}</text>
    <text x="74" y="475" fill="#888888" font-size="15" font-family="DejaVu Sans, Arial, sans-serif">${safeCardMeta}</text>
  </g>

  <!-- Right: In-Game Typing Display Box -->
  <g id="display-box">
    <rect x="330" y="180" width="814" height="320" rx="14" fill="#1e1e1e" stroke="#333333" stroke-width="2"/>
    ${typingLinesSvg}
  </g>

  <!-- Footer -->
  <g id="footer">
    <text x="56" y="565" fill="#4caf50" font-size="32" font-weight="bold" font-family="DejaVu Sans Mono, monospace">
      Can you beat me?
    </text>
    <rect x="880" y="528" width="264" height="52" rx="10" fill="#4caf50"/>
    <text x="1012" y="562" fill="#121212" font-size="22" font-weight="bold" font-family="DejaVu Sans Mono, monospace" text-anchor="middle">
      Play ${safeCtaTrack} &#x2192;
    </text>
    <rect x="610" y="528" width="250" height="52" rx="10" fill="#1e1e1e" stroke="#333333" stroke-width="2"/>
    <text x="735" y="562" fill="#d1d1d1" font-size="20" font-family="DejaVu Sans Mono, monospace" text-anchor="middle">
      type.vincentchan.uk
    </text>
  </g>
</svg>`;
}

/**
 * Fetch an image URL and convert to base64 data URI
 */
async function fetchImageDataUri(url) {
    if (!url || typeof url !== 'string' || !url.startsWith('http')) {
        return getLogoDataUri();
    }
    try {
        const resp = await axios.get(url, {
            responseType: 'arraybuffer',
            timeout: 5000,
            headers: { 'Accept': 'image/jpeg,image/png,image/*;q=0.8' }
        });
        const contentType = resp.headers['content-type'] || 'image/jpeg';
        const base64 = Buffer.from(resp.data).toString('base64');
        return `data:${contentType};base64,${base64}`;
    } catch (_) {
        return getLogoDataUri();
    }
}

/**
 * Generate a PNG Buffer for a song OpenGraph card
 */
async function generateSongOgImage({ track, artist, album, coverUrl, lyrics }) {
    const coverDataUri = await fetchImageDataUri(coverUrl);
    const logoDataUri = getLogoDataUri();
    const lyricsSnippet = prepareLyricsSnippet(lyrics);

    const svg = buildSongOgSvg({
        track,
        artist,
        album,
        coverDataUri,
        logoDataUri,
        lyricsSnippet
    });

    const resvg = new Resvg(svg, {
        font: { loadSystemFonts: true },
        fitTo: { mode: 'width', value: 1200 }
    });

    const pngBuffer = resvg.render().asPng();
    return {
        pngBuffer,
        contentType: 'image/png'
    };
}

/**
 * Inject dynamic OpenGraph / Twitter meta tags into baseIndexHtml for a shared song/challenge
 */
function renderSongHtml(trackDetails, challenge, baseIndexHtml) {
    const trackTitle = trackDetails.title || 'TuneTyper Track';
    const artistName = (trackDetails.artist && trackDetails.artist.name) ? trackDetails.artist.name : (challenge.artist || 'Featured Artist');
    const trackId = trackDetails.id || challenge.trackId || null;

    const pageTitle = `${trackTitle} — ${artistName} | TuneTyper Challenge`;
    let description = '';
    if (challenge && challenge.wpm) {
        description = `Can you beat ${challenge.wpm} WPM? Type the lyrics to "${trackTitle}" by ${artistName} and guess the tune on TuneTyper!`;
    } else {
        description = `Type the lyrics to "${trackTitle}" by ${artistName}, guess the tune, and test your typing speed on TuneTyper!`;
    }

    const ogImageUrl = trackId
        ? `https://type.vincentchan.uk/api/og/track?id=${encodeURIComponent(trackId)}`
        : 'https://type.vincentchan.uk/og-image.png';

    const safeTitle = escapeXml(pageTitle);
    const safeDesc = escapeXml(description);
    const safeOgImage = escapeXml(ogImageUrl);
    const safeOgAlt = escapeXml(`TuneTyper challenge for "${trackTitle}" by ${artistName}: type the lyrics and beat your WPM.`);

    let html = baseIndexHtml;

    html = html.replace(/<title>[^<]*<\/title>/i, `<title>${safeTitle}</title>`);
    html = html.replace(/<meta\s+name=["']description["'][^>]*>/i, `<meta name="description" content="${safeDesc}">`);
    html = html.replace(/<meta\s+property=["']og:title["'][^>]*>/i, `<meta property="og:title" content="${safeTitle}">`);
    html = html.replace(/<meta\s+property=["']og:description["'][^>]*>/i, `<meta property="og:description" content="${safeDesc}">`);
    html = html.replace(/<meta\s+property=["']og:image["'][^>]*>/i, `<meta property="og:image" content="${safeOgImage}">`);
    html = html.replace(/<meta\s+property=["']og:image:alt["'][^>]*>/i, `<meta property="og:image:alt" content="${safeOgAlt}">`);
    html = html.replace(/<meta\s+name=["']twitter:title["'][^>]*>/i, `<meta name="twitter:title" content="${safeTitle}">`);
    html = html.replace(/<meta\s+name=["']twitter:description["'][^>]*>/i, `<meta name="twitter:description" content="${safeDesc}">`);
    html = html.replace(/<meta\s+name=["']twitter:image["'][^>]*>/i, `<meta name="twitter:image" content="${safeOgImage}">`);
    html = html.replace(/<meta\s+name=["']twitter:image:alt["'][^>]*>/i, `<meta name="twitter:image:alt" content="${safeOgAlt}">`);

    return html;
}

module.exports = {
    escapeXml,
    truncate,
    decodeChallengeToken,
    prepareLyricsSnippet,
    buildSongOgSvg,
    generateSongOgImage,
    renderSongHtml
};
