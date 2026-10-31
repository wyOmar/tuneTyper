const test = require('node:test');
const assert = require('node:assert/strict');

const elements = {};
let trackCards = [];
let scrollCalls = [];

function createMockClassList() {
    const classes = new Set();
    return {
        add: (...names) => names.forEach((n) => classes.add(n)),
        remove: (...names) => names.forEach((n) => classes.delete(n)),
        toggle: (name, force) => {
            if (force === undefined) {
                if (classes.has(name)) {
                    classes.delete(name);
                    return false;
                }
                classes.add(name);
                return true;
            }
            if (force) classes.add(name);
            else classes.delete(name);
            return Boolean(force);
        },
        contains: (name) => classes.has(name)
    };
}

function getOrCreateElement(id) {
    if (!elements[id]) {
        const listeners = {};
        const attrs = {};
        elements[id] = {
            id,
            style: {},
            className: '',
            classList: createMockClassList(),
            innerHTML: '',
            textContent: '',
            value: '',
            placeholder: '',
            src: '',
            alt: '',
            checked: id === 'remove-adlibs',
            disabled: false,
            focused: false,
            focus() {
                this.focused = true;
                if (listeners.focus) {
                    listeners.focus.forEach((fn) => fn());
                }
            },
            click() {
                if (listeners.click) {
                    return Promise.all(listeners.click.map((fn) => fn({ preventDefault: () => {} })));
                }
                return Promise.resolve();
            },
            addEventListener(type, fn) {
                if (!listeners[type]) listeners[type] = [];
                listeners[type].push(fn);
            },
            getAttribute(name) {
                return attrs[name] || null;
            },
            setAttribute(name, val) {
                attrs[name] = String(val);
            },
            querySelectorAll: () => [],
            querySelector: () => null,
            closest: () => null,
            _listeners: listeners,
            _attrs: attrs
        };
    }
    return elements[id];
}

global.document = {
    getElementById: (id) => getOrCreateElement(id),
    querySelector: (sel) => {
        if (sel === '.navbar-title') return getOrCreateElement('navbar-title');
        if (sel === '.guess-input-container') return getOrCreateElement('guess-input-container');
        return getOrCreateElement(sel.replace(/^[#.]/, ''));
    },
    querySelectorAll: (sel) => {
        if (sel === '.artist-track-card') return trackCards;
        if (sel === '.artist-track-card.active') {
            return trackCards.filter((c) => c.classList.contains('active'));
        }
        return [];
    },
    createElement: (tag) => ({
        tag,
        style: {},
        classList: createMockClassList(),
        setAttribute: () => {},
        appendChild: () => {},
        addEventListener: () => {}
    }),
    body: {
        appendChild: () => {},
        removeChild: () => {},
        prepend: () => {}
    },
    addEventListener: () => {}
};

global.window = {
    location: { pathname: '/', search: '', hash: '' },
    addEventListener: () => {},
    scrollTo: (opts) => scrollCalls.push(opts),
    __INITIAL_ARTIST__: null
};

global.fetch = async (url) => {
    const urlStr = String(url);
    if (urlStr.startsWith('/default')) {
        return {
            ok: true,
            json: async () => ({
                tracks: {
                    data: [
                        {
                            id: 999,
                            title: 'UK Chart Topper',
                            artist: { id: 777, name: 'Chart Artist' },
                            album: { title: 'Hits 2026', cover_medium: 'https://example.com/art.jpg' }
                        }
                    ]
                }
            })
        };
    }
    if (urlStr.startsWith('/lyrics?')) {
        return {
            ok: true,
            json: async () => ({
                lyrics: 'Verse 1\nThese are some mystery lyrics to type out\nChorus\nKeep typing on and on'
            })
        };
    }
    if (urlStr.startsWith('/track-details?')) {
        return { ok: true, json: async () => ({ preview: 'https://example.com/preview.mp3' }) };
    }
    return { ok: false, status: 404, json: async () => ({}) };
};

const scriptModule = require('../public/script');

test('Dynamic Artist Popular Tracks Generation & UK Top 40 suppression', async (t) => {
    await t.test('renderArtistPopularTracksShelf builds up to 5 unique cards with album covers and metadata for any artist', () => {
        const slot = getOrCreateElement('artist-tracks-slot');
        slot.innerHTML = '';

        const mockTracks = [
            {
                id: 1,
                title: 'Karma Police',
                title_short: 'Karma Police',
                artist: { id: 10, name: 'Radiohead' },
                album: { title: 'OK Computer', cover_medium: 'https://cdn-images.dzcdn.net/cover/okcomputer.jpg' },
                release_date: '1997-05-21'
            },
            {
                id: 2,
                title: 'Creep',
                title_short: 'Creep',
                artist: { id: 10, name: 'Radiohead' },
                album: { title: 'Pablo Honey', cover_medium: 'https://cdn-images.dzcdn.net/cover/pablo.jpg' },
                release_date: '1993-02-22'
            },
            {
                id: 3,
                title: 'Karma Police (Piano Cover)', // Should be filtered out by isUnwantedTrack
                artist: { id: 10, name: 'Radiohead' },
                album: { title: 'Covers' }
            },
            {
                id: 4,
                title: 'No Surprises',
                title_short: 'No Surprises',
                artist: { id: 10, name: 'Radiohead' },
                album: { title: 'OK Computer', cover_medium: 'https://cdn-images.dzcdn.net/cover/okcomputer.jpg' }
            },
            {
                id: 5,
                title: 'Paranoid Android',
                title_short: 'Paranoid Android',
                artist: { id: 10, name: 'Radiohead' },
                album: { title: 'OK Computer', cover_medium: 'https://cdn-images.dzcdn.net/cover/okcomputer.jpg' }
            },
            {
                id: 6,
                title: 'High and Dry',
                title_short: 'High and Dry',
                artist: { id: 10, name: 'Radiohead' },
                album: { title: 'The Bends', cover_medium: 'https://cdn-images.dzcdn.net/cover/thebends.jpg' }
            },
            {
                id: 7,
                title: 'Fake Plastic Trees', // 6th valid track - should be capped at 5
                title_short: 'Fake Plastic Trees',
                artist: { id: 10, name: 'Radiohead' },
                album: { title: 'The Bends', cover_medium: 'https://cdn-images.dzcdn.net/cover/thebends.jpg' }
            }
        ];

        scriptModule.renderArtistPopularTracksShelf('Radiohead', mockTracks);

        assert.ok(slot.innerHTML.includes('id="artist-tracks-shelf"'), 'Should insert section with id artist-tracks-shelf');
        assert.ok(slot.innerHTML.includes('data-artist-name="Radiohead"'), 'Should contain data-artist-name');
        assert.ok(slot.innerHTML.includes('Radiohead'), 'Should display artist title');
        assert.ok(slot.innerHTML.includes('Karma Police'), 'Should include first track');
        assert.ok(slot.innerHTML.includes('OK Computer · 1997'), 'Should include album and year in metadata');
        assert.ok(slot.innerHTML.includes('Creep'), 'Should include second track');
        assert.ok(slot.innerHTML.includes('No Surprises'), 'Should include third track');
        assert.ok(slot.innerHTML.includes('Paranoid Android'), 'Should include fourth track');
        assert.ok(slot.innerHTML.includes('High and Dry'), 'Should include fifth track');
        assert.equal(slot.innerHTML.includes('Piano Cover'), false, 'Unwanted tracks must be excluded');
        assert.equal(slot.innerHTML.includes('Fake Plastic Trees'), false, 'Should be capped at 5 tracks');
    });

    await t.test('loadDefaultPlaylist hides the popular tracks shelf so UK Top 40 mystery song is never given away', async () => {
        const shelf = getOrCreateElement('artist-tracks-shelf');
        shelf.style.display = 'block';

        await scriptModule.loadDefaultPlaylist();

        assert.equal(shelf.style.display, 'none', 'Shelf must be hidden during UK Top 40 round');
    });

    await t.test('syncShelfVisibility displays shelf only when targetArtistName matches the shelf artist', () => {
        const shelf = getOrCreateElement('artist-tracks-shelf');
        shelf._attrs['data-artist-name'] = 'Radiohead';
        shelf.style.display = 'none';

        // Matching artist -> display
        scriptModule.syncShelfVisibility('Radiohead');
        assert.equal(shelf.style.display, '');

        // Different artist -> hide
        scriptModule.syncShelfVisibility('Coldplay');
        assert.equal(shelf.style.display, 'none');

        // Empty / reset -> hide
        scriptModule.syncShelfVisibility('');
        assert.equal(shelf.style.display, 'none');
    });
});
