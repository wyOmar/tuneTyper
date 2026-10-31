const express = require('express');
const axios = require('axios');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const {
    resolveArtistFromSlug,
    renderArtistHtml,
    generateSitemapXml
} = require('./artists');

const app = express();
const PORT = 3000;
app.use(cors());

const publicDir = path.join(__dirname, 'public');
const indexHtmlPath = path.join(publicDir, 'index.html');
const baseIndexHtml = fs.readFileSync(indexHtmlPath, 'utf-8');

// Dynamic XML Sitemap Route (served before static middleware so it is always fresh)
app.get('/sitemap.xml', (req, res) => {
    res.header('Content-Type', 'application/xml; charset=utf-8');
    res.send(generateSitemapXml());
});

// Serve root /favicon.ico from /public/favicon/favicon.ico
app.get('/favicon.ico', (req, res) => {
    res.sendFile(path.join(publicDir, 'favicon', 'favicon.ico'));
});

app.use(express.static(publicDir));

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

// Lightweight Edge-cached omnibox autocomplete route (omits expiring audio preview URLs)
app.get('/suggest', async (req, res) => {
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    if (!q) return res.status(400).send('Query parameter q is required.');

    try {
        const response = await axios.get(`https://api.deezer.com/search?limit=20&q=${encodeURIComponent(q)}`);
        const items = (response.data && Array.isArray(response.data.data)) ? response.data.data : [];

        const seenArtists = new Set();
        const artists = [];
        const seenTracks = new Set();
        const tracks = [];

        for (const item of items) {
            if (item.artist && item.artist.name) {
                const artistKey = item.artist.name.toLowerCase();
                if (!seenArtists.has(artistKey) && artists.length < 5) {
                    seenArtists.add(artistKey);
                    artists.push({
                        id: item.artist.id,
                        name: item.artist.name,
                        picture: item.artist.picture_small || ''
                    });
                }
            }

            const rawTitle = (item.title_short || item.title || '').trim();
            const artistName = (item.artist && item.artist.name) ? item.artist.name.trim() : '';
            if (rawTitle && artistName) {
                const trackKey = `${artistName.toLowerCase()}::${rawTitle.toLowerCase()}`;
                if (!seenTracks.has(trackKey) && tracks.length < 8) {
                    seenTracks.add(trackKey);
                    tracks.push({
                        id: item.id,
                        title: rawTitle,
                        artist: artistName,
                        cover: (item.album && item.album.cover_small) || ''
                    });
                }
            }
        }

        // Safe to cache at Vercel CDN Edge for 24h (7d SWR) since no expiring audio tokens are returned
        res.setHeader('Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=604800');
        res.json({ artists, tracks });
    } catch (error) {
        console.error('Error fetching search suggestions:', error.message);
        res.status(500).send('Failed to fetch suggestions.');
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

    // Canonicalize uppercase, unhyphenated, or messy slugs via 301 redirect
    if (rawSlug !== artist.slug) {
        return res.redirect(301, `/${artist.slug}`);
    }

    res.header('Content-Type', 'text/html; charset=utf-8');
    res.send(renderArtistHtml(artist, baseIndexHtml));
});

// Start the server locally when run directly
if (require.main === module) {
    app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
}

// @vercel/node requires the default export of server.js to be a request handler function or http.Server
module.exports = app;
