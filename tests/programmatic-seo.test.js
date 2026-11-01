const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const axios = require('axios');

const {
    FEATURED_ARTISTS,
    resolveArtistFromSlug,
    buildArtistSeoMetadata,
    renderArtistHtml,
    generateSitemapXml
} = require('../artists');

const app = require('../server');
const scriptModule = require('../public/script');
const { requestApp } = require('./helpers/http');

test('Vercel serverless (@vercel/node) entrypoint contract', () => {
    assert.equal(
        typeof app,
        'function',
        'server.js default export (module.exports) MUST be a request handler function for @vercel/node'
    );
});

test('Curated artist SEO metadata, 5-unique-cover track shelf & DOM layout compliance', async (t) => {
    await t.test('All 30 curated artists satisfy Google SERP bounds and have 5 tracks with 5 unique Deezer CDN covers', () => {
        assert.equal(FEATURED_ARTISTS.length, 30, 'Should include 30 curated high-intent artists');

        const baseIndexHtml = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf-8');
        assert.ok(
            !baseIndexHtml.includes('id="search-type"'),
            'Legacy Artist/Song <select id="search-type"> dropdown should be removed in favor of unified omnibox'
        );
        assert.ok(
            baseIndexHtml.includes('id="search-suggestions"'),
            'public/index.html must include #search-suggestions omnibox dropdown'
        );

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
            assert.equal(artist.blurb, undefined, `${artist.name} should not contain filler prose blurbs`);

            assert.ok(
                Array.isArray(artist.tracks) && artist.tracks.length === 5,
                `${artist.name} must define exactly 5 popular tracks`
            );

            const coverHashes = new Set();
            for (const track of artist.tracks) {
                assert.ok(track.title && track.title.length > 0, `Track in ${artist.name} missing title`);
                assert.ok(track.album && track.album.length > 0, `Track "${track.title}" in ${artist.name} missing album`);
                assert.match(track.year, /^\d{4}$/, `Track "${track.title}" in ${artist.name} must have 4-digit year`);
                const hashMatch = track.cover.match(/^https:\/\/cdn-images\.dzcdn\.net\/images\/cover\/([a-f0-9]{32})\//);
                assert.ok(hashMatch, `Track "${track.title}" in ${artist.name} must use direct Deezer CDN cover URL`);
                coverHashes.add(hashMatch[1]);
            }
            assert.equal(
                coverHashes.size,
                5,
                `${artist.name} must have 5 distinct album/single cover hashes (got ${coverHashes.size})`
            );

            // Verify SSR HTML body structure: single semantic <h1> & standalone container below main game container
            const rendered = renderArtistHtml(artist, baseIndexHtml);
            const h1Matches = rendered.match(/<h1\b[^>]*>[\s\S]*?<\/h1>/gi) || [];
            assert.equal(h1Matches.length, 1, `Rendered page for ${artist.name} should have exactly one <h1>`);
            assert.match(h1Matches[0], /artist-shelf-title/);

            const cardMatches = rendered.match(/class="artist-track-card"/g) || [];
            assert.equal(cardMatches.length, 5, `Rendered page for ${artist.name} must render 5 cover-art track cards`);

            const mainGameIdx = rendered.indexOf('id="typing-area"');
            const shelfIdx = rendered.indexOf('id="artist-tracks-shelf"');
            const footerIdx = rendered.indexOf('<footer class="footer">');
            assert.ok(
                mainGameIdx > 0 && shelfIdx > mainGameIdx && footerIdx > shelfIdx,
                `#artist-tracks-shelf for ${artist.name} must be rendered in its own container below the typing game and above the footer`
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
        assert.equal(resolveArtistFromSlug('suggest'), null);
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

test('Express SSR artist landing routes, Edge-cached /suggest & 404 protection', async (t) => {
    const server = app.listen(0);
    t.after(() => server.close());

    await t.test('GET /taylor-swift returns 200 SSR HTML with standalone cover-art shelf, single <h1>, and MusicRecording JSON-LD', async () => {
        const res = await requestApp(server, '/taylor-swift');
        assert.equal(res.statusCode, 200);
        assert.match(res.headers['content-type'], /text\/html/);
        assert.match(res.body, /<title>Taylor Swift Lyrics Typing Game \| TuneTyper<\/title>/);
        assert.match(res.body, /<link rel="canonical" href="https:\/\/type\.vincentchan\.uk\/taylor-swift">/);
        assert.match(res.body, /<h1 class="artist-shelf-title">Taylor Swift <span class="artist-shelf-sub">— Popular Tracks<\/span><\/h1>/);
        assert.match(res.body, /data-track="Cruel Summer"/);
        assert.match(res.body, /https:\/\/cdn-images\.dzcdn\.net\/images\/cover\//);
        assert.match(res.body, /"@type":\s*"MusicRecording"/);
        assert.match(res.body, /"@type":\s*"MusicAlbum"/);
        assert.match(res.body, /<a href="\/taylor-swift" aria-current="page">/);
        assert.match(res.body, /id="artist-input" value="Taylor Swift"/);
        assert.match(res.body, /window\.__INITIAL_ARTIST__\s*=\s*\{"slug":"taylor-swift","name":"Taylor Swift"\}/);
        assert.match(res.body, /<meta property="og:image" content="https:\/\/type\.vincentchan\.uk\/og\/artists\/taylor-swift\.png">/);
        assert.match(res.body, /<meta name="twitter:image" content="https:\/\/type\.vincentchan\.uk\/og\/artists\/taylor-swift\.png">/);
        assert.match(res.body, /<meta property="og:image:alt" content="TuneTyper typing challenge for Taylor Swift: type Cruel Summer lyrics and beat your WPM\.">/);
    });

    await t.test('GET /eminem renders distinct cover-art track cards and artist OG image from /taylor-swift', async () => {
        const res = await requestApp(server, '/eminem');
        assert.equal(res.statusCode, 200);
        assert.match(res.headers['cache-control'], /s-maxage=86400/);
        assert.equal(res.headers['vary'], 'Accept-Encoding');
        assert.match(res.body, /<h1 class="artist-shelf-title">Eminem/);
        assert.match(res.body, /data-track="Lose Yourself"/);
        assert.doesNotMatch(res.body, /data-track="Cruel Summer"/);
        assert.match(res.body, /<meta property="og:image" content="https:\/\/type\.vincentchan\.uk\/og\/artists\/eminem\.png">/);
        assert.match(res.body, /<meta property="og:image:alt" content="TuneTyper typing challenge for Eminem: type Rap God lyrics and beat your WPM\.">/);
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

    await t.test('GET / serves index.html with Edge Cache-Control, Vary, and resource hints', async () => {
        const res = await requestApp(server, '/');
        assert.equal(res.statusCode, 200);
        assert.match(res.headers['cache-control'], /s-maxage=86400/);
        assert.equal(res.headers['vary'], 'Accept-Encoding');
        assert.match(res.body, /<title>TuneTyper/);
        assert.match(res.body, /rel="preload" href="\/script\.js"/);
        assert.match(res.body, /rel="preconnect" href="https:\/\/cdn-images\.dzcdn\.net"/);
    });

    await t.test('GET /sitemap.xml serves valid XML with application/xml content-type and Edge Cache-Control', async () => {
        const res = await requestApp(server, '/sitemap.xml');
        assert.equal(res.statusCode, 200);
        assert.match(res.headers['content-type'], /xml/);
        assert.match(res.headers['cache-control'], /s-maxage=86400/);
        assert.equal(res.headers['vary'], 'Accept-Encoding');
        assert.match(res.body, /<loc>https:\/\/type\.vincentchan\.uk\/sabrina-carpenter<\/loc>/);
    });

    await t.test('GET /favicon.ico returns 200 with Edge Cache-Control', async () => {
        const res = await requestApp(server, '/favicon.ico');
        assert.equal(res.statusCode, 200);
        assert.match(res.headers['cache-control'], /s-maxage=604800/);
    });

    await t.test('Reserved API routes /tracks and /suggest are not shadowed by /:slug', async () => {
        const resTracks = await requestApp(server, '/tracks');
        assert.equal(resTracks.statusCode, 400);
        assert.equal(resTracks.body, 'Artist name is required.');

        const resSuggestMissing = await requestApp(server, '/suggest');
        assert.equal(resSuggestMissing.statusCode, 400);
        assert.equal(resSuggestMissing.body, 'Query parameter q is required.');
    });

    await t.test('GET /suggest?q=... returns deduplicated artists & tracks with 24h Edge Cache-Control and no expiring preview URLs', async () => {
        const origGet = axios.get;
        axios.get = async () => ({
            data: {
                data: [
                    {
                        id: 101,
                        title: 'Espresso',
                        title_short: 'Espresso',
                        preview: 'https://cdnt-preview.dzcdn.net/api/1/1/expiring-token.mp3',
                        artist: { id: 99, name: 'Sabrina Carpenter', picture_small: 'https://cdn-images.dzcdn.net/images/artist/sc/56x56.jpg' },
                        album: { cover_small: 'https://cdn-images.dzcdn.net/images/cover/esp/56x56.jpg' }
                    },
                    {
                        id: 102,
                        title: 'Espresso (Working Late Remix)',
                        title_short: 'Espresso',
                        preview: 'https://cdnt-preview.dzcdn.net/api/1/1/expiring-token-2.mp3',
                        artist: { id: 99, name: 'Sabrina Carpenter', picture_small: 'https://cdn-images.dzcdn.net/images/artist/sc/56x56.jpg' },
                        album: { cover_small: 'https://cdn-images.dzcdn.net/images/cover/esp2/56x56.jpg' }
                    },
                    {
                        id: 103,
                        title: 'Please Please Please',
                        title_short: 'Please Please Please',
                        preview: 'https://cdnt-preview.dzcdn.net/api/1/1/expiring-token-3.mp3',
                        artist: { id: 99, name: 'Sabrina Carpenter', picture_small: 'https://cdn-images.dzcdn.net/images/artist/sc/56x56.jpg' },
                        album: { cover_small: 'https://cdn-images.dzcdn.net/images/cover/ppp/56x56.jpg' }
                    }
                ]
            }
        });

        try {
            const res = await requestApp(server, '/suggest?q=sabrina%20carpenter');
            assert.equal(res.statusCode, 200);
            assert.match(res.headers['cache-control'], /s-maxage=86400/);
            const parsed = JSON.parse(res.body);
            assert.equal(parsed.artists.length, 1);
            assert.equal(parsed.artists[0].name, 'Sabrina Carpenter');
            assert.equal(parsed.tracks.length, 2, 'Duplicate title_short for same artist should be deduplicated');
            assert.equal(parsed.tracks[0].title, 'Espresso');
            assert.equal(parsed.tracks[0].preview, undefined, 'Expiring MP3 preview tokens must not be cached in /suggest');
        } finally {
            axios.get = origGet;
        }
    });
});

test('Unified ARTIST / SONG omnibox ranking & game-mode decoupling', async (t) => {
    const mockRemoteSabrina = {
        artists: [{ id: 99, name: 'Sabrina Carpenter', picture: 'https://cdn-images.dzcdn.net/images/artist/sc/56x56.jpg' }],
        tracks: [
            { id: 101, title: 'Espresso', artist: 'Sabrina Carpenter', cover: 'https://cdn-images.dzcdn.net/images/cover/esp/56x56.jpg' },
            { id: 103, title: 'Please Please Please', artist: 'Sabrina Carpenter', cover: 'https://cdn-images.dzcdn.net/images/cover/ppp/56x56.jpg' }
        ]
    };

    await t.test('Typing an artist name defaults ARTIST row to the top with SONG rows underneath', () => {
        scriptModule._setState({ previousArtist: '', artistTracks: [] });

        const prefixResults = scriptModule.buildOmniboxSuggestions('Sabrina', mockRemoteSabrina);
        assert.ok(prefixResults.length >= 2);
        assert.equal(prefixResults[0].type, 'artist');
        assert.equal(prefixResults[0].name, 'Sabrina Carpenter');

        const exactResults = scriptModule.buildOmniboxSuggestions('Sabrina Carpenter', mockRemoteSabrina);
        assert.equal(exactResults[0].type, 'artist');
        assert.equal(exactResults[0].name, 'Sabrina Carpenter');
        assert.equal(exactResults[1].type, 'song');
        assert.equal(exactResults[1].title, 'Espresso');
    });

    await t.test('Typing artist + song details or an exact song title promotes SONG row to the top', () => {
        const detailedResults = scriptModule.buildOmniboxSuggestions('Sabrina Carpenter Espresso', mockRemoteSabrina);
        assert.ok(detailedResults.length >= 1);
        assert.equal(detailedResults[0].type, 'song');
        assert.equal(detailedResults[0].title, 'Espresso');
        assert.equal(detailedResults[0].artist, 'Sabrina Carpenter');

        const songOnlyRemote = {
            artists: [{ id: 555, name: 'Cruel Summer Collective', picture: '' }],
            tracks: [{ id: 777, title: 'Cruel Summer', artist: 'Taylor Swift', cover: '' }]
        };
        const songOnlyResults = scriptModule.buildOmniboxSuggestions('Cruel Summer', songOnlyRemote);
        assert.equal(songOnlyResults[0].type, 'song');
        assert.equal(songOnlyResults[0].title, 'Cruel Summer');
        assert.equal(songOnlyResults[0].artist, 'Taylor Swift');
    });

    await t.test('resolveSearchIntent cleanly separates Artist Mystery mode from Direct Song mode', async () => {
        scriptModule.omniboxSuggestCache.clear();
        scriptModule._setState({ previousArtist: 'Sabrina Carpenter' });

        // Keeping #artist-input as "Sabrina Carpenter" resolves back to Artist Mystery mode!
        const artistIntent = await scriptModule.resolveSearchIntent('Sabrina Carpenter');
        assert.equal(artistIntent.mode, 'artist');
        assert.equal(artistIntent.artist, 'Sabrina Carpenter');

        // Explicit "Artist - Song" resolves to Direct Song mode
        const dashIntent = await scriptModule.resolveSearchIntent('Sabrina Carpenter - Espresso');
        assert.equal(dashIntent.mode, 'song');
        assert.equal(dashIntent.artist, 'Sabrina Carpenter');
        assert.equal(dashIntent.title, 'Espresso');

        // Natural "Artist Song" query resolves to Direct Song mode using /suggest cache
        scriptModule.omniboxSuggestCache.set('sabrina carpenter espresso', mockRemoteSabrina);
        const naturalSongIntent = await scriptModule.resolveSearchIntent('Sabrina Carpenter Espresso');
        assert.equal(naturalSongIntent.mode, 'song');
        assert.equal(naturalSongIntent.artist, 'Sabrina Carpenter');
        assert.equal(naturalSongIntent.title, 'Espresso');
    });

    await t.test('generateShareText respects currentGameMode without needing legacy dropdown', () => {
        scriptModule._setState({
            selectedTrack: { title: 'Espresso', artist: { name: 'Sabrina Carpenter' } },
            finalWPM: 92,
            finalAccuracy: 98,
            isSharedGame: false,
            gaveUp: false,
            attemptHistory: ['correct'],
            guessCount: 1,
            currentGameMode: 'song'
        });
        const songShare = scriptModule.generateShareText();
        assert.match(songShare, /Direct Song Practice/);
        assert.match(songShare, /Beat my score:/);

        scriptModule._setState({ currentGameMode: 'artist' });
        const artistShare = scriptModule.generateShareText();
        assert.match(artistShare, /Guessed in 1 try!/);
        assert.match(artistShare, /Can you beat me\?/);
    });
});

test('SEO & Open Graph metadata validation', async (t) => {
    const indexPath = path.join(__dirname, '..', 'public', 'index.html');
    const ogImagePath = path.join(__dirname, '..', 'public', 'og-image.png');
    const ogTemplatePath = path.join(__dirname, '..', 'assets', 'og-image.html');
    const html = fs.readFileSync(indexPath, 'utf-8');

    function getTagAttr(tagRegex, attrName) {
        const match = html.match(tagRegex);
        if (!match) return null;
        const attrRegex = new RegExp(`${attrName}=["']([^"']*)["']`, 'i');
        const attrMatch = match[0].match(attrRegex);
        return attrMatch ? attrMatch[1] : null;
    }

    await t.test('Page title is within Google SERP display limit (<= 60 chars)', () => {
        const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
        assert.ok(titleMatch, 'Title tag should exist');
        const title = titleMatch[1].trim();
        const unescapedTitle = title.replace(/&amp;/g, '&');
        assert.ok(
            unescapedTitle.length <= 60,
            `Title "${unescapedTitle}" length (${unescapedTitle.length}) exceeds 60 characters`
        );
        assert.ok(unescapedTitle.length >= 20, 'Title should be sufficiently descriptive');
    });

    await t.test('Meta description is optimized for search snippets (120 - 160 chars)', () => {
        const desc = getTagAttr(/<meta\s+name=["']description["'][^>]*>/i, 'content');
        assert.ok(desc, 'Meta description must exist');
        assert.ok(
            desc.length <= 160,
            `Meta description length (${desc.length}) exceeds Google snippet limit of 160 chars`
        );
        assert.ok(
            desc.length >= 120,
            `Meta description length (${desc.length}) is too short (< 120 chars)`
        );
    });

    await t.test('Open Graph & Twitter description fits mobile social cards (<= 125 chars)', () => {
        const ogDesc = getTagAttr(/<meta\s+property=["']og:description["'][^>]*>/i, 'content');
        assert.ok(ogDesc, 'og:description must exist');
        assert.ok(
            ogDesc.length <= 125,
            `og:description length (${ogDesc.length}) exceeds mobile card limit of 125 chars`
        );

        const twitterDesc = getTagAttr(/<meta\s+name=["']twitter:description["'][^>]*>/i, 'content');
        assert.ok(twitterDesc, 'twitter:description must exist');
        assert.ok(
            twitterDesc.length <= 125,
            `twitter:description length (${twitterDesc.length}) exceeds mobile card limit of 125 chars`
        );
    });

    await t.test('Open Graph & Twitter titles fit social card limits (<= 60 chars)', () => {
        const ogTitle = getTagAttr(/<meta\s+property=["']og:title["'][^>]*>/i, 'content');
        assert.ok(ogTitle, 'og:title must exist');
        const unescapedOgTitle = ogTitle.replace(/&amp;/g, '&');
        assert.ok(
            unescapedOgTitle.length <= 60,
            `og:title length (${unescapedOgTitle.length}) exceeds 60 chars`
        );

        const twitterTitle = getTagAttr(/<meta\s+name=["']twitter:title["'][^>]*>/i, 'content');
        assert.ok(twitterTitle, 'twitter:title must exist');
        const unescapedTwitterTitle = twitterTitle.replace(/&amp;/g, '&');
        assert.ok(
            unescapedTwitterTitle.length <= 60,
            `twitter:title length (${unescapedTwitterTitle.length}) exceeds 60 chars`
        );
    });

    await t.test('Open Graph image assets exist and include Call-To-Action (CTA)', () => {
        assert.ok(fs.existsSync(ogImagePath), 'public/og-image.png must exist');
        const stats = fs.statSync(ogImagePath);
        assert.ok(stats.size > 10000, 'public/og-image.png should not be empty or truncated');

        const ogTemplate = fs.readFileSync(ogTemplatePath, 'utf-8');
        const hasCta = /Play Free|Play Now|Start Playing|Start Typing/i.test(ogTemplate);
        assert.ok(hasCta, 'assets/og-image.html must contain a conversion call-to-action');

        const ogImageAlt = getTagAttr(/<meta\s+property=["']og:image:alt[\"'][^>]*>/i, 'content');
        assert.ok(ogImageAlt, 'og:image:alt must exist');
        assert.ok(ogImageAlt.length > 20, 'og:image:alt should be descriptive');
    });

    await t.test('All 30 featured artists have pre-rendered Open Graph social cards in public/og/artists/', () => {
        const ogDir = path.join(__dirname, '..', 'public', 'og', 'artists');
        assert.ok(fs.existsSync(ogDir), 'public/og/artists must exist');
        for (const artist of FEATURED_ARTISTS) {
            const cardPath = path.join(ogDir, `${artist.slug}.png`);
            assert.ok(fs.existsSync(cardPath), `Open Graph card for ${artist.slug} must exist`);
            const stat = fs.statSync(cardPath);
            assert.ok(stat.size > 10000, `Open Graph card for ${artist.slug} should not be empty`);
        }
    });
});
