const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const cssPath = path.join(__dirname, '..', 'public', 'styles.css');
const css = fs.readFileSync(cssPath, 'utf-8');

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
});
