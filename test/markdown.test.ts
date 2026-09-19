import test from 'node:test';
import assert from 'node:assert/strict';
import { deTex, parseInline, parseMarkdown } from '../ui/src/markdown.js';

// The LaTeX the agents actually write, reduced to readable Unicode.
test('deTex: the forms the documents use', () => {
  assert.equal(deTex('S_{\\text{bazal}}'), 'S_bazal');
  assert.equal(deTex('S_{\\text{uyku\\_kaybı}}'), 'S_uyku_kaybı');
  assert.equal(
    deTex('S_{\\text{toplam}} = \\min(S_{\\text{hesaplanan}}, \\text{Kilo} \\times 60\\text{ ml})'),
    'S_toplam = min(S_hesaplanan, Kilo × 60 ml)',
  );
  assert.equal(deTex('T_{\\text{hissedilen}} = 22^\\circ\\text{C}'), 'T_hissedilen = 22°C');
  assert.equal(deTex('\\ge 2.500'), '≥ 2.500');
  assert.equal(deTex('\\Delta T \\rightarrow 1.05'), 'ΔT → 1.05');
  assert.equal(deTex('\\%50'), '%50');
  assert.equal(deTex('\\frac{a}{b}'), '(a)/(b)');
  assert.equal(
    deTex(
      '\\left( x \\times \\frac{t_{\\text{uyanık\\_geçen}}}{\\text{Toplam Uyanık Süre}} \\right)',
    ),
    '( x × (t_uyanık_geçen)/(Toplam Uyanık Süre) )',
  );
  assert.equal(
    deTex(
      'N = \\begin{cases} 1.20 & \\text{eğer Nem} > \\%65 \\\\ 1.00 & \\text{diğer} \\end{cases}',
    ),
    'N = { 1.20 eğer Nem > %65 ; 1.00 diğer }',
  );
});

test('parseInline: $math$ is a span, prices are prose', () => {
  assert.deepEqual(parseInline('açığı ($\\text{Deficit}(t)$) takibi'), [
    { type: 'text', value: 'açığı (' },
    { type: 'math', value: 'Deficit(t)' },
    { type: 'text', value: ') takibi' },
  ]);
  assert.deepEqual(parseInline('costs $5 and $10 a month'), [
    { type: 'text', value: 'costs $5 and $10 a month' },
  ]);
});

test('parseMarkdown: a $$display$$ line is a paragraph holding one formula', () => {
  const [tok] = parseMarkdown('$$\\Delta T = \\max(0, T - 22)$$');
  assert.equal(tok.kind, 'para');
  assert.deepEqual(parseInline(tok.text), [{ type: 'math', value: 'ΔT = max(0, T - 22)' }]);
});

test('parseMarkdown: an unfenced box-drawing flow is one code block with its root line', () => {
  const md = [
    'Intro sentence.',
    '',
    'SCR-01 (Splash)',
    '│',
    '├──► SCR-02',
    '└──► SCR-03',
    '',
    'After.',
  ].join('\n');
  const kinds = parseMarkdown(md).map((t) => t.kind);
  assert.deepEqual(kinds, ['para', 'blank', 'code', 'blank', 'para']);
  const code = parseMarkdown(md).find((t) => t.kind === 'code')!;
  assert.equal(code.text, 'SCR-01 (Splash)\n│\n├──► SCR-02\n└──► SCR-03');
  assert.deepEqual(
    parseMarkdown(md).map((t) => t.index),
    [0, 1, 2, 3, 4],
  );
});

test('parseMarkdown: --- on its own line is a rule, not prose', () => {
  const toks = parseMarkdown('A\n\n---\n\nB');
  assert.deepEqual(
    toks.map((t) => t.kind),
    ['para', 'blank', 'rule', 'blank', 'para'],
  );
  assert.equal(toks[2]!.selectable, false);
});
