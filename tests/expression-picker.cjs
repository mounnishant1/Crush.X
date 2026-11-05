'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const js = fs.readFileSync(path.join(root, 'expression-picker.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'expression-picker.css'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
new vm.Script(js, { filename: 'expression-picker.js' });
assert.match(html, /<link rel="stylesheet" href="\.\/expression-picker\.css"/);
assert.match(html, /<script src="\.\/expression-picker\.js"><\/script>/);
for (const selector of ['[data-comment-input]', '#messageDraft', '#captionInput',
  '[data-social-reply-text]', '[data-social-note]', '[data-advanced-text]',
  '[data-advanced-edit-text]', '[data-advanced-story-note]', '[data-cxn-text]', 'textarea:not([readonly])',
  '[contenteditable="true"]']) {
  assert.ok(js.includes(selector), selector + ' must use shared picker');
}
assert.match(js, /MutationObserver\(scheduleScan\)/);
assert.match(js, /aria-label="Search emoji or sticker"/);
assert.match(js, /setRangeText\(allowed, start, end, 'end'\)/);
assert.match(js, /new Event\('input', \{ bubbles: true \}\)/);
assert.match(js, /node\.type === 'password'/);
assert.match(js, /licensed GIF search provider/);
assert.match(css, /env\(safe-area-inset-bottom\)/);
assert.match(css, /prefers-reduced-motion/);
console.log('Unified expression picker source checks PASS');