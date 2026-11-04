const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { FEATURED_ARTISTS, renderArtistHtml } = require('../artists');

const indexHtml = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');

test('Homepage targets "song lyrics typing game" searches', async (t) => {
    await t.test('title and description contain the core search phrase', () => {
        const title = indexHtml.match(/<title>([^<]*)<\/title>/i)[1];
        assert.match(title, /Song Lyrics Typing Game/);
        assert.ok(title.length <= 60, `title should not be truncated in results (${title.length} chars)`);
        const desc = indexHtml.match(/<meta name="description" content="([^"]*)">/i)[1];
        assert.match(desc, /song lyrics typing game/i);
    });

    await t.test('has crawlable "What is TuneTyper?" copy with an h2 and FAQ h3s', () => {
        assert.match(indexHtml, /<section id="about-tunetyper"[\s\S]*?<h2[^>]*>What is TuneTyper\?/);
        const faqs = indexHtml.match(/<section id="about-tunetyper"[\s\S]*?<\/section>/)[0].match(/<h3>/g) || [];
        assert.ok(faqs.length >= 3);
    });

    await t.test('structured data is valid JSON with WebSite and free WebApplication', () => {
        const json = indexHtml.match(/<script id="structured-data" type="application\/ld\+json">([\s\S]*?)<\/script>/)[1];
        const data = JSON.parse(json);
        const types = data['@graph'].map((n) => n['@type']);
        assert.deepEqual(types.sort(), ['WebApplication', 'WebSite']);
        const app = data['@graph'].find((n) => n['@type'] === 'WebApplication');
        assert.equal(app.applicationCategory, 'GameApplication');
        assert.equal(app.offers.price, '0');
    });

    await t.test('artist pages drop the homepage copy to avoid duplicate content', () => {
        const html = renderArtistHtml(FEATURED_ARTISTS[0], indexHtml);
        assert.ok(!html.includes('id="about-tunetyper"'));
        assert.ok(html.includes('<footer class="footer">'));
    });
});
