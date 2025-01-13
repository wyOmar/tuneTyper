const express = require('express');
const axios = require('axios');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = 3000;
app.use(cors());

app.use(express.static(path.join(__dirname, 'public')));

// Serve the frontend
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
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

    try {
        const response = await axios.get(`https://api.deezer.com/artist/${artistId}/top?limit=50`);
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

// Start the server
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
