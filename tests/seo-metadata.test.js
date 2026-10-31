const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

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

test('SEO & Open Graph metadata validation', async (t) => {
    await t.test('Page title is within Google SERP display limit (<= 60 chars)', () => {
        const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
        assert.ok(titleMatch, 'Title tag should exist');
        const title = titleMatch[1].trim();
        // Unescape &amp; if present
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
        // Check for conversion CTA text in template
        const hasCta = /Play Free|Play Now|Start Playing|Start Typing/i.test(ogTemplate);
        assert.ok(hasCta, 'assets/og-image.html must contain a conversion call-to-action');

        const ogImageAlt = getTagAttr(/<meta\s+property=["']og:image:alt["'][^>]*>/i, 'content');
        assert.ok(ogImageAlt, 'og:image:alt must exist');
        assert.ok(ogImageAlt.length > 20, 'og:image:alt should be descriptive');
    });
});
