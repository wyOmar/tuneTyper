const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const cssPath = path.join(__dirname, '..', 'public', 'styles.css');
const htmlPath = path.join(__dirname, '..', 'public', 'index.html');
const css = fs.readFileSync(cssPath, 'utf-8');
const html = fs.readFileSync(htmlPath, 'utf-8');

test('Footer layout and positioning validation', async (t) => {
    await t.test('Footer does not use fixed positioning to prevent overlapping content on zoom', () => {
        const footerBlockMatch = css.match(/\.footer\s*\{([^}]+)\}/);
        assert.ok(footerBlockMatch, '.footer rule should exist in styles.css');
        const footerStyles = footerBlockMatch[1];

        assert.doesNotMatch(
            footerStyles,
            /position\s*:\s*fixed/i,
            '.footer must not use position: fixed as it collides with content on zoomed viewports'
        );
    });

    await t.test('Body provides full viewport height flex layout for sticky footer', () => {
        const bodyBlockMatch = css.match(/body\s*\{([^}]+)\}/);
        assert.ok(bodyBlockMatch, 'body rule should exist in styles.css');
        const bodyStyles = bodyBlockMatch[1];

        assert.match(bodyStyles, /min-height\s*:\s*100vh/i, 'body must have min-height: 100vh');
        assert.match(bodyStyles, /display\s*:\s*flex/i, 'body must have display: flex');
        assert.match(bodyStyles, /flex-direction\s*:\s*column/i, 'body must have flex-direction: column');
    });

    await t.test('Footer pushes down with margin-top: auto', () => {
        const footerBlockMatch = css.match(/\.footer\s*\{([^}]+)\}/);
        assert.ok(footerBlockMatch, '.footer rule should exist');
        const footerStyles = footerBlockMatch[1];

        assert.match(footerStyles, /margin-top\s*:\s*auto/i, '.footer should have margin-top: auto');
    });

    await t.test('Footer renders minimal Monkeytype-style GitHub icon + label link', () => {
        assert.doesNotMatch(html, /View this project on/i, 'Legacy plain-text GitHub sentence should be removed');
        assert.match(
            html,
            /<div class="footer-links">[\s\S]*?<a[^>]*href="https:\/\/github\.com\/wyOmar\/tuneTyper"[^>]*class="footer-link"[^>]*>[\s\S]*?<svg class="footer-icon"[\s\S]*?<span>github<\/span>[\s\S]*?<\/a>[\s\S]*?<\/div>/,
            'Footer should render .footer-links with .footer-link, inline .footer-icon SVG, and monospace github label'
        );
        assert.match(html, /rel="noopener noreferrer"/, 'External GitHub link should include rel="noopener noreferrer"');

        const footerLinkMatch = css.match(/\.footer-link\s*\{([^}]+)\}/);
        assert.ok(footerLinkMatch, '.footer-link rule should exist in styles.css');
        assert.match(footerLinkMatch[1], /font-family\s*:\s*monospace/i, '.footer-link should use monospace font');
        assert.match(footerLinkMatch[1], /text-decoration\s*:\s*none/i, '.footer-link should not be underlined');
    });

    await t.test('Footer wraps popular artist crawl links in a collapsible <details> to prevent clutter', () => {
        assert.match(
            html,
            /<details\s+class="artist-seo-collapse">[\s\S]*?<summary\s+class="artist-seo-summary">[\s\S]*?<span\s+class="artist-seo-summary-label">Popular Artists<\/span>[\s\S]*?<nav\s+class="artist-seo-links"/,
            'Footer should wrap .artist-seo-links inside .artist-seo-collapse details and .artist-seo-summary toggle'
        );
        assert.doesNotMatch(
            html,
            /<details\s+class="artist-seo-collapse"\s+open/i,
            'Popular artists details element should be closed by default to prevent visual clutter'
        );

        assert.ok(css.includes('.artist-seo-collapse'), '.artist-seo-collapse styles should exist');
        assert.ok(css.includes('.artist-seo-summary'), '.artist-seo-summary styles should exist');
        assert.ok(css.includes('.artist-seo-chevron'), '.artist-seo-chevron styles should exist');
    });
});
