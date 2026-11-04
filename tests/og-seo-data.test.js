const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const {
    escapeXml,
    stripXmlIllegalChars,
    estimateTextWidth,
    fitTextToWidth,
    wrapWords,
    buildSongOgSvg,
    generateSongOgImage,
    renderSongHtml
} = require('../song-og');
const { FEATURED_ARTISTS, renderArtistHtml, generateSitemapXml } = require('../artists');
const { CURATED_PLAYLISTS, buildCuratedPlaylistsShelfHtml } = require('../playlists');

const baseIndexHtml = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf-8');

test.describe('Song OG card text safety', () => {
    test('escapeXml strips XML-illegal control characters and lone surrogates', () => {
        assert.equal(escapeXml('Bad\u0008Habits'), 'BadHabits');
        assert.equal(escapeXml('a\u0000b\u000Bc\u000Cd\u001Fe'), 'abcde');
        assert.equal(escapeXml('tab\tnl\ncr\r'), 'tab\tnl\ncr\r', 'TAB/LF/CR are legal XML and must be kept');
        assert.equal(escapeXml('x\uD800y'), 'xy', 'lone high surrogate removed');
        assert.equal(escapeXml('x\uDC00y'), 'xy', 'lone low surrogate removed');
        assert.equal(escapeXml('emoji 🎵'), 'emoji 🎵', 'valid surrogate pairs kept');
        assert.equal(stripXmlIllegalChars('A\u0001 & B'), 'A & B');
    });

    test('generateSongOgImage renders titles containing control characters instead of throwing', async () => {
        const result = await generateSongOgImage({
            track: 'Bad\u0008Habits\uD800',
            artist: 'Ed\u0001 Sheeran',
            album: '=\u001F',
            coverUrl: null,
            lyrics: null
        });
        assert.ok(Buffer.isBuffer(result.pngBuffer));
        assert.equal(result.pngBuffer.subarray(0, 4).toString('hex'), '89504e47');
    });

    test('generateSongOgImage keeps its return shape and reports fallbacks', async () => {
        const result = await generateSongOgImage({
            track: 'Song',
            artist: 'Artist',
            coverUrl: null,
            lyrics: null
        });
        assert.equal(result.contentType, 'image/png');
        assert.equal(result.coverFallback, true);
        assert.equal(result.lyricsFallback, true);
        assert.equal(result.usedFallback, true);
    });

    test('wrapWords never lets the last line absorb unbounded leftover words', () => {
        const lines = wrapWords('One Two Three Four Five Six Seven Eight Nine Ten Eleven Twelve', 20, 2);
        assert.equal(lines.length, 2);
        for (const line of lines) assert.ok(line.length <= 20, `"${line}" exceeds 20 chars`);
        assert.ok(lines[1].endsWith('…'));
        // Lines exactly at the limit are left alone
        assert.deepEqual(wrapWords('abcdefghij abcdefghi', 20, 2), ['abcdefghij abcdefghi']);
    });

    test('fitTextToWidth truncates with an ellipsis at a word boundary when possible', () => {
        assert.equal(fitTextToWidth('Short', 500, 20), 'Short');
        const fitted = fitTextToWidth('The quick brown fox jumps over the lazy dog again and again', 300, 20);
        assert.ok(fitted.endsWith('…'));
        assert.ok(estimateTextWidth(fitted, 20) <= 300);
        assert.ok(!/\s…$/.test(fitted));
        const longWord = fitTextToWidth('Supercalifragilisticexpialidociousandevenlonger', 200, 20);
        assert.ok(longWord.endsWith('…'));
        assert.ok(estimateTextWidth(longWord, 20) <= 200);
    });

    test('very long titles are truncated in the header, tagline and track card instead of overflowing', () => {
        const track = 'Long Title (feat. Somebody Very Famous & Another Collaborator) [Extended Remix Version 2024]';
        const artist = 'A Very Long Artist Name Collective Orchestra';
        const svg = buildSongOgSvg({ track, artist, album: 'Album', coverDataUri: 'data:,', logoDataUri: 'data:,' });

        const header = svg.match(/<tspan fill="#4caf50" font-size="(\d+)">([^<]*)<\/tspan><\/text>/);
        assert.ok(header, 'header track tspan present');
        assert.ok(header[2].endsWith('…'), 'header title is truncated');
        const headerPrefix = estimateTextWidth('TuneTyper / ', 44, { mono: true });
        assert.ok(132 + headerPrefix + estimateTextWidth(header[2].replace(/&amp;/g, '&'), Number(header[1]), { mono: true }) <= 1200 - 56);

        const tagline = svg.match(/<text x="56" y="148"[^>]*font-size="(\d+)"[^>]*>([\s\S]*?)<\/text>/);
        const plainTagline = tagline[2].replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').trim();
        assert.ok(plainTagline.includes('…'));
        assert.ok(estimateTextWidth(plainTagline, Number(tagline[1]), { bold: true }) <= 1088 + 40);

        const cardLines = [...svg.matchAll(/<text x="74" y="4(?:34|56)"[^>]*>([^<]*)<\/text>/g)].map(m => m[1]);
        assert.equal(cardLines.length, 2);
        for (const line of cardLines) {
            assert.ok(estimateTextWidth(line.replace(/&amp;/g, '&'), 17, { bold: true }) <= 214);
        }
    });

    test('short titles render untouched', () => {
        const svg = buildSongOgSvg({ track: 'Bad Habits', artist: 'Ed Sheeran', album: '=' });
        assert.match(svg, /<tspan fill="#4caf50" font-size="42">Bad Habits<\/tspan>/);
        assert.match(svg, /Type the lyrics to <tspan[^>]*>Bad Habits<\/tspan> by <tspan[^>]*>Ed Sheeran<\/tspan>\. Test and train your typing speed\./);
        assert.match(svg, /Play Bad Habits →/);
    });
});

test.describe('Song share page og:url', () => {
    test('og:url points at the shared track instead of the homepage', () => {
        const html = renderSongHtml(
            { id: 1409072752, title: 'Bad Habits', artist: { name: 'Ed Sheeran' } },
            { trackId: 1409072752, wpm: 108 },
            baseIndexHtml
        );
        assert.match(html, /<meta property="og:url" content="https:\/\/type\.vincentchan\.uk\/\?id=1409072752">/);
        assert.equal((html.match(/property="og:url"/g) || []).length, 1);
    });

    test('og:url falls back to artist/track query for legacy challenges without a track id', () => {
        const html = renderSongHtml(
            { id: null, title: 'Bad Habits', artist: { name: 'Ed Sheeran' } },
            { artist: 'Ed Sheeran', track: 'Bad Habits' },
            baseIndexHtml
        );
        assert.match(html, /<meta property="og:url" content="https:\/\/type\.vincentchan\.uk\/\?artist=Ed%20Sheeran&amp;track=Bad%20Habits">/);
    });
});

test.describe('Artist landing page SSR & sitemap', () => {
    test('popular tracks shelf is injected INSIDE #artist-tracks-slot so the client can replace it', () => {
        const artist = FEATURED_ARTISTS.find(a => a.slug === 'taylor-swift');
        const html = renderArtistHtml(artist, baseIndexHtml);
        assert.match(html, /<div id="artist-tracks-slot">\s*<section id="artist-tracks-shelf"[\s\S]*?<\/section>\s*<\/div>/);
        assert.equal((html.match(/id="artist-tracks-slot"/g) || []).length, 1);
    });

    test('sitemap omits a hard-coded lastmod by default but honours an explicit one', () => {
        assert.ok(!generateSitemapXml().includes('<lastmod>'));
        const withDate = generateSitemapXml('https://example.com', '2026-11-04');
        assert.match(withDate, /<loc>https:\/\/example\.com\/<\/loc>\n {4}<lastmod>2026-11-04<\/lastmod>/);
    });
});

test.describe('Artist data accuracy', () => {
    const find = (slug, title) => {
        const artist = FEATURED_ARTISTS.find(a => a.slug === slug);
        return artist && artist.tracks.find(t => t.title === title);
    };

    test('tracks carry original release years rather than compilation/live years', () => {
        const expected = [
            ['queen', 'Bohemian Rhapsody', '1975'],
            ['queen', 'Under Pressure', '1981'],
            ['kanye-west', 'Heartless', '2008'],
            ['ariana-grande', 'Into You', '2016'],
            ['sabrina-carpenter', 'Please Please Please', '2024'],
            ['beyonce', 'Single Ladies', '2008']
        ];
        for (const [slug, title, year] of expected) {
            const track = find(slug, title);
            assert.ok(track, `${title} should be listed under ${slug}`);
            assert.equal(track.year, year, `${title} year`);
        }
    });

    test('"Guess" (a Charli XCX song) is not listed under Billie Eilish', () => {
        assert.equal(find('billie-eilish', 'Guess'), undefined);
        assert.ok(find('charli-xcx', 'Guess'));
    });

    test('album names use straight apostrophes consistently', () => {
        for (const artist of FEATURED_ARTISTS) {
            for (const track of artist.tracks) {
                assert.ok(!/[‘’]/.test(track.album), `"${track.album}" contains a curly apostrophe`);
            }
        }
    });
});

test.describe('Curated playlists shelf', () => {
    test('badge count is derived from CURATED_PLAYLISTS', () => {
        const html = buildCuratedPlaylistsShelfHtml();
        assert.ok(html.includes(`>${CURATED_PLAYLISTS.length} Curated</span>`));
    });
});
