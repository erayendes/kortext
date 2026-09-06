import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { contrast, parseDesignTokens, renderDesignPreview } from '../server/design-preview.js';

const filled = `---
status: draft
author: +designer
---

# Design System

| Token Name | HEX / RGB | Usage Context |
| :--- | :--- | :--- |
| \`--color-bg-main\` | \`#ffffff\` | Main page background |
| \`--color-text-base\` | \`#18181b\` | Standard text content |
| \`--color-primary\` | \`#2563eb\` | Primary buttons |
| \`--color-primary-hover\` | \`#1d4ed8\` | Hover state |
| \`--color-border\` | \`#e4e4e7\` | Divider lines |
| \`--color-error\` | \`#dc2626\` | Error states |

- \`--space-sm\`: \`8px\`  (1x)
- \`--space-md\`: \`16px\` (2x)
- \`--radius-btn\`: \`10px\`
- \`--shadow-sm\`: \`0 1px 2px rgba(0,0,0,0.06)\`

| Role | Font-Family | Size (px) | Line-Height | Weight | Letter-Spacing |
| :--- | :--- | :--- | :--- | :--- | :--- |
| \`H1\` | \`Inter\` | \`40px\` | \`1.2\` | \`700\` | \`-0.02em\` |
| \`Body\` | \`Inter\` | \`16px\` | \`1.5\` | \`400\` | \`normal\` |
`;

test('parseDesignTokens buckets colors, scales and type roles', () => {
  const t = parseDesignTokens(filled);
  assert.equal(t.colors.length, 6);
  assert.deepEqual(
    t.spacing.map((s) => s.value),
    ['8px', '16px'],
  );
  assert.equal(t.radius[0]?.value, '10px');
  assert.equal(t.shadows[0]?.name, '--shadow-sm');
  assert.deepEqual(
    t.type.map((r) => r.role),
    ['H1', 'Body'],
  );
  assert.equal(t.type[0]?.size, '40px');
  assert.equal(t.type[0]?.tracking, '-0.02em');
});

test('the template ships a scale but no colors — a placeholder is not a token', () => {
  const template = readFileSync(join(process.cwd(), 'templates', 'docs', 'DESIGN.md'), 'utf8');
  const t = parseDesignTokens(template);
  assert.equal(t.colors.length, 0);
  assert.ok(t.spacing.length >= 5);
  assert.ok(t.type.length >= 4);
});

test('a document with nothing decided says so instead of drawing an empty page', () => {
  const html = renderDesignPreview('---\nstatus: uninitialized\n---\n\n# Design System\n', 'demo');
  assert.match(html, /carries no decided tokens yet/);
});

test('a value that is not CSS-safe never reaches the page', () => {
  const hostile = filled.replace('#2563eb', '#fff;} body{display:none');
  const html = renderDesignPreview(hostile, 'demo');
  // The token is dropped rather than escaped into a style block — a value that
  // can close a rule is not a color.
  assert.doesNotMatch(html, /body\{display:none/);
  assert.doesNotMatch(html, /--kx-c\d+:#fff;/);
});

test('render draws swatches, specimens and a contrast verdict', () => {
  const html = renderDesignPreview(filled, 'demo');
  assert.match(html, /--kx-c\d+:#2563eb/);
  assert.match(html, /font-size:40px/);
  // Each color is graded against the contrast that applies to it — a
  // background measured against itself once scored a meaningless 1.00:1.
  assert.match(html, /light text on it/);
  assert.doesNotMatch(html, /1\.00:1/);
  assert.equal(contrast('#ffffff', '#000000')?.toFixed(0), '21');
});

test('the page carries a light/dark switch and both palettes', () => {
  const html = renderDesignPreview(filled, 'demo');
  assert.match(html, /data-mode="dark"/);
  assert.match(html, /:root\[data-theme="dark"\]/);
  // Nothing was declared for dark, so the page says so instead of pretending.
  assert.match(html, /declares no dark palette/);
});

test('a dark value is read from a column, a dark heading or a -dark suffix', () => {
  const column = parseDesignTokens(`
| Token | Light | Dark | Usage |
| :--- | :--- | :--- | :--- |
| \`--color-bg-main\` | \`#ffffff\` | \`#101013\` | Page background |
`);
  assert.equal(column.colors[0]?.value, '#ffffff');
  assert.equal(column.colors[0]?.dark, '#101013');

  const heading = parseDesignTokens(`
| Token | HEX |
| :--- | :--- |
| \`--color-bg-main\` | \`#ffffff\` |

## Dark mode

| Token | HEX |
| :--- | :--- |
| \`--color-bg-main\` | \`#101013\` |
`);
  assert.equal(heading.colors.length, 1);
  assert.equal(heading.colors[0]?.dark, '#101013');

  const suffix = parseDesignTokens(`
- \`--color-bg\`: \`#ffffff\`
- \`--color-bg-dark\`: \`#101013\`
`);
  assert.equal(suffix.colors.length, 1);
  assert.equal(suffix.colors[0]?.dark, '#101013');
});

test('a declared dark palette repaints the swatches, not only the chrome', () => {
  const withDark = `${filled}

## Dark mode

| Token | HEX |
| :--- | :--- |
| \`--color-bg-main\` | \`#101013\` |
`;
  const html = renderDesignPreview(withDark, 'demo');
  assert.doesNotMatch(html, /declares no dark palette/);
  assert.match(html, /:root\[data-theme="dark"\][^}]*#101013/);
});
