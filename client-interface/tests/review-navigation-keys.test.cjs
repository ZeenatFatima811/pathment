const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

// Run this isolated TypeScript utility on the project's Node 20 runtime.
const source = fs.readFileSync(path.join(__dirname, '../lib/utils/review-navigation-keys.ts'), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } });
const loaded = { exports: {} };
new Function('exports', 'module', compiled.outputText)(loaded.exports, loaded);
const { reviewNavigationAction, targetOwnsArrowKeys } = loaded.exports;

const el = (tagName, { isContentEditable = false, inMenu = false } = {}) => ({
  tagName,
  isContentEditable,
  closest: () => (inMenu ? {} : null),
});

test('plain arrows step through the queue', () => {
  assert.equal(reviewNavigationAction({ key: 'ArrowRight' }), 'next');
  assert.equal(reviewNavigationAction({ key: 'ArrowLeft' }), 'previous');
});

test('other keys do nothing', () => {
  for (const key of ['ArrowUp', 'ArrowDown', 'Enter', 'a', 'Tab', 'Escape']) {
    assert.equal(reviewNavigationAction({ key }), null, `${key} should not navigate`);
  }
});

/**
 * The shortcut used to REQUIRE alt. Alt+Left is Back on Windows and Linux, so
 * the reviewer either saw nothing happen or lost the page they were working on.
 * Every chord now belongs to the browser.
 */
test('modifiers are left to the browser', () => {
  assert.equal(reviewNavigationAction({ key: 'ArrowLeft', altKey: true }), null);
  assert.equal(reviewNavigationAction({ key: 'ArrowLeft', metaKey: true }), null);
  assert.equal(reviewNavigationAction({ key: 'ArrowRight', ctrlKey: true }), null);
  assert.equal(reviewNavigationAction({ key: 'ArrowRight', shiftKey: true }), null);
});

/** Typing a reason mid-sentence must not jump to another mentee. */
test('a text box keeps its own arrows', () => {
  assert.equal(reviewNavigationAction({ key: 'ArrowLeft' }, el('TEXTAREA')), null);
  assert.equal(reviewNavigationAction({ key: 'ArrowRight' }, el('INPUT')), null);
  assert.equal(reviewNavigationAction({ key: 'ArrowLeft' }, el('SELECT')), null);
  assert.equal(reviewNavigationAction({ key: 'ArrowLeft' }, el('DIV', { isContentEditable: true })), null);
});

test('an open badge menu keeps its own arrows', () => {
  assert.equal(reviewNavigationAction({ key: 'ArrowRight' }, el('DIV', { inMenu: true })), null);
});

test('an ordinary element does not block navigation', () => {
  assert.equal(reviewNavigationAction({ key: 'ArrowRight' }, el('DIV')), 'next');
  assert.equal(reviewNavigationAction({ key: 'ArrowRight' }, el('BUTTON')), 'next');
});

test('tag matching is case-insensitive, as the DOM is not guaranteed upper', () => {
  assert.equal(targetOwnsArrowKeys(el('textarea')), true);
});

test('a target with no closest() is handled, not thrown at', () => {
  assert.equal(reviewNavigationAction({ key: 'ArrowRight' }, { tagName: 'DIV' }), 'next');
  assert.equal(reviewNavigationAction({ key: 'ArrowRight' }, null), 'next');
});
