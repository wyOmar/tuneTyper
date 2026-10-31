const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');

const {
    FEATURED_ARTISTS,
    resolveArtistFromSlug,
    buildArtistSeoMetadata,
    renderArtistHtml,
    generateSitemapXml
} = require('../artists');

const app = require('../server');

// Helper for HTTP requests against the Express app
function requestApp(server, urlPath) {
    return new Promise((resolve, reject) => {
        const { port } = server.address();
        const req = http.get(`http://127.0.0.1:${port}${urlPath}`, (res) => {
            let body = '';
            res.setEncoding('utf8');
            res.on('data', (chunk) => { body += chunk; });
            res.on('end', () => resolve({ statusCode: res.statusCode, headers: res.headers, body }));
        });
        req.on('error', reject);
    });
}

test('Vercel serverless (@vercel/node) entrypoint contract', () => {
    assert.equal(
        typeof app,
        'function',
        'server.js default export (module.exports) MUST be a request handler function for @vercel/node'
    );
});

test('Curated artist SEO metadata & unique SSR content compliance', async (t) => {
    await t.test('All 30 curated artists satisfy Google SERP bounds and have unique blurbs & tracks', () => {
        assert.equal(FEATURED_ARTISTS.length, 30, 'Should include 30 curated high-intent artists');

        const seenBlurbs = new Set();
        const baseIndexHtml = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf-8');

        for (const artist of FEATURED_ARTISTS) {
            const seo = buildArtistSeoMetadata(artist);

            assert.ok(
                seo.title.length >= 20 && seo.title.length <= 60,
                `Title for ${artist.name} ("${seo.title}", ${seo.title.length} chars) must be 20-60 chars`
            );
            assert.ok(
                seo.description.length >= 120 && seo.description.length <= 160,
                `Meta description for ${artist.name} ("${seo.description}", ${seo.description.length} chars) must be 120-160 chars`
            );
            assert.ok(
                seo.socialDescription.length <= 125,
                `Social description for ${artist.name} (${seo.socialDescription.length} chars) must be <= 125 chars`
            );
            assert.equal(seo.canonicalUrl, `https://type.vincentchan.uk/${artist.slug}`);

            assert.ok(artist.blurb && artist.blurb.length >= 60, `${artist.name} must have a descriptive unique blurb`);
            assert.ok(!seenBlurbs.has(artist.blurb), `Blurb for ${artist.name} must be unique across catalog`);
            seenBlurbs.add(artist.blurb);

            assert.ok(
                Array.isArray(artist.topTracks) && artist.topTracks.length >= 4,
                `${artist.name} should define featured topTracks`
            );

            // Verify SSR HTML body uniqueness & single semantic <h1>
            const rendered = renderArtistHtml(artist, baseIndexHtml);
            const h1Matches = rendered.match(/<h1\b[^>]*>[\s\S]*?<\/h1>/gi) || [];
            assert.equal(h1Matches.length, 1, `Rendered page for ${artist.name} should have exactly one <h1>`);
            assert.match(h1Matches[0], /artist-hero-title/);
            assert.ok(
                rendered.includes('class="artist-track-pill"'),
                `Rendered page for ${artist.name} must include clickable popular track pills`
            );
        }
    });

    await t.test('All 30 curated artists have crawlable internal links in public/index.html footer', () => {
        const baseIndexHtml = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf-8');
        for (const artist of FEATURED_ARTISTS) {
            assert.ok(
                baseIndexHtml.includes(`href="/${artist.slug}"`),
                `Footer in public/index.html must include internal link to /${artist.slug} to prevent orphan pages`
            );
        }
    });

    await t.test('resolveArtistFromSlug resolves curated names & compact slugs, and rejects unknown/reserved paths to prevent soft-404s', () => {
        const ts = resolveArtistFromSlug('taylor-swift');
        assert.equal(ts.name, 'Taylor Swift');
        assert.equal(ts.curated, true);

        const compactSc = resolveArtistFromSlug('sabrinacarpenter');
        assert.equal(compactSc.slug, 'sabrina-carpenter');
        assert.equal(compactSc.name, 'Sabrina Carpenter');
        assert.equal(compactSc.curated, true);

        const bey = resolveArtistFromSlug('beyonce');
        assert.equal(bey.name, 'Beyoncé');

        const tyler = resolveArtistFromSlug('tyler-the-creator');
        assert.equal(tyler.name, 'Tyler, The Creator');

        // Unknown / gibberish / bot-probed paths must return null so Express serves a true 404
        assert.equal(resolveArtistFromSlug('asdf-qwerty-gibberish'), null);
        assert.equal(resolveArtistFromSlug('wp-login'), null);
        assert.equal(resolveArtistFromSlug('privacy-policy'), null);

        // Reserved API & asset routes must return null
        assert.equal(resolveArtistFromSlug('tracks'), null);
        assert.equal(resolveArtistFromSlug('lyrics'), null);
        assert.equal(resolveArtistFromSlug('default'), null);
        assert.equal(resolveArtistFromSlug('sitemap.xml'), null);
        assert.equal(resolveArtistFromSlug('robots.txt'), null);
    });
});

test('Sitemap generation & synchronization', async (t) => {
    await t.test('Dynamic sitemap XML includes root URL and all curated artist routes', () => {
        const xml = generateSitemapXml();
        assert.match(xml, /<loc>https:\/\/type\.vincentchan\.uk\/<\/loc>/);
        for (const artist of FEATURED_ARTISTS) {
            assert.ok(
                xml.includes(`<loc>https://type.vincentchan.uk/${artist.slug}</loc>`),
                `Sitemap should contain /${artist.slug}`
            );
        }
    });

    await t.test('Static public/sitemap.xml matches generated artist URLs', () => {
        const staticXml = fs.readFileSync(path.join(__dirname, '..', 'public', 'sitemap.xml'), 'utf-8');
        assert.equal(staticXml, generateSitemapXml());
    });
});

test('Express SSR artist landing routes, body content & 404 protection', async (t) => {
    const server = app.listen(0);
    t.after(() => server.close());

    await t.test('GET /taylor-swift returns 200 SSR HTML with unique hero <h1>, blurb, track pills, and MusicRecording JSON-LD', async () => {
        const res = await requestApp(server, '/taylor-swift');
        assert.equal(res.statusCode, 200);
        assert.match(res.headers['content-type'], /text\/html/);
        assert.match(res.body, /<title>Taylor Swift Lyrics Typing Game \| TuneTyper<\/title>/);
        assert.match(res.body, /<link rel="canonical" href="https:\/\/type\.vincentchan\.uk\/taylor-swift">/);
        assert.match(res.body, /<h1 class="artist-hero-title">Taylor Swift Lyrics Typing Game<\/h1>/);
        assert.match(res.body, /data-track="Cruel Summer"/);
        assert.match(res.body, /"@type":\s*"MusicRecording"/);
        assert.match(res.body, /<a href="\/taylor-swift" aria-current="page">/);
        assert.match(res.body, /id="artist-input" value="Taylor Swift"/);
        assert.match(res.body, /window\.__INITIAL_ARTIST__\s*=\s*\{"slug":"taylor-swift","name":"Taylor Swift"\}/);
    });

    await t.test('GET /eminem renders distinct visible body content from /taylor-swift', async () => {
        const res = await requestApp(server, '/eminem');
        assert.equal(res.statusCode, 200);
        assert.match(res.body, /<h1 class="artist-hero-title">Eminem Lyrics Typing Game<\/h1>/);
        assert.match(res.body, /data-track="Rap God"/);
        assert.doesNotMatch(res.body, /data-track="Cruel Summer"/);
    });

    await t.test('GET /sabrinacarpenter (unhyphenated) 301-redirects to canonical /sabrina-carpenter', async () => {
        const res = await requestApp(server, '/sabrinacarpenter');
        assert.equal(res.statusCode, 301);
        assert.equal(res.headers.location, '/sabrina-carpenter');
    });

    await t.test('GET /artist/taylor-swift 301-redirects to canonical /taylor-swift', async () => {
        const res = await requestApp(server, '/artist/taylor-swift');
        assert.equal(res.statusCode, 301);
        assert.equal(res.headers.location, '/taylor-swift');
    });

    await t.test('GET /Taylor-Swift 301-redirects to lowercase canonical /taylor-swift', async () => {
        const res = await requestApp(server, '/Taylor-Swift');
        assert.equal(res.statusCode, 301);
        assert.equal(res.headers.location, '/taylor-swift');
    });

    await t.test('Unknown/gibberish slugs like /asdf-qwerty return real 404 instead of soft-404 200', async () => {
        const res = await requestApp(server, '/asdf-qwerty');
        assert.equal(res.statusCode, 404);

        const botRes = await requestApp(server, '/wp-login');
        assert.equal(botRes.statusCode, 404);
    });

    await t.test('GET /sitemap.xml serves valid XML with application/xml content-type', async () => {
        const res = await requestApp(server, '/sitemap.xml');
        assert.equal(res.statusCode, 200);
        assert.match(res.headers['content-type'], /xml/);
        assert.match(res.body, /<loc>https:\/\/type\.vincentchan\.uk\/sabrina-carpenter<\/loc>/);
    });

    await t.test('GET /favicon.ico returns 200', async () => {
        const res = await requestApp(server, '/favicon.ico');
        assert.equal(res.statusCode, 200);
    });

    await t.test('Reserved API routes like /tracks are not shadowed by /:slug', async () => {
        const res = await requestApp(server, '/tracks');
        assert.equal(res.statusCode, 400);
        assert.equal(res.body, 'Artist name is required.');
    });
});
