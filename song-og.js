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

const SITE_ORIGIN = 'https://type.vincentchan.uk';

// Characters that are illegal in XML 1.0 (C0 controls except TAB/LF/CR, U+FFFE/U+FFFF) plus
// unpaired UTF-16 surrogates. Any of these in an SVG makes resvg's XML parser throw.
const XML_ILLEGAL_CHARS_RE = /[\x00-\x08\x0B\x0C\x0E-\x1F\uFFFE\uFFFF]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;

/**
 * Remove characters that cannot appear in an XML document
 */
function stripXmlIllegalChars(str) {
    if (!str || typeof str !== 'string') return '';
    return str.replace(XML_ILLEGAL_CHARS_RE, '');
}

/**
 * Safely escape XML entities for SVG rendering
 */
function escapeXml(str) {
    if (!str || typeof str !== 'string') return '';
    return stripXmlIllegalChars(str)
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
 * Truncate a string cleanly at word boundaries and append ellipsis
 */
function truncateAtWord(str, maxLength = 42) {
    if (!str || typeof str !== 'string') return '';
    if (str.length <= maxLength) return str;
    const truncated = str.slice(0, maxLength);
    const lastSpace = truncated.lastIndexOf(' ');
    if (lastSpace > 0) {
        return truncated.slice(0, lastSpace) + '…';
    }
    return truncated + '…';
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

    // Join into flowing continuous text so lyrics naturally fill the display box without artificial line chopping
    const continuousText = rawLines.join(' ').replace(/\s+/g, ' ').trim();
    if (!continuousText) return null;

    // Wrap into up to 3 readable lines of ~40 chars to fill the 814px display box at 30px mono font
    const maxCharsPerLine = options.maxCharsPerLine || 40;
    const maxLines = options.maxLines || 3;
    const words = continuousText.split(/\s+/);
    const lines = [];
    let currentLine = '';

    for (let i = 0; i < words.length; i++) {
        const word = words[i];
        if (!currentLine) {
            currentLine = word;
        } else if ((currentLine + ' ' + word).length <= maxCharsPerLine) {
            currentLine += ' ' + word;
        } else {
            lines.push(currentLine);
            currentLine = word;
            if (lines.length === maxLines - 1) {
                const restWords = words.slice(i + 1);
                if (restWords.length > 0) {
                    const candidate = currentLine + ' ' + restWords.join(' ');
                    if (candidate.length <= maxCharsPerLine) {
                        currentLine = candidate;
                    } else {
                        let cut = candidate.slice(0, maxCharsPerLine - 3);
                        const lastSpace = cut.lastIndexOf(' ');
                        if (lastSpace > 0) cut = cut.slice(0, lastSpace);
                        currentLine = cut.trimEnd() + '...';
                    }
                }
                break;
            }
        }
    }
    if (currentLine) lines.push(currentLine);
    if (lines.length === 0) return null;

    // In line 1, construct an active typing state matching the artist card and in-game typing:
    // done: completed word(s) in green
    // ok: typed character(s) of active word in green with underline
    // caret: active character currently being typed in white with underline and cursor bar
    // todoWord: untyped character(s) of active word with underline
    // todo: remaining text on line 1 in muted grey
    const firstLineWords = lines[0].split(' ');
    let done = '';
    let ok = '';
    let caret = '';
    let todoWord = '';
    let todo = '';

    if (firstLineWords.length >= 2) {
        done = firstLineWords[0] + ' ';
        const activeWord = firstLineWords[1];
        if (activeWord.length === 1) {
            ok = '';
            caret = activeWord;
            todoWord = '';
        } else if (activeWord.length === 2) {
            ok = activeWord[0];
            caret = activeWord[1];
            todoWord = '';
        } else {
            const splitIdx = Math.max(1, Math.floor(activeWord.length / 2));
            ok = activeWord.slice(0, splitIdx - 1);
            caret = activeWord[splitIdx - 1];
            todoWord = activeWord.slice(splitIdx);
        }
        todo = firstLineWords.slice(2).join(' ');
        if (todo) todo = ' ' + todo;
    } else if (firstLineWords.length === 1) {
        const activeWord = firstLineWords[0];
        if (activeWord.length === 1) {
            done = '';
            ok = '';
            caret = activeWord;
            todoWord = '';
        } else if (activeWord.length === 2) {
            done = '';
            ok = activeWord[0];
            caret = activeWord[1];
            todoWord = '';
        } else {
            const splitIdx = Math.max(1, Math.floor(activeWord.length / 2));
            ok = activeWord.slice(0, splitIdx - 1);
            caret = activeWord[splitIdx - 1];
            todoWord = activeWord.slice(splitIdx);
        }
        todo = '';
    }

    const current = ok + caret + todoWord;

    return {
        line1: { done, ok, caret, todoWord, current, todo },
        remainingLines: lines.slice(1)
    };
}

/**
 * Split text at word boundaries into up to maxLines lines without truncating words
 */
function wrapWords(text, maxCharsPerLine = 20, maxLines = 2) {
    if (!text || typeof text !== 'string') return [];
    const words = text.trim().split(/\s+/);
    const lines = [];
    let currentLine = '';

    for (let i = 0; i < words.length; i++) {
        const word = words[i];
        if (!currentLine) {
            currentLine = word;
        } else if ((currentLine + ' ' + word).length <= maxCharsPerLine) {
            currentLine += ' ' + word;
        } else {
            lines.push(currentLine);
            currentLine = word;
            if (lines.length === maxLines - 1) {
                const rest = words.slice(i + 1).join(' ');
                if (rest) currentLine += ' ' + rest;
                break;
            }
        }
    }
    if (currentLine) lines.push(currentLine);
    // Never let a line exceed the budget: the last line absorbs leftover words, and a single
    // very long word can overflow any line, so clip with an ellipsis at a word boundary.
    return lines.map(line => (line.length > maxCharsPerLine ? truncateAtWord(line, maxCharsPerLine - 1) : line));
}

/**
 * Rough per-character advance width (in em) for the bundled DejaVu fonts.
 * Deliberately a little generous so estimates err towards fitting inside the frame.
 */
function charWidthEm(ch, { mono = false, bold = false } = {}) {
    const cp = ch.codePointAt(0);
    // East Asian wide / fullwidth / emoji: roughly a full em in any font
    if (
        (cp >= 0x1100 && cp <= 0x115F) ||
        (cp >= 0x2E80 && cp <= 0xA4CF) ||
        (cp >= 0xAC00 && cp <= 0xD7A3) ||
        (cp >= 0xF900 && cp <= 0xFAFF) ||
        (cp >= 0xFE30 && cp <= 0xFE4F) ||
        (cp >= 0xFF00 && cp <= 0xFF60) ||
        (cp >= 0xFFE0 && cp <= 0xFFE6) ||
        (cp >= 0x1F300 && cp <= 0x1FAFF) ||
        (cp >= 0x20000 && cp <= 0x3FFFD)
    ) {
        return 1.0;
    }
    if (mono) return 1233 / 2048; // DejaVu Sans Mono advance (~0.602em)
    let w;
    if (ch === ' ') w = 0.32;
    else if (/[ijlI.,:;'!|`]/.test(ch)) w = 0.3;
    else if (/[frt()\[\]\-"]/.test(ch)) w = 0.42;
    else if (/[mwMW@%]/.test(ch)) w = 0.9;
    else if (/[A-Z&]/.test(ch)) w = 0.72;
    else w = 0.62;
    return bold ? w * 1.1 : w;
}

/**
 * Estimate rendered width of text in px for a given font size
 */
function estimateTextWidth(text, fontSize, opts = {}) {
    if (!text) return 0;
    let em = 0;
    for (const ch of text) em += charWidthEm(ch, opts);
    return em * fontSize;
}

/**
 * Truncate text with an ellipsis so its estimated width fits within maxWidth px.
 * Prefers word boundaries (truncateAtWord) unless that would discard too much of the text.
 */
function fitTextToWidth(text, maxWidth, fontSize, opts = {}) {
    if (!text || typeof text !== 'string') return '';
    if (estimateTextWidth(text, fontSize, opts) <= maxWidth) return text;

    const budget = maxWidth - estimateTextWidth('…', fontSize, opts);
    const chars = Array.from(text);
    let used = 0;
    let count = 0;
    for (const ch of chars) {
        const w = charWidthEm(ch, opts) * fontSize;
        if (used + w > budget) break;
        used += w;
        count++;
    }
    const hard = chars.slice(0, count).join('').trimEnd();
    if (!hard) return '…';
    // Cut at the last word boundary inside the prefix we know fits (the next char decides
    // whether the prefix already ends on a word boundary).
    const nextChar = chars[count] || '';
    const atWord = /\s/.test(nextChar) ? hard + '…' : truncateAtWord(hard + ' ', hard.length);
    if (atWord.length - 1 >= hard.length * 0.6) return atWord;
    return hard + '…';
}

/**
 * Build 1200x630 SVG for dynamic Song OpenGraph card
 */
function buildSongOgSvg({ track, artist, album, coverDataUri, logoDataUri, lyricsSnippet }) {
    // Strip XML-illegal characters up-front so length/width estimates match what is rendered
    const rawTrack = stripXmlIllegalChars(track).trim() || 'Unknown Track';
    const rawArtist = stripXmlIllegalChars(artist).trim() || 'Unknown Artist';
    const rawAlbum = stripXmlIllegalChars(album).trim() || rawTrack || 'Single';

    // 1. Header font scaling: scale down smoothly as track length increases so full title fits without truncating
    let headerFontSize = 42;
    let headerY = 90;
    if (rawTrack.length > 34) {
        headerFontSize = 26;
        headerY = 86;
    } else if (rawTrack.length > 25) {
        headerFontSize = 32;
        headerY = 88;
    } else if (rawTrack.length > 18) {
        headerFontSize = 36;
        headerY = 89;
    }
    // "TuneTyper / " is set at 44px bold mono from x=132; the track title gets the rest of the
    // row up to the 56px right margin. Clip very long titles rather than overflow the card.
    const headerPrefixWidth = estimateTextWidth('TuneTyper / ', 44, { mono: true });
    const headerTrackMaxWidth = 1200 - 56 - 132 - headerPrefixWidth;
    const safeHeaderTrack = escapeXml(fitTextToWidth(rawTrack, headerTrackMaxWidth, headerFontSize, { mono: true }));

    // 2. Tagline font scaling: ensure full track and artist fit without overflowing the 1200px frame
    const combinedTaglineLen = rawTrack.length + rawArtist.length;
    let taglineFontSize = 24;
    if (combinedTaglineLen > 50) {
        taglineFontSize = 19;
    } else if (combinedTaglineLen > 36) {
        taglineFontSize = 21;
    }
    const taglineMaxWidth = 1200 - 56 * 2;
    const taglinePrefix = 'Type the lyrics to ';
    const taglineBy = ' by ';
    let taglineSuffix = '. Test and train your typing speed.';
    const taglineWidthAt = (suffix, fs) =>
        estimateTextWidth(taglinePrefix + taglineBy + suffix, fs) +
        estimateTextWidth(rawTrack + rawArtist, fs, { bold: true });
    // Step down further if the width estimate still overflows, then drop the trailing sentence
    for (const fs of [24, 21, 19]) {
        if (fs > taglineFontSize) continue;
        taglineFontSize = fs;
        if (taglineWidthAt(taglineSuffix, fs) <= taglineMaxWidth) break;
    }
    if (taglineWidthAt(taglineSuffix, taglineFontSize) > taglineMaxWidth) {
        taglineSuffix = '.';
    }
    // Last resort: clip track/artist names (artist gets at most 40% of the remaining space)
    let taglineTrack = rawTrack;
    let taglineArtist = rawArtist;
    const namesBudget = taglineMaxWidth - estimateTextWidth(taglinePrefix + taglineBy + taglineSuffix, taglineFontSize);
    const trackW = estimateTextWidth(rawTrack, taglineFontSize, { bold: true });
    const artistW = estimateTextWidth(rawArtist, taglineFontSize, { bold: true });
    if (trackW + artistW > namesBudget) {
        const artistBudget = Math.min(artistW, namesBudget * 0.4);
        taglineArtist = fitTextToWidth(rawArtist, artistBudget, taglineFontSize, { bold: true });
        const usedArtist = estimateTextWidth(taglineArtist, taglineFontSize, { bold: true });
        taglineTrack = fitTextToWidth(rawTrack, namesBudget - usedArtist, taglineFontSize, { bold: true });
    }
    const safeTaglineTrack = escapeXml(taglineTrack);
    const safeTaglineArtist = escapeXml(taglineArtist);
    const safeTaglineSuffix = escapeXml(taglineSuffix);

    // 3. Track card multi-line wrapping: split long titles across 2 lines so the full title fits below album art
    // Card content area is the 214px album-art column (x 74 -> 288)
    const cardWidth = 214;
    const fitsOneLine = estimateTextWidth(rawTrack, 20, { bold: true }) <= cardWidth;
    const trackCardLines = fitsOneLine
        ? [rawTrack]
        : wrapWords(rawTrack, 20, 2).map(line => fitTextToWidth(line, cardWidth, 17, { bold: true }));
    let cardTitleSvg = '';
    let cardMetaY = 478;

    if (trackCardLines.length === 1) {
        const size = fitsOneLine ? 20 : 17;
        cardTitleSvg = `<text x="74" y="445" fill="#ffffff" font-size="${size}" font-weight="bold" font-family="DejaVu Sans, Arial, sans-serif">${escapeXml(trackCardLines[0])}</text>`;
        cardMetaY = 475;
    } else {
        cardTitleSvg = `
        <text x="74" y="434" fill="#ffffff" font-size="17" font-weight="bold" font-family="DejaVu Sans, Arial, sans-serif">${escapeXml(trackCardLines[0])}</text>
        <text x="74" y="456" fill="#ffffff" font-size="17" font-weight="bold" font-family="DejaVu Sans, Arial, sans-serif">${escapeXml(trackCardLines[1])}</text>`;
        cardMetaY = 482;
    }

    const metaText = `${rawArtist} • ${rawAlbum}`;
    const safeMetaText = escapeXml(fitTextToWidth(truncate(metaText, 28), cardWidth, 14));

    // 4. Action button text: use the track name when it fits the 264px button, else a clean "Play Track →"
    let ctaText = 'Play Track →';
    const namedCta = `Play ${rawTrack} →`;
    if (rawTrack.length <= 15 && estimateTextWidth(namedCta, 22, { mono: true, bold: true }) <= 264 - 24) {
        ctaText = namedCta;
    }

    const logoUri = logoDataUri || getLogoDataUri();
    const coverUri = coverDataUri || logoUri;

    // Build the typing display box lines
    let typingLinesSvg = '';
    if (lyricsSnippet && lyricsSnippet.line1) {
        const { done, ok, caret, todoWord, current, todo } = lyricsSnippet.line1;
        const remainingLines = lyricsSnippet.remainingLines || [];
        const lineCount = 1 + remainingLines.length;

        const fontSize = 30;
        const lineSpacing = lineCount >= 4 ? 48 : 54;
        const boxCenterY = 180 + 320 / 2; // 340 (box y: 180, height: 320)
        const totalHeight = (lineCount - 1) * lineSpacing;
        const startY = Math.round(boxCenterY - totalHeight / 2 + (fontSize * 0.35));
        const startX = 366;

        const safeDone = escapeXml(done);
        const safeOk = escapeXml(ok || '');
        const safeCaret = escapeXml(caret || current || '');
        const safeTodoWord = escapeXml(todoWord || '');
        const safeTodo = escapeXml(todo);

        // Calculate cursor bar coordinates right before caret character
        // In DejaVu Sans Mono, character advance width = fontSize * 1233 / 2048 (~18.06px at 30px)
        const charWidth = fontSize * 1233 / 2048;
        const charsBeforeCaret = (done + (ok || '')).length;
        const cursorX = (startX + charsBeforeCaret * charWidth).toFixed(1);
        const cursorY = (startY - fontSize * 0.82).toFixed(1);
        const cursorH = (fontSize * 1.02).toFixed(1);

        typingLinesSvg += `<rect x="${cursorX}" y="${cursorY}" width="3" height="${cursorH}" fill="#ffffff" rx="1"/>
        <text x="${startX}" y="${startY}" font-size="${fontSize}" font-family="DejaVu Sans Mono, monospace" xml:space="preserve"><tspan fill="#4caf50">${safeDone}</tspan><tspan fill="#4caf50" text-decoration="underline">${safeOk}</tspan><tspan fill="#ffffff" text-decoration="underline">${safeCaret}</tspan><tspan fill="#7e7e7e" text-decoration="underline">${safeTodoWord}</tspan><tspan fill="#7e7e7e">${safeTodo}</tspan></text>`;

        remainingLines.forEach((line, index) => {
            const y = startY + (index + 1) * lineSpacing;
            typingLinesSvg += `\n        <text x="${startX}" y="${y}" font-size="${fontSize}" font-family="DejaVu Sans Mono, monospace" xml:space="preserve"><tspan fill="#7e7e7e">${escapeXml(line)}</tspan></text>`;
        });
    } else {
        // Fallback display when lyrics are instrumental or unavailable
        typingLinesSvg = `<text x="366" y="270" font-size="30" font-family="DejaVu Sans Mono, monospace"><tspan fill="#4caf50">&#x266A; </tspan><tspan fill="#ffffff" font-weight="bold">Type the lyrics to this track</tspan></text>
        <text x="366" y="325" font-size="26" font-family="DejaVu Sans Mono, monospace"><tspan fill="#7e7e7e">Test and train your typing speed</tspan></text>
        <text x="366" y="380" font-size="26" font-family="DejaVu Sans Mono, monospace"><tspan fill="#7e7e7e">Play free in your browser at</tspan></text>
        <text x="366" y="435" font-size="26" font-family="DejaVu Sans Mono, monospace"><tspan fill="#4caf50">type.vincentchan.uk</tspan></text>`;
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

  <!-- Brand Header: full-width, no overlapping pill -->
  <g id="header">
    <image href="${escapeXml(logoUri)}" x="56" y="46" width="58" height="58" clip-path="url(#logoClip)"/>
    <text x="132" y="${headerY}" fill="#ffffff" font-size="44" font-weight="bold" font-family="DejaVu Sans Mono, monospace">TuneTyper<tspan fill="#555555" font-weight="300"> / </tspan><tspan fill="#4caf50" font-size="${headerFontSize}">${safeHeaderTrack}</tspan></text>
  </g>

  <!-- Tagline: dynamically scaled so full track + artist are never truncated -->
  <text x="56" y="148" fill="#c0c0c0" font-size="${taglineFontSize}" font-family="DejaVu Sans, Arial, sans-serif">
    Type the lyrics to <tspan fill="#4caf50" font-weight="bold">${safeTaglineTrack}</tspan> by <tspan fill="#ffffff" font-weight="bold">${safeTaglineArtist}</tspan>${safeTaglineSuffix}
  </text>

  <!-- Left: Track Card with multi-line title wrapping -->
  <g id="track-card">
    <rect x="56" y="180" width="250" height="320" rx="14" fill="#181818" stroke="#2e2e2e" stroke-width="2"/>
    <image href="${escapeXml(coverUri)}" x="74" y="196" width="214" height="214" clip-path="url(#albumClip)"/>
    ${cardTitleSvg}
    <text x="74" y="${cardMetaY}" fill="#888888" font-size="14" font-family="DejaVu Sans, Arial, sans-serif">${safeMetaText}</text>
  </g>

  <!-- Right: In-Game Typing Display Box -->
  <g id="display-box">
    <rect x="330" y="180" width="814" height="320" rx="14" fill="#1e1e1e" stroke="#333333" stroke-width="2"/>
    ${typingLinesSvg}
  </g>

  <!-- Clean Footer: URL on the left, CTA on the right -->
  <g id="footer">
    <rect x="56" y="528" width="260" height="52" rx="10" fill="#1e1e1e" stroke="#333333" stroke-width="2"/>
    <text x="186" y="562" fill="#d1d1d1" font-size="20" font-family="DejaVu Sans Mono, monospace" text-anchor="middle">
      type.vincentchan.uk
    </text>

    <rect x="880" y="528" width="264" height="52" rx="10" fill="#4caf50"/>
    <text x="1012" y="562" fill="#121212" font-size="22" font-weight="bold" font-family="DejaVu Sans Mono, monospace" text-anchor="middle">
      ${escapeXml(ctaText)}
    </text>
  </g>
</svg>`;
}

/**
 * Fetch an image URL and convert to base64 data URI
 */
async function fetchImageDataUri(url) {
    return (await fetchImageDataUriWithStatus(url)).dataUri;
}

/**
 * Like fetchImageDataUri, but also reports whether the logo fallback was used
 */
async function fetchImageDataUriWithStatus(url) {
    if (!url || typeof url !== 'string' || !url.startsWith('http')) {
        return { dataUri: getLogoDataUri(), fallback: true };
    }
    try {
        const resp = await axios.get(url, {
            responseType: 'arraybuffer',
            timeout: 5000,
            headers: { 'Accept': 'image/jpeg,image/png,image/*;q=0.8' }
        });
        const contentType = resp.headers['content-type'] || 'image/jpeg';
        const base64 = Buffer.from(resp.data).toString('base64');
        return { dataUri: `data:${contentType};base64,${base64}`, fallback: false };
    } catch (_) {
        return { dataUri: getLogoDataUri(), fallback: true };
    }
}

// Cache bundled font file paths for isolated serverless environments (e.g. AWS Lambda / Vercel)
let cachedFontFiles = null;
function getFontFiles() {
    if (!cachedFontFiles) {
        const fontDir = path.join(__dirname, 'assets', 'fonts');
        const candidates = [
            path.join(fontDir, 'DejaVuSans.ttf'),
            path.join(fontDir, 'DejaVuSans-Bold.ttf'),
            path.join(fontDir, 'DejaVuSansMono.ttf'),
            path.join(fontDir, 'DejaVuSansMono-Bold.ttf')
        ];
        cachedFontFiles = candidates.filter(f => fs.existsSync(f));
    }
    return cachedFontFiles;
}

/**
 * Generate a PNG Buffer for a song OpenGraph card
 */
async function generateSongOgImage({ track, artist, album, coverUrl, lyrics }) {
    const { dataUri: coverDataUri, fallback: coverFallback } = await fetchImageDataUriWithStatus(coverUrl);
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

    const fontFiles = getFontFiles();
    const resvg = new Resvg(svg, {
        font: {
            fontFiles: fontFiles.length > 0 ? fontFiles : undefined,
            // Scanning system fonts costs seconds per render on desktop OSes (and serverless
            // hosts have essentially none), so rely on the bundled DejaVu fonts when present.
            loadSystemFonts: fontFiles.length === 0,
            defaultFontFamily: 'DejaVu Sans',
            monospaceFamily: 'DejaVu Sans Mono',
            sansSerifFamily: 'DejaVu Sans'
        },
        fitTo: { mode: 'width', value: 1200 }
    });

    const pngBuffer = resvg.render().asPng();
    const lyricsFallback = !lyricsSnippet;
    return {
        pngBuffer,
        contentType: 'image/png',
        // Degraded renders (logo instead of cover art / generic copy instead of lyrics): callers
        // can use these to apply a shorter cache lifetime so a later request can do better.
        coverFallback,
        lyricsFallback,
        usedFallback: coverFallback || lyricsFallback
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
        description = `Can you beat ${challenge.wpm} WPM? Type the lyrics to "${trackTitle}" by ${artistName} and test your typing speed on TuneTyper!`;
    } else {
        description = `Type the lyrics to "${trackTitle}" by ${artistName}. Test and train your typing speed on TuneTyper!`;
    }

    const ogImageUrl = trackId
        ? `${SITE_ORIGIN}/api/og/track?id=${encodeURIComponent(trackId)}`
        : `${SITE_ORIGIN}/og-image.png`;

    // og:url must point at the shared song, otherwise Facebook/LinkedIn resolve the page to the
    // homepage and show the homepage card instead of the song card.
    const shareUrl = trackId
        ? `${SITE_ORIGIN}/?id=${encodeURIComponent(trackId)}`
        : `${SITE_ORIGIN}/?artist=${encodeURIComponent(artistName)}&track=${encodeURIComponent(trackTitle)}`;

    const safeTitle = escapeXml(pageTitle);
    const safeDesc = escapeXml(description);
    const safeOgImage = escapeXml(ogImageUrl);
    const safeShareUrl = escapeXml(shareUrl);
    const safeOgAlt = escapeXml(`TuneTyper challenge for "${trackTitle}" by ${artistName}: type the lyrics and beat your WPM.`);

    let html = baseIndexHtml;

    html = html.replace(/<title>[^<]*<\/title>/i, () => `<title>${safeTitle}</title>`);
    html = html.replace(/<meta\s+name=["']description["'][^>]*>/i, () => `<meta name="description" content="${safeDesc}">`);
    html = html.replace(/<meta\s+property=["']og:url["'][^>]*>/i, () => `<meta property="og:url" content="${safeShareUrl}">`);
    html = html.replace(/<meta\s+property=["']og:title["'][^>]*>/i, () => `<meta property="og:title" content="${safeTitle}">`);
    html = html.replace(/<meta\s+property=["']og:description["'][^>]*>/i, () => `<meta property="og:description" content="${safeDesc}">`);
    html = html.replace(/<meta\s+property=["']og:image["'][^>]*>/i, () => `<meta property="og:image" content="${safeOgImage}">`);
    html = html.replace(/<meta\s+property=["']og:image:alt["'][^>]*>/i, () => `<meta property="og:image:alt" content="${safeOgAlt}">`);
    html = html.replace(/<meta\s+name=["']twitter:title["'][^>]*>/i, () => `<meta name="twitter:title" content="${safeTitle}">`);
    html = html.replace(/<meta\s+name=["']twitter:description["'][^>]*>/i, () => `<meta name="twitter:description" content="${safeDesc}">`);
    html = html.replace(/<meta\s+name=["']twitter:image["'][^>]*>/i, () => `<meta name="twitter:image" content="${safeOgImage}">`);
    html = html.replace(/<meta\s+name=["']twitter:image:alt["'][^>]*>/i, () => `<meta name="twitter:image:alt" content="${safeOgAlt}">`);

    return html;
}

module.exports = {
    escapeXml,
    stripXmlIllegalChars,
    estimateTextWidth,
    fitTextToWidth,
    truncate,
    truncateAtWord,
    wrapWords,
    getFontFiles,
    decodeChallengeToken,
    prepareLyricsSnippet,
    buildSongOgSvg,
    generateSongOgImage,
    renderSongHtml
};
