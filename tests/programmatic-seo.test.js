const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');

const {
    FEATURED_ARTISTS,
    resolveArtistFromSlug,
    buildArtistSeoMetadata,
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

test('Curated artist SEO metadata compliance', async (t) => {
    await t.test('All 30 curated artists satisfy Google SERP and social card length bounds', () => {
        assert.ok(FEATURED_ARTISTS.length >= 25, 'Should include curated high-intent artists');

        for (const artist of FEATURED_ARTISTS) {
            const seo = buildArtistSeoMetadata(artist);

            assert.ok(
                seo.title.length >= 20 && seo.title.length <= 60,
                `Title for ${artist.name} ("${seo.title}", ${seo.title.length} chars) must be 20-60 chars`
            );
            assert.ok(
                seo.description.length >= 120 && seo.description.length <= 160,
                `Meta description for ${artist.name} (${seo.description.length} chars) must be 120-160 chars`
            );
            assert.ok(
                seo.socialDescription.length <= 125,
                `Social description for ${artist.name} (${seo.socialDescription.length} chars) must be <= 125 chars`
            );
            assert.equal(seo.canonicalUrl, `https://type.vincentchan.uk/${artist.slug}`);
        }
    });

    await t.test('resolveArtistFromSlug resolves curated names, unhyphenated compact slugs, dynamic slugs, and blocks reserved paths', () => {
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

        const dynamic = resolveArtistFromSlug('katy-perry');
        assert.equal(dynamic.name, 'Katy Perry');
        assert.equal(dynamic.slug, 'katy-perry');
        assert.equal(dynamic.curated, false);

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
        for (const artist of FEATURED_ARTISTS) {
            assert.ok(
                staticXml.includes(`https://type.vincentchan.uk/${artist.slug}`),
                `public/sitemap.xml must include /${artist.slug}`
            );
        }
    });
});

test('Express SSR artist landing routes & redirects', async (t) => {
    const server = app.listen(0);
    t.after(() => server.close());

    await t.test('GET /taylor-swift returns 200 SSR HTML with tailored metadata and pre-filled input', async () => {
        const res = await requestApp(server, '/taylor-swift');
        assert.equal(res.statusCode, 200);
        assert.match(res.headers['content-type'], /text\/html/);
        assert.match(res.body, /<title>Taylor Swift Lyrics Typing Game \| TuneTyper<\/title>/);
        assert.match(res.body, /<link rel="canonical" href="https:\/\/type\.vincentchan\.uk\/taylor-swift">/);
        assert.match(res.body, /<meta property="og:url" content="https:\/\/type\.vincentchan\.uk\/taylor-swift">/);
        assert.match(res.body, /id="artist-input" value="Taylor Swift"/);
        assert.match(res.body, /window\.__INITIAL_ARTIST__\s*=\s*\{"slug":"taylor-swift","name":"Taylor Swift"\}/);
    });

    await t.test('GET /sabrina-carpenter returns 200 SSR HTML with Sabrina Carpenter metadata', async () => {
        const res = await requestApp(server, '/sabrina-carpenter');
        assert.equal(res.statusCode, 200);
        assert.match(res.body, /<title>Sabrina Carpenter Lyrics Typing Game \| TuneTyper<\/title>/);
        assert.match(res.body, /id="artist-input" value="Sabrina Carpenter"/);
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
