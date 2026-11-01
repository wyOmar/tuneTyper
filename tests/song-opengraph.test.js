const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');

const {
    escapeXml,
    truncate,
    wrapWords,
    getFontFiles,
    decodeChallengeToken,
    prepareLyricsSnippet,
    buildSongOgSvg,
    generateSongOgImage,
    renderSongHtml
} = require('../song-og');

const app = require('../server');

test.describe('Dynamic Song OpenGraph Generator & SSR Metadata', () => {

    test.describe('Helper utilities & token decoder', () => {
        test('escapeXml correctly escapes XML entities to prevent SVG injection or syntax errors', () => {
            assert.equal(escapeXml('<script>alert("xss & \'fun\'")</script>'), '&lt;script&gt;alert(&quot;xss &amp; &apos;fun&apos;&quot;)&lt;/script&gt;');
            assert.equal(escapeXml('Rock & Roll'), 'Rock &amp; Roll');
            assert.equal(escapeXml(null), '');
            assert.equal(escapeXml(undefined), '');
        });

        test('truncate truncates strings and appends ellipsis without breaking words abruptly', () => {
            assert.equal(truncate('Short title', 20), 'Short title');
            assert.equal(truncate('This is a very long track title that will overflow the card', 25), 'This is a very long trac…');
            assert.equal(truncate('', 10), '');
            assert.equal(truncate(null, 10), '');
        });

        test('wrapWords wraps text at word boundaries into multiple lines without truncating words', () => {
            const lines = wrapWords('We Almost Broke Up Again Last Night', 20, 2);
            assert.deepEqual(lines, ['We Almost Broke Up', 'Again Last Night']);
            assert.deepEqual(wrapWords('the grudge', 20, 2), ['the grudge']);
            assert.deepEqual(wrapWords('', 20, 2), []);
            assert.deepEqual(wrapWords(null, 20, 2), []);
        });

        test('decodeChallengeToken decodes v3 binary token into trackId, wpm, and condition flags', () => {
            // "Bad Habits" by Ed Sheeran, 108 WPM, trackId 1409072752
            const token = 'wGwAABsEAABT_L5w';
            const decoded = decodeChallengeToken(token);
            assert.ok(decoded);
            assert.equal(decoded.trackId, 1409072752);
            assert.equal(decoded.wpm, 108);
            assert.equal(decoded.start, 27);
            assert.equal(decoded.adlib, true);
        });

        test('decodeChallengeToken safely returns null for invalid or corrupted tokens', () => {
            assert.equal(decodeChallengeToken(''), null);
            assert.equal(decodeChallengeToken('invalid!@#$%'), null);
            assert.equal(decodeChallengeToken(null), null);
        });
    });

    test.describe('Lyrics snippet preparation', () => {
        test('prepareLyricsSnippet strips bracketed tags and formats lines with syntax highlighting structure', () => {
            const rawLyrics = `[Verse 1]\nEvery time you come around, you know I cannot say no\nEvery time the sun goes down, I let you take control\n[Chorus]\nI can feel the paradise before my world implodes`;
            const snippet = prepareLyricsSnippet(rawLyrics);
            assert.ok(snippet);
            assert.ok(snippet.line1);
            assert.ok(snippet.line1.done.length > 0);
            assert.ok(snippet.line1.current.length > 0);
            assert.ok(Array.isArray(snippet.remainingLines));
            assert.ok(snippet.remainingLines.length > 0);
            // Verify [Verse 1] was filtered out
            assert.ok(!snippet.remainingLines.some(l => l.includes('[Verse 1]')));
        });

        test('prepareLyricsSnippet returns null for empty or missing lyrics', () => {
            assert.equal(prepareLyricsSnippet(''), null);
            assert.equal(prepareLyricsSnippet(null), null);
            assert.equal(prepareLyricsSnippet('   \n  \n  '), null);
        });
    });

    test.describe('SVG & PNG image generation', () => {
        test('buildSongOgSvg produces valid 1200x630 SVG with dark theme and no pill or "can you beat me"', () => {
            const svg = buildSongOgSvg({
                track: 'Bad Habits',
                artist: 'Ed Sheeran',
                album: 'Bad Habits',
                lyricsSnippet: prepareLyricsSnippet('Every time you come around, you know I cannot say no\nEvery time the sun goes down, I let you take control')
            });

            assert.ok(svg.includes('width="1200"'));
            assert.ok(svg.includes('height="630"'));
            assert.ok(svg.includes('Bad Habits'));
            assert.ok(svg.includes('Ed Sheeran'));
            // Verified: top-right SONG CHALLENGE pill and bottom-left "Can you beat me?" removed
            assert.ok(!svg.includes('SONG CHALLENGE'));
            assert.ok(!svg.includes('Can you beat me?'));
            assert.ok(svg.includes('type.vincentchan.uk'));
            assert.ok(svg.includes('Play Bad Habits &#x2192;') || svg.includes('Play Bad Habits →'));
        });

        test('buildSongOgSvg handles long titles with dynamic font scaling and multi-line wrapping', () => {
            const svg = buildSongOgSvg({
                track: 'We Almost Broke Up Again Last Night',
                artist: 'Sabrina Carpenter',
                album: "Man's Best Friend",
                lyricsSnippet: prepareLyricsSnippet('Bullshit repeats itself\nIs that how the saying goes?')
            });

            // Long title in track card wraps to 2 lines instead of cutting off
            assert.ok(svg.includes('We Almost Broke Up'));
            assert.ok(svg.includes('Again Last Night'));
            // Long title in CTA button uses clean "Play Track →" instead of awkward truncated title
            assert.ok(svg.includes('Play Track &#x2192;') || svg.includes('Play Track →'));
            // Full title is present in the header with scaled font
            assert.ok(svg.includes('We Almost Broke Up Again Last Night'));
            assert.ok(!svg.includes('SONG CHALLENGE'));
            assert.ok(!svg.includes('Can you beat me?'));
        });

        test('buildSongOgSvg renders fallback text when lyrics are null or unavailable', () => {
            const svg = buildSongOgSvg({
                track: 'Instrumental Symphony',
                artist: 'Classical Artist',
                album: 'Orchestral Pieces',
                lyricsSnippet: null
            });

            assert.ok(svg.includes('Type the lyrics to this track'));
            assert.ok(svg.includes('Instrumental Symphony'));
        });

        test('bundled DejaVu font files are loaded so serverless environments without OS fonts render text', () => {
            const fontFiles = getFontFiles();
            assert.ok(Array.isArray(fontFiles) && fontFiles.length >= 2, `Expected at least 2 font files, got ${fontFiles.length}`);
            assert.ok(fontFiles.some(f => f.includes('DejaVuSans.ttf')));
            assert.ok(fontFiles.some(f => f.includes('DejaVuSansMono.ttf')));
        });

        test('generateSongOgImage produces valid PNG buffer (89 50 4E 47)', async () => {
            const result = await generateSongOgImage({
                track: 'Bad Habits',
                artist: 'Ed Sheeran',
                album: 'Bad Habits',
                coverUrl: null, // tests fallback to logo
                lyrics: 'Every time you come around, you know I cannot say no'
            });

            assert.equal(result.contentType, 'image/png');
            assert.ok(Buffer.isBuffer(result.pngBuffer));
            assert.ok(result.pngBuffer.length > 10000, `Expected PNG buffer size > 10KB, got ${result.pngBuffer.length}`);
            // Check PNG magic bytes: \x89PNG (0x89, 0x50, 0x4e, 0x47)
            assert.equal(result.pngBuffer[0], 0x89);
            assert.equal(result.pngBuffer[1], 0x50);
            assert.equal(result.pngBuffer[2], 0x4e);
            assert.equal(result.pngBuffer[3], 0x47);
        });
    });

    test.describe('renderSongHtml SSR metadata injection', () => {
        const sampleIndexHtml = `<!DOCTYPE html><html><head>
<title>TuneTyper - Default</title>
<meta name="description" content="Default description">
<meta property="og:title" content="Default OG Title">
<meta property="og:description" content="Default OG Description">
<meta property="og:image" content="https://type.vincentchan.uk/og-image.png">
<meta property="og:image:alt" content="Default Alt">
<meta name="twitter:title" content="Default Twitter Title">
<meta name="twitter:description" content="Default Twitter Description">
<meta name="twitter:image" content="https://type.vincentchan.uk/og-image.png">
<meta name="twitter:image:alt" content="Default Alt">
</head><body><h1>TuneTyper</h1></body></html>`;

        test('injects dynamic challenge title, WPM description, and deterministic per-song og:image', () => {
            const trackDetails = {
                id: 1409072752,
                title: 'Bad Habits',
                artist: { name: 'Ed Sheeran' }
            };
            const challenge = { wpm: 108, trackId: 1409072752 };

            const html = renderSongHtml(trackDetails, challenge, sampleIndexHtml);

            assert.ok(html.includes('<title>Bad Habits — Ed Sheeran | TuneTyper Challenge</title>'));
            assert.ok(html.includes('Can you beat 108 WPM? Type the lyrics to &quot;Bad Habits&quot; by Ed Sheeran'));
            assert.ok(html.includes('content="https://type.vincentchan.uk/api/og/track?id=1409072752"'));
        });

        test('injects clean fallback description when WPM is omitted from challenge', () => {
            const trackDetails = {
                id: 1409072752,
                title: 'Bad Habits',
                artist: { name: 'Ed Sheeran' }
            };
            const challenge = { trackId: 1409072752 };

            const html = renderSongHtml(trackDetails, challenge, sampleIndexHtml);

            assert.ok(html.includes('Type the lyrics to &quot;Bad Habits&quot; by Ed Sheeran, guess the tune, and test your typing speed on TuneTyper!'));
        });
    });

    test.describe('Express HTTP integration tests', () => {
        let server;
        let baseUrl;

        test.before(async () => {
            await new Promise((resolve) => {
                server = http.createServer(app);
                server.listen(0, '127.0.0.1', () => {
                    const port = server.address().port;
                    baseUrl = `http://127.0.0.1:${port}`;
                    resolve();
                });
            });
        });

        test.after(async () => {
            if (server) {
                await new Promise((resolve) => server.close(resolve));
            }
        });

        test('GET / with v3 challenge token (?c=...) returns dynamic SSR HTML with song og:image', async () => {
            const res = await fetch(`${baseUrl}/?c=wGwAABsEAABT_L5w`);
            assert.equal(res.status, 200);
            assert.equal(res.headers.get('content-type'), 'text/html; charset=utf-8');
            assert.ok(res.headers.get('cache-control').includes('s-maxage=86400'));

            const html = await res.text();
            assert.ok(html.includes('Bad Habits — Ed Sheeran | TuneTyper Challenge'));
            assert.ok(html.includes('Can you beat 108 WPM?'));
            assert.ok(html.includes('content="https://type.vincentchan.uk/api/og/track?id=1409072752"'));
        });

        test('GET / without challenge parameters returns default base index.html', async () => {
            const res = await fetch(`${baseUrl}/`);
            assert.equal(res.status, 200);

            const html = await res.text();
            assert.ok(html.includes('<title>TuneTyper - Type Song Lyrics &amp; Guess the Tune</title>'));
            assert.ok(html.includes('content="https://type.vincentchan.uk/og-image.png"'));
        });

        test('GET /api/og/track?id=1409072752 returns 200 image/png with immutable Edge caching', async () => {
            const res = await fetch(`${baseUrl}/api/og/track?id=1409072752`);
            assert.equal(res.status, 200);
            assert.equal(res.headers.get('content-type'), 'image/png');
            assert.equal(res.headers.get('cache-control'), 'public, max-age=31536000, s-maxage=31536000, immutable');

            const buffer = Buffer.from(await res.arrayBuffer());
            assert.ok(buffer.length > 20000);
            // Verify PNG signature
            assert.equal(buffer[0], 0x89);
            assert.equal(buffer[1], 0x50);
            assert.equal(buffer[2], 0x4e);
            assert.equal(buffer[3], 0x47);
        });

        test('GET /og/track/:id.png alias route also serves identical image/png', async () => {
            const res = await fetch(`${baseUrl}/og/track/1409072752.png`);
            assert.equal(res.status, 200);
            assert.equal(res.headers.get('content-type'), 'image/png');
        });

        test('GET /api/og/track with non-numeric or missing id returns 400', async () => {
            const resNoId = await fetch(`${baseUrl}/api/og/track`);
            assert.equal(resNoId.status, 400);

            const resInvalidId = await fetch(`${baseUrl}/api/og/track?id=notanumber`);
            assert.equal(resInvalidId.status, 400);
        });
    });
});
