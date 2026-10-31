const FEATURED_ARTISTS = [
    {
        slug: 'taylor-swift',
        name: 'Taylor Swift',
        genre: 'pop & indie-folk',
        topTracks: ['Cruel Summer', 'Anti-Hero', 'All Too Well', 'Blank Space', 'Shake It Off'],
        blurb: 'Test your WPM across Taylor Swift’s storytelling bridges, synth-pop hooks, and indie-folk verses—from rapid-fire phrasing in Cruel Summer to narrative classics.'
    },
    {
        slug: 'sabrina-carpenter',
        name: 'Sabrina Carpenter',
        genre: 'pop',
        topTracks: ['Espresso', 'Please Please Please', 'Taste', 'Feather', 'Nonsense'],
        blurb: 'Practice your typing speed on Sabrina Carpenter’s punchy pop choruses, witty one-liners, and upbeat rhythms, or race to guess the mystery track in five hints.'
    },
    {
        slug: 'chappell-roan',
        name: 'Chappell Roan',
        genre: 'synth-pop',
        topTracks: ['Good Luck, Babe!', 'HOT TO GO!', 'Pink Pony Club', 'Red Wine Supernova', 'Femininomenon'],
        blurb: 'Type along to Chappell Roan’s theatrical synth-pop anthems, high-energy camp hooks, and soaring bridges while tracking live WPM and per-character accuracy.'
    },
    {
        slug: 'olivia-rodrigo',
        name: 'Olivia Rodrigo',
        genre: 'pop-rock',
        topTracks: ['vampire', 'drivers license', 'good 4 u', 'deja vu', 'get him back!'],
        blurb: 'Challenge your keyboard speed on Olivia Rodrigo’s emotional ballads and fast-paced pop-punk verses—from drivers license crescendos to get him back! cadences.'
    },
    {
        slug: 'billie-eilish',
        name: 'Billie Eilish',
        genre: 'alt-pop',
        topTracks: ['BIRDS OF A FEATHER', 'bad guy', 'Happier Than Ever', 'WILDFLOWER', 'ocean eyes'],
        blurb: 'Type through Billie Eilish’s minimalist alt-pop verses and explosive late-song switches, testing both steady rhythm accuracy and burst WPM.'
    },
    {
        slug: 'eminem',
        name: 'Eminem',
        genre: 'fast rap & hip-hop',
        topTracks: ['Rap God', 'Lose Yourself', 'Without Me', 'The Real Slim Shady', 'Stan'],
        blurb: 'Push your maximum WPM ceiling with Eminem’s dense multisyllabic rhymes, rapid-fire hip-hop verses, and iconic storytelling tracks like Rap God and Lose Yourself.'
    },
    {
        slug: 'kendrick-lamar',
        name: 'Kendrick Lamar',
        genre: 'hip-hop',
        topTracks: ['Not Like Us', 'HUMBLE.', 'Money Trees', 'DNA.', 'All The Stars'],
        blurb: 'Sharpen your typing precision on Kendrick Lamar’s intricate West Coast flows, internal rhyme schemes, and rapid cadence switches across his biggest hits.'
    },
    {
        slug: 'the-weeknd',
        name: 'The Weeknd',
        genre: 'R&B & synth-pop',
        topTracks: ['Blinding Lights', 'Starboy', 'Save Your Tears', 'Die For You', 'The Hills'],
        blurb: 'Lock into a smooth typing rhythm with The Weeknd’s 80s-inspired synthwave hooks and moody R&B verses, then guess the mystery song from audio snippets.'
    },
    {
        slug: 'ariana-grande',
        name: 'Ariana Grande',
        genre: 'pop & R&B',
        topTracks: ['we can\'t be friends', '7 rings', 'thank u, next', 'Into You', 'positions'],
        blurb: 'Test your typing flow on Ariana Grande’s rhythmic R&B-pop verses, trap-pop cadences in 7 rings, and soaring vocal hooks.'
    },
    {
        slug: 'bruno-mars',
        name: 'Bruno Mars',
        genre: 'pop, funk & R&B',
        topTracks: ['Die With A Smile', 'Locked Out of Heaven', '24K Magic', 'That\'s What I Like', 'When I Was Your Man'],
        blurb: 'Keep pace with Bruno Mars’s upbeat funk grooves, retro R&B ballads, and high-tempo party hooks while competing for your cleanest accuracy score.'
    },
    {
        slug: 'drake',
        name: 'Drake',
        genre: 'hip-hop & R&B',
        topTracks: ['God\'s Plan', 'One Dance', 'Passionfruit', 'Jimmy Cooks', 'Rich Flex'],
        blurb: 'Type through Drake’s melodic R&B hooks and quotable hip-hop verses, switching seamlessly between laid-back rhythms and rapid rap bars.'
    },
    {
        slug: 'charli-xcx',
        name: 'Charli xcx',
        genre: 'hyperpop & club-pop',
        topTracks: ['360', 'Apple', 'Von dutch', 'Guess', 'Girl, so confusing'],
        blurb: 'Race the clock on Charli xcx’s repetitive club-pop hooks, hyperpop rhythms, and fast-talking Brat-era verses.'
    },
    {
        slug: 'lana-del-rey',
        name: 'Lana Del Rey',
        genre: 'dream-pop & alt-pop',
        topTracks: ['Summertime Sadness', 'Young and Beautiful', 'West Coast', 'Video Games', 'Cinnamon Girl'],
        blurb: 'Practice steady, high-accuracy typing on Lana Del Rey’s cinematic dream-pop lyrics, poetic imagery, and melancholic Americana ballads.'
    },
    {
        slug: 'post-malone',
        name: 'Post Malone',
        genre: 'pop, rock & hip-hop',
        topTracks: ['Circles', 'Sunflower', 'Chemical', 'rockstar', 'I Had Some Help'],
        blurb: 'Type Post Malone’s genre-blending hooks across melodic hip-hop, acoustic pop, and country-pop crossovers, and share challenges with friends.'
    },
    {
        slug: 'travis-scott',
        name: 'Travis Scott',
        genre: 'trap & hip-hop',
        topTracks: ['FE!N', 'SICKO MODE', 'goosebumps', 'MY EYES', 'HIGHEST IN THE ROOM'],
        blurb: 'Tackle Travis Scott’s hypnotic trap flows, beat-switch verses in SICKO MODE, and ad-lib-heavy hip-hop tracks with customizable typing toggles.'
    },
    {
        slug: 'dua-lipa',
        name: 'Dua Lipa',
        genre: 'dance-pop',
        topTracks: ['Levitating', 'Don\'t Start Now', 'Houdini', 'New Rules', 'Dance The Night'],
        blurb: 'Build rhythm and speed typing Dua Lipa’s disco-pop basslines, snappy verse phrasing, and infectious dancefloor choruses.'
    },
    {
        slug: 'ed-sheeran',
        name: 'Ed Sheeran',
        genre: 'acoustic pop',
        topTracks: ['Shape of You', 'Perfect', 'Thinking Out Loud', 'Bad Habits', 'Castle on the Hill'],
        blurb: 'From acoustic ballads like Perfect to rapid percussive verses in Shape of You, test your WPM across Ed Sheeran’s biggest songwriting hits.'
    },
    {
        slug: 'lady-gaga',
        name: 'Lady Gaga',
        genre: 'pop & dance',
        topTracks: ['Poker Face', 'Bad Romance', 'Just Dance', 'Shallow', 'Judas'],
        blurb: 'Type iconic dance-pop hooks and dramatic vocal bridges across Lady Gaga’s catalog—from Bad Romance to Oscar-winning ballads like Shallow.'
    },
    {
        slug: 'coldplay',
        name: 'Coldplay',
        genre: 'alt-rock & pop',
        topTracks: ['Yellow', 'Viva La Vida', 'The Scientist', 'Fix You', 'A Sky Full of Stars'],
        blurb: 'Enjoy smooth, flowing typing passages from Coldplay’s stadium alt-rock anthems and timeless piano ballads like Viva La Vida and Yellow.'
    },
    {
        slug: 'queen',
        name: 'Queen',
        genre: 'classic rock',
        topTracks: ['Bohemian Rhapsody', 'Don\'t Stop Me Now', 'Somebody to Love', 'Killer Queen', 'Under Pressure'],
        blurb: 'Take on theatrical classic rock lyrics from Queen—from operatic shifts in Bohemian Rhapsody to the high-velocity sprint of Don’t Stop Me Now.'
    },
    {
        slug: 'arctic-monkeys',
        name: 'Arctic Monkeys',
        genre: 'indie rock',
        topTracks: ['Do I Wanna Know?', '505', 'R U Mine?', 'I Wanna Be Yours', 'Fluorescent Adolescent'],
        blurb: 'Put your keyboard dexterity to the test on Alex Turner’s clever indie-rock wordplay, British slang, and rapid-fire Arctic Monkeys verses.'
    },
    {
        slug: 'radiohead',
        name: 'Radiohead',
        genre: 'alternative rock',
        topTracks: ['Creep', 'Karma Police', 'No Surprises', 'Paranoid Android', 'Exit Music (For a Film)'],
        blurb: 'Type haunting, poetic alternative rock lyrics from Radiohead classics across OK Computer, The Bends, and In Rainbows.'
    },
    {
        slug: 'kanye-west',
        name: 'Kanye West',
        genre: 'hip-hop',
        topTracks: ['Stronger', 'Flashing Lights', 'Runaway', 'Heartless', 'Gold Digger'],
        blurb: 'Test your WPM on Kanye West’s punchline-packed hip-hop verses, soul-sample anthems, and maximalist hooks from Graduation to My Beautiful Dark Twisted Fantasy.'
    },
    {
        slug: 'frank-ocean',
        name: 'Frank Ocean',
        genre: 'alt-R&B',
        topTracks: ['Pink + White', 'Thinkin Bout You', 'Nights', 'Ivy', 'Lost'],
        blurb: 'Practice mindful, high-accuracy typing on Frank Ocean’s vivid alt-R&B storytelling and stream-of-consciousness verses from Blonde and Channel Orange.'
    },
    {
        slug: 'tyler-the-creator',
        name: 'Tyler, The Creator',
        genre: 'hip-hop & neo-soul',
        topTracks: ['EARFQUAKE', 'See You Again', 'NEW MAGIC WAND', 'WUSYANAME', 'Noid'],
        blurb: 'Switch between soulful Igor melodies and sharp hip-hop bars in this Tyler, The Creator lyrics typing test with instant audio previews.'
    },
    {
        slug: 'sza',
        name: 'SZA',
        genre: 'R&B',
        topTracks: ['Kill Bill', 'Snooze', 'Good Days', 'Saturn', 'Kiss Me More'],
        blurb: 'Keep up with SZA’s conversational R&B phrasing, candid diary-style verses, and melodic runs across SOS and Ctrl favorites.'
    },
    {
        slug: 'harry-styles',
        name: 'Harry Styles',
        genre: 'pop-rock',
        topTracks: ['As It Was', 'Watermelon Sugar', 'Sign of the Times', 'Adore You', 'Late Night Talking'],
        blurb: 'Type breezy synth-pop sprints like As It Was alongside sweeping soft-rock ballads across Harry Styles’s solo discography.'
    },
    {
        slug: 'beyonce',
        name: 'Beyoncé',
        genre: 'pop & R&B',
        topTracks: ['CUFF IT', 'Crazy In Love', 'TEXAS HOLD \'EM', 'Halo', 'Single Ladies'],
        blurb: 'Test your speed on Beyoncé’s high-energy R&B, dance-floor Renaissance grooves, and country-pop anthems, then challenge friends to beat your WPM.'
    },
    {
        slug: 'rihanna',
        name: 'Rihanna',
        genre: 'pop & R&B',
        topTracks: ['Umbrella', 'Diamonds', 'We Found Love', 'Love On The Brain', 'Stay'],
        blurb: 'Type through Rihanna’s unmistakable pop, dancehall, and R&B hits—from Umbrella and Diamonds to vocal showcases like Love On The Brain.'
    },
    {
        slug: 'linkin-park',
        name: 'Linkin Park',
        genre: 'alt-rock & nu-metal',
        topTracks: ['In the End', 'Numb', 'Faint', 'What I\'ve Done', 'The Emptiness Machine'],
        blurb: 'Alternate between Mike Shinoda’s rapid rap verses and soaring alt-rock choruses in Linkin Park’s signature nu-metal classics.'
    }
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

    // Return null for unknown/unverified slugs so Express responds with 404
    // rather than generating thin soft-404 doorway pages for arbitrary paths.
    return null;
}

function buildArtistSeoMetadata(artist, baseUrl = 'https://type.vincentchan.uk') {
    const name = artist.name;
    const canonicalUrl = `${baseUrl}/${artist.slug}`;
    const sampleTracks = Array.isArray(artist.topTracks) ? artist.topTracks.slice(0, 2) : [];

    // Keep title <= 60 chars for Google SERP snippet limits
    let title = `${name} Lyrics Typing Game | TuneTyper`;
    if (title.length > 60) {
        title = `${name} Typing Game | TuneTyper`;
    }
    if (title.length > 60) {
        title = `${name.slice(0, 42).trim()} | TuneTyper`;
    }

    // Keep meta description strictly within 120 - 160 chars, incorporating real track names when they fit
    let description = '';
    if (sampleTracks.length === 2) {
        const trackCandidate = `Type ${name} lyrics like ${sampleTracks[0]} & ${sampleTracks[1]}, test your WPM speed, and guess the mystery song free in TuneTyper!`;
        if (trackCandidate.length >= 120 && trackCandidate.length <= 160) {
            description = trackCandidate;
        }
    }
    if (!description) {
        description = `Type ${name} song lyrics, test your WPM typing speed, and guess the mystery track in TuneTyper. Play the free ${name} music typing game online!`;
    }
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

    const trackKeywords = Array.isArray(artist.topTracks)
        ? artist.topTracks.slice(0, 3).map(t => `${t} lyrics typing`).join(', ')
        : '';
    const keywords = [
        `${name} typing game`,
        `${name} lyrics typing test`,
        `type ${name} lyrics`,
        `${name} song guessing game`,
        trackKeywords,
        'WPM typing test',
        'music typing game'
    ].filter(Boolean).join(', ');

    return {
        title,
        description,
        socialTitle: title,
        socialDescription,
        keywords,
        canonicalUrl
    };
}

function escapeHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

function buildArtistHeroHtml(artist) {
    const safeName = escapeHtml(artist.name);
    const safeGenre = escapeHtml(artist.genre || 'music');
    const safeBlurb = escapeHtml(
        artist.blurb ||
        `Practice your WPM typing speed on ${artist.name} lyrics and guess the mystery track in five hints.`
    );
    const tracks = Array.isArray(artist.topTracks) ? artist.topTracks : [];

    const pillsHtml = tracks.length > 0
        ? [
            `<div class="artist-track-pills" role="group" aria-label="Popular ${safeName} songs">`,
            `    <span class="artist-tracks-label">Popular tracks:</span>`,
            ...tracks.map(track => {
                const safeTrack = escapeHtml(track);
                return `    <button type="button" class="artist-track-pill" data-artist="${safeName}" data-track="${safeTrack}">${safeTrack}</button>`;
            }),
            `</div>`
        ].join('\n')
        : '';

    return [
        `<header id="artist-hero" class="artist-hero" data-artist-slug="${escapeHtml(artist.slug)}">`,
        `    <div class="artist-hero-top">`,
        `        <h1 class="artist-hero-title">${safeName} Lyrics Typing Game</h1>`,
        `        <span class="artist-genre-badge">${safeGenre}</span>`,
        `    </div>`,
        `    <p class="artist-hero-desc">${safeBlurb}</p>`,
        pillsHtml,
        `</header>`
    ].filter(Boolean).join('\n');
}

function renderArtistHtml(artist, baseIndexHtml) {
    const seo = buildArtistSeoMetadata(artist);
    const safeTitle = escapeHtml(seo.title);
    const safeDesc = escapeHtml(seo.description);
    const safeSocialTitle = escapeHtml(seo.socialTitle);
    const safeSocialDesc = escapeHtml(seo.socialDescription);
    const safeKeywords = escapeHtml(seo.keywords);
    const safeCanonical = escapeHtml(seo.canonicalUrl);
    const safeArtistName = escapeHtml(artist.name);

    const aboutGroup = {
        '@type': 'MusicGroup',
        name: artist.name,
        ...(artist.genre ? { genre: artist.genre } : {}),
        ...(Array.isArray(artist.topTracks) && artist.topTracks.length > 0
            ? {
                track: artist.topTracks.map(trackName => ({
                    '@type': 'MusicRecording',
                    name: trackName
                }))
            }
            : {})
    };

    const structuredData = JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'WebApplication',
        name: seo.title,
        url: seo.canonicalUrl,
        applicationCategory: 'GameApplication',
        operatingSystem: 'All',
        description: seo.description,
        about: aboutGroup,
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

    const heroHtml = buildArtistHeroHtml(artist);

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

    // Demote navbar brand heading to <span> on artist routes so the artist <h1> is the sole semantic <h1>
    html = html.replace(
        /<h1\s+class=["']navbar-title["']>([^<]*)<\/h1>/i,
        `<span class="navbar-title">$1</span>`
    );

    // Inject unique visible SSR artist hero (heading, blurb, popular track quick-play pills)
    if (html.includes('<div id="artist-hero-slot"></div>')) {
        html = html.replace('<div id="artist-hero-slot"></div>', heroHtml);
    } else {
        html = html.replace(/<div\s+class=["']container["']>/i, `<div class="container">\n${heroHtml}`);
    }

    html = html.replace(
        /<input\s+type=["']text["']\s+id=["']artist-input["']\s+placeholder=["']Searching for\.\.\.["']>/i,
        `<input type="text" id="artist-input" value="${safeArtistName}" placeholder="Searching for...">`
    );

    // Highlight current artist link in footer navigation
    const escapedSlugForRegex = artist.slug.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    html = html.replace(
        new RegExp(`<a\\s+href=["']/${escapedSlugForRegex}["']>`, 'i'),
        `<a href="/${escapeHtml(artist.slug)}" aria-current="page">`
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
    buildArtistHeroHtml,
    renderArtistHtml,
    generateSitemapXml
};
