const express = require('express');
const axios = require('axios');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const {
    resolveArtistFromSlug,
    buildArtistSeoMetadata,
    generateSitemapXml
} = require('./artists');

const app = express();
const PORT = 3000;
app.use(cors());

const indexHtmlPath = path.join(__dirname, 'public', 'index.html');
const baseIndexHtml = fs.readFileSync(indexHtmlPath, 'utf-8');

function escapeHtmlAttr(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

function renderArtistHtml(artist) {
    const seo = buildArtistSeoMetadata(artist);
    const safeTitle = escapeHtmlAttr(seo.title);
    const safeDesc = escapeHtmlAttr(seo.description);
    const safeSocialTitle = escapeHtmlAttr(seo.socialTitle);
    const safeSocialDesc = escapeHtmlAttr(seo.socialDescription);
    const safeKeywords = escapeHtmlAttr(seo.keywords);
    const safeCanonical = escapeHtmlAttr(seo.canonicalUrl);
    const safeArtistName = escapeHtmlAttr(artist.name);

    const structuredData = JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'WebApplication',
        name: seo.title,
        url: seo.canonicalUrl,
        applicationCategory: 'GameApplication',
        operatingSystem: 'All',
        description: seo.description,
        about: {
            '@type': 'MusicGroup',
            name: artist.name
        },
        author: {
            '@type': 'Person',
            name: 'Vincent Chan'
        }
    }, null, 2);

    // Safely serialize artist data for immediate client-side pre-fill
    const bootScript = `<script>window.__INITIAL_ARTIST__ = ${JSON.stringify({
        slug: artist.slug,
        name: artist.name
    }).replace(/</g, '\\u003c')};</script>`;

    let html = baseIndexHtml;

    html = html.replace(
        /<link\s+rel=["']canonical["'][^>]*>/i,
        `<link rel="canonical" href="${safeCanonical}">`
    );
    html = html.replace(
        /<title>[^<]*<\/title>/i,
        `<title>${safeTitle}</title>`
    );
    html = html.replace(
        /<meta\s+name=["']description["'][^>]*>/i,
        `<meta name="description" content="${safeDesc}">`
    );
    html = html.replace(
        /<meta\s+name=["']keywords["'][^>]*>/i,
        `<meta name="keywords" content="${safeKeywords}">`
    );
    html = html.replace(
        /<meta\s+property=["']og:title["'][^>]*>/i,
        `<meta property="og:title" content="${safeSocialTitle}">`
    );
    html = html.replace(
        /<meta\s+property=["']og:description["'][^>]*>/i,
        `<meta property="og:description" content="${safeSocialDesc}">`
    );
    html = html.replace(
        /<meta\s+property=["']og:url["'][^>]*>/i,
        `<meta property="og:url" content="${safeCanonical}">`
    );
    html = html.replace(
        /<meta\s+name=["']twitter:title["'][^>]*>/i,
        `<meta name="twitter:title" content="${safeSocialTitle}">`
    );
    html = html.replace(
        /<meta\s+name=["']twitter:description["'][^>]*>/i,
        `<meta name="twitter:description" content="${safeSocialDesc}">`
    );
    html = html.replace(
        /<input\s+type=["']text["']\s+id=["']artist-input["']\s+placeholder=["']Searching for\.\.\.["']>/i,
        `<input type="text" id="artist-input" value="${safeArtistName}" placeholder="Searching for...">`
    );
    html = html.replace(
        /<script\s+id=["']structured-data["']\s+type=["']application\/ld\+json["']>[\s\S]*?<\/script>/i,
        `<script id="structured-data" type="application/ld+json">\n${structuredData}\n    </script>`
    );
    html = html.replace(
        /<script\s+src=["']\/script\.js["']><\/script>/i,
        `${bootScript}\n    <script src="/script.js"></script>`
    );

    return html;
}

// Dynamic XML Sitemap Route (served before static middleware so it is always fresh)
app.get('/sitemap.xml', (req, res) => {
    res.header('Content-Type', 'application/xml; charset=utf-8');
    res.send(generateSitemapXml());
});

app.use(express.static(path.join(__dirname, 'public')));

// Serve the frontend
app.get('/', (req, res) => {
    res.sendFile(indexHtmlPath);
});

// Deezer API Route
app.get('/tracks', async (req, res) => {
    const { artist } = req.query;
    if (!artist) return res.status(400).send('Artist name is required.');

    try {
        const response = await axios.get(`https://api.deezer.com/search?limit=50&q=${encodeURIComponent(artist)}`);
        res.json(response.data);
    } catch (error) {
        console.error('Error fetching tracks:', error.message);
        res.status(500).send('Failed to fetch tracks.');
    }
});

// Deezer API: Get top tracks for an artist
app.get('/top-tracks', async (req, res) => {
    const { artistId } = req.query;
    if (!artistId) return res.status(400).send('Artist ID is required.');
    const parsedLimit = parseInt(req.query.limit, 10);
    const limit = (!isNaN(parsedLimit) && parsedLimit > 0) ? Math.min(100, parsedLimit) : 50;

    try {
        const response = await axios.get(`https://api.deezer.com/artist/${encodeURIComponent(artistId)}/top?limit=${limit}`);
        res.json(response.data);
    } catch (error) {
        console.error('Error fetching top tracks:', error.message);
        res.status(500).send('Failed to fetch top tracks.');
    }
});

app.get('/default', async (req, res) => {
    try {
        const response = await axios.get(`https://api.deezer.com/playlist/2868476282`);
        res.json(response.data);
    } catch (error) {
        console.error('Error fetching tracks:', error.message);
        res.status(500).send('Failed to fetch tracks.');
    }
});

// Deezer API: Get track details (release_date, etc.)
app.get('/track-details', async (req, res) => {
    const { trackId } = req.query;
    if (!trackId) return res.status(400).send('Track ID is required.');

    try {
        const response = await axios.get(`https://api.deezer.com/track/${encodeURIComponent(trackId)}`);
        res.json({
            id: response.data.id,
            release_date: response.data.release_date,
            bpm: response.data.bpm,
            duration: response.data.duration
        });
    } catch (error) {
        console.error('Error fetching track details:', error.message);
        res.status(500).send('Failed to fetch track details.');
    }
});

// OVH Lyrics API Route
app.get('/lyrics', async (req, res) => {
    const { artist, track } = req.query;
    if (!artist || !track) return res.status(400).send('Artist and track name are required.');

    try {
        const response = await axios.get(`https://api.lyrics.ovh/v1/${encodeURIComponent(artist)}/${encodeURIComponent(track)}`);
        res.json(response.data);
    } catch (error) {
        console.error('Error fetching lyrics:', error.message);
        res.status(500).send('Failed to fetch lyrics.');
    }
});

// Support /artist/:slug by 301-redirecting to canonical /:slug
app.get('/artist/:slug', (req, res, next) => {
    const artist = resolveArtistFromSlug(req.params.slug);
    if (!artist) return next();
    return res.redirect(301, `/${artist.slug}`);
});

// Programmatic SEO Artist Landing Route (e.g. /taylor-swift, /sabrina-carpenter)
app.get('/:slug', (req, res, next) => {
    const rawSlug = req.params.slug;
    if (!rawSlug || rawSlug.includes('.')) return next();

    const artist = resolveArtistFromSlug(rawSlug);
    if (!artist) return next();

    // Canonicalize uppercase or messy slugs via 301 redirect
    if (rawSlug !== artist.slug) {
        return res.redirect(301, `/${artist.slug}`);
    }

    res.header('Content-Type', 'text/html; charset=utf-8');
    res.send(renderArtistHtml(artist));
});

// Start the server only when executed directly (allows importing app/helpers in tests)
if (require.main === module) {
    app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
}

module.exports = { app, renderArtistHtml };
