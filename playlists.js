const DEFAULT_PLAYLIST_ID = '13650203641';

const CURATED_PLAYLISTS = [
    {
        id: '13650203641',
        slug: '20s-pop',
        name: '20s Pop',
        subtitle: '2020s Pop Hits',
        genre: 'pop',
        trackCount: 80,
        cover: 'https://cdn-images.dzcdn.net/images/playlist/3d42e0dfa0a4af0bbbcb0ad47731353d/250x250-000000-80-0-0.jpg',
        description: 'The biggest pop hits of the 2020s',
        isDefault: true
    },
    {
        id: '8282573142',
        slug: '10s-pop',
        name: '10s Pop',
        subtitle: '2010s Pop Hits',
        genre: 'pop',
        trackCount: 100,
        cover: 'https://cdn-images.dzcdn.net/images/playlist/a2c4a523d4054a2ddb04856f0f31282b/250x250-000000-80-0-0.jpg',
        description: 'Album drops and meat dresses, go back to the best of 2010s pop.'
    },
    {
        id: '248297032',
        slug: '00s-hits',
        name: '00s Hits',
        subtitle: '2000s Classics',
        genre: 'classics',
        trackCount: 100,
        cover: 'https://cdn-images.dzcdn.net/images/playlist/3e4cdc7e18c4ac1163bc7247f151731c/250x250-000000-80-0-0.jpg',
        description: 'The greatest songs of the decade.'
    },
    {
        id: '2868476282',
        slug: 'uk-top-40',
        name: 'UK Top 40',
        subtitle: 'Official Charts',
        genre: 'chart',
        trackCount: 40,
        cover: 'https://cdn-images.dzcdn.net/images/playlist/2447c34aa578141d7f97cb7c688bfe65/250x250-000000-80-0-0.jpg',
        description: 'Compiled by the Official Charts Company, based on sales, downloads and streams.'
    },
    {
        id: '1306931615',
        slug: 'rock-essentials',
        name: 'Rock Essentials',
        subtitle: 'Rock Anthems',
        genre: 'rock',
        trackCount: 100,
        cover: 'https://cdn-images.dzcdn.net/images/playlist/e17f63541e66d8f110ae90207b6c6007/250x250-000000-80-0-0.jpg',
        description: 'The best rock songs of all time... ever!'
    }
];

function getCuratedPlaylist(idOrSlug) {
    if (!idOrSlug) return null;
    const str = String(idOrSlug).trim().toLowerCase();
    return CURATED_PLAYLISTS.find(p => p.id === str || p.slug.toLowerCase() === str) || null;
}

function getDefaultPlaylist() {
    return CURATED_PLAYLISTS.find(p => p.isDefault) || CURATED_PLAYLISTS[0];
}

function buildCuratedPlaylistsShelfHtml(activePlaylistId = DEFAULT_PLAYLIST_ID) {
    const cardsHtml = CURATED_PLAYLISTS.map(playlist => {
        const isActive = playlist.id === String(activePlaylistId);
        const activeClass = isActive ? ' active' : '';
        const safeId = playlist.id;
        const safeName = playlist.name;
        const safeCover = playlist.cover;

        return [
            `        <button type="button" class="playlist-card${activeClass}" data-playlist-id="${safeId}" data-playlist-slug="${playlist.slug}" data-playlist-name="${safeName}">`,
            `            <span class="track-card-cover-wrap">`,
            `                <img src="${safeCover}" alt="${safeName} playlist cover" loading="lazy" width="250" height="250" class="track-card-img">`,
            `                <span class="track-card-overlay" aria-hidden="true">${isActive ? '\u2713 Active' : '\u25b6 Play'}</span>`,
            `            </span>`,
            `            <span class="track-card-title">${safeName}</span>`,
            `        </button>`
        ].join('\n');
    }).join('\n');

    return [
        `<section id="curated-playlists-shelf" class="container artist-tracks-container curated-playlists-container" aria-label="Popular playlists">`,
        `    <div class="artist-shelf-header">`,
        `        <h2 class="artist-shelf-title playlist-shelf-title">Popular Playlists <span class="artist-shelf-sub">\u2014 Choose a Playlist</span></h2>`,
        `        <span class="artist-genre-badge playlist-badge">5 Curated</span>`,
        `    </div>`,
        `    <div class="artist-tracks-grid curated-playlists-grid">`,
        cardsHtml,
        `    </div>`,
        `</section>`
    ].join('\n');
}

module.exports = {
    DEFAULT_PLAYLIST_ID,
    CURATED_PLAYLISTS,
    getCuratedPlaylist,
    getDefaultPlaylist,
    buildCuratedPlaylistsShelfHtml
};
