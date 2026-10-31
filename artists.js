const FEATURED_ARTISTS = [
    { slug: 'taylor-swift', name: 'Taylor Swift', genre: 'pop & indie-folk' },
    { slug: 'sabrina-carpenter', name: 'Sabrina Carpenter', genre: 'pop' },
    { slug: 'chappell-roan', name: 'Chappell Roan', genre: 'synth-pop' },
    { slug: 'olivia-rodrigo', name: 'Olivia Rodrigo', genre: 'pop-rock' },
    { slug: 'billie-eilish', name: 'Billie Eilish', genre: 'alt-pop' },
    { slug: 'eminem', name: 'Eminem', genre: 'fast rap & hip-hop' },
    { slug: 'kendrick-lamar', name: 'Kendrick Lamar', genre: 'hip-hop' },
    { slug: 'the-weeknd', name: 'The Weeknd', genre: 'R&B & synth-pop' },
    { slug: 'ariana-grande', name: 'Ariana Grande', genre: 'pop & R&B' },
    { slug: 'bruno-mars', name: 'Bruno Mars', genre: 'pop, funk & R&B' },
    { slug: 'drake', name: 'Drake', genre: 'hip-hop & R&B' },
    { slug: 'charli-xcx', name: 'Charli xcx', genre: 'hyperpop & club-pop' },
    { slug: 'lana-del-rey', name: 'Lana Del Rey', genre: 'dream-pop & alt-pop' },
    { slug: 'post-malone', name: 'Post Malone', genre: 'pop, rock & hip-hop' },
    { slug: 'travis-scott', name: 'Travis Scott', genre: 'trap & hip-hop' },
    { slug: 'dua-lipa', name: 'Dua Lipa', genre: 'dance-pop' },
    { slug: 'ed-sheeran', name: 'Ed Sheeran', genre: 'acoustic pop' },
    { slug: 'lady-gaga', name: 'Lady Gaga', genre: 'pop & dance' },
    { slug: 'coldplay', name: 'Coldplay', genre: 'alt-rock & pop' },
    { slug: 'queen', name: 'Queen', genre: 'classic rock' },
    { slug: 'arctic-monkeys', name: 'Arctic Monkeys', genre: 'indie rock' },
    { slug: 'radiohead', name: 'Radiohead', genre: 'alternative rock' },
    { slug: 'kanye-west', name: 'Kanye West', genre: 'hip-hop' },
    { slug: 'frank-ocean', name: 'Frank Ocean', genre: 'alt-R&B' },
    { slug: 'tyler-the-creator', name: 'Tyler, The Creator', genre: 'hip-hop & neo-soul' },
    { slug: 'sza', name: 'SZA', genre: 'R&B' },
    { slug: 'harry-styles', name: 'Harry Styles', genre: 'pop-rock' },
    { slug: 'beyonce', name: 'Beyoncé', genre: 'pop & R&B' },
    { slug: 'rihanna', name: 'Rihanna', genre: 'pop & R&B' },
    { slug: 'linkin-park', name: 'Linkin Park', genre: 'alt-rock & nu-metal' }
];

const ARTIST_MAP = new Map(FEATURED_ARTISTS.map(a => [a.slug, a]));
const ARTIST_COMPACT_MAP = new Map(FEATURED_ARTISTS.map(a => [a.slug.replace(/-/g, ''), a]));

const RESERVED_SLUGS = new Set([
    'tracks',
    'top-tracks',
    'default',
    'track-details',
    'lyrics',
    'sitemap.xml',
    'robots.txt',
    'og-image.png',
    'script.js',
    'styles.css',
    'index.html',
    'favicon',
    'favicon.ico',
    'api',
    'artist',
    'assets'
]);

function normalizeArtistSlug(rawSlug) {
    if (!rawSlug || typeof rawSlug !== 'string') return '';
    return rawSlug
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9-]+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');
}

function humanizeSlug(slug) {
    return slug
        .split('-')
        .filter(Boolean)
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
}

function resolveArtistFromSlug(rawSlug) {
    if (!rawSlug || typeof rawSlug !== 'string') return null;
    const trimmedRaw = rawSlug.trim().toLowerCase();
    if (trimmedRaw.includes('.') || RESERVED_SLUGS.has(trimmedRaw)) return null;

    const slug = normalizeArtistSlug(rawSlug);
    if (!slug || slug.length < 2 || slug.length > 60) return null;
    if (RESERVED_SLUGS.has(slug)) return null;

    if (ARTIST_MAP.has(slug)) {
        return { ...ARTIST_MAP.get(slug), curated: true };
    }

    const compactKey = slug.replace(/-/g, '');
    if (ARTIST_COMPACT_MAP.has(compactKey)) {
        return { ...ARTIST_COMPACT_MAP.get(compactKey), curated: true };
    }

    // Dynamic fallback for valid artist-style slugs (e.g. /katy-perry, /ac-dc)
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) return null;

    return {
        slug,
        name: humanizeSlug(slug),
        genre: 'music',
        curated: false
    };
}

function buildArtistSeoMetadata(artist, baseUrl = 'https://type.vincentchan.uk') {
    const name = artist.name;
    const canonicalUrl = `${baseUrl}/${artist.slug}`;

    // Keep title <= 60 chars for Google SERP snippet limits
    let title = `${name} Lyrics Typing Game | TuneTyper`;
    if (title.length > 60) {
        title = `${name} Typing Game | TuneTyper`;
    }
    if (title.length > 60) {
        title = `${name.slice(0, 42).trim()} | TuneTyper`;
    }

    // Keep meta description strictly within 120 - 160 chars
    let description = `Type ${name} song lyrics, test your WPM typing speed, and guess the mystery track in TuneTyper. Play the free ${name} music typing game online!`;
    if (description.length > 160) {
        description = `Type ${name} lyrics, test your WPM speed, and guess the song in TuneTyper. Play the free online music typing game in your browser now!`;
    }
    if (description.length > 160) {
        description = `Type ${name.slice(0, 28).trim()} lyrics, test your WPM speed, and guess the track in TuneTyper. Play free online in your browser now!`;
    }
    if (description.length < 120) {
        description = `${description} Challenge friends to beat your high score today!`.slice(0, 158);
    }

    // Keep OG & Twitter descriptions <= 125 chars for mobile social cards
    let socialDescription = `Type ${name} lyrics, guess the tune, and beat your WPM in TuneTyper. Play free in your browser!`;
    if (socialDescription.length > 125) {
        socialDescription = `Type ${name.slice(0, 30).trim()} lyrics & beat your WPM in TuneTyper. Play free!`;
    }

    const keywords = `${name} typing game, ${name} lyrics typing test, type ${name} lyrics, ${name} song guessing game, WPM typing test, music typing game`;

    return {
        title,
        description,
        socialTitle: title,
        socialDescription,
        keywords,
        canonicalUrl
    };
}

function escapeHtmlAttr(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

function renderArtistHtml(artist, baseIndexHtml) {
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

function generateSitemapXml(baseUrl = 'https://type.vincentchan.uk', lastmod = '2026-10-31') {
    const urls = [
        { loc: `${baseUrl}/`, priority: '1.0', changefreq: 'weekly' },
        ...FEATURED_ARTISTS.map(artist => ({
            loc: `${baseUrl}/${artist.slug}`,
            priority: '0.8',
            changefreq: 'weekly'
        }))
    ];

    const entries = urls.map(u => [
        '  <url>',
        `    <loc>${u.loc}</loc>`,
        `    <lastmod>${lastmod}</lastmod>`,
        `    <changefreq>${u.changefreq}</changefreq>`,
        `    <priority>${u.priority}</priority>`,
        '  </url>'
    ].join('\n')).join('\n');

    return [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
        entries,
        '</urlset>',
        ''
    ].join('\n');
}

module.exports = {
    FEATURED_ARTISTS,
    RESERVED_SLUGS,
    normalizeArtistSlug,
    humanizeSlug,
    resolveArtistFromSlug,
    buildArtistSeoMetadata,
    renderArtistHtml,
    generateSitemapXml
};
