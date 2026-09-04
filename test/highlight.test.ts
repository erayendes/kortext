import test from 'node:test';
import assert from 'node:assert/strict';
import { highlight } from '../ui/src/highlight.js';

// The tokenizer's contract, in one line: whatever it does to the colours, the
// text that comes back out is the text that went in. A highlighter that drops
// or duplicates a character is worse than none at all.
const roundTrips = (code: string, lang?: string) =>
  assert.equal(
    highlight(code, lang)
      .map((t) => t.text)
      .join(''),
    code,
  );

const kindsOf = (code: string, lang: string) =>
  highlight(code, lang)
    .filter((t) => t.kind)
    .map((t) => `${t.kind}:${t.text.trim()}`);

test('an unknown language is left alone, as one plain run', () => {
  const tree = 'book-tracker/\n├── src/\n└── package.json';
  assert.deepEqual(highlight(tree), [{ text: tree }]);
  assert.deepEqual(highlight(tree, 'text'), [{ text: tree }]);
});

test('shell: the command, its flags, strings and comments', () => {
  const code =
    '# clone it\ngit clone https://example.com/x.git\ncd x\nnpm install --save-dev "a b"';
  roundTrips(code, 'bash');
  const kinds = kindsOf(code, 'bash');
  assert.ok(kinds.includes('com:# clone it'));
  assert.ok(kinds.includes('kw:git'));
  assert.ok(kinds.includes('kw:cd'));
  assert.ok(kinds.includes('kw:npm'));
  assert.ok(kinds.includes('flag:--save-dev'));
  assert.ok(kinds.includes('str:"a b"'));
});

test('json: a key is coloured apart from its value', () => {
  const code = '{"name": "kortext", "port": 4200, "dev": true}';
  roundTrips(code, 'json');
  const kinds = kindsOf(code, 'json');
  assert.ok(kinds.includes('key:"name"'));
  assert.ok(kinds.includes('str:"kortext"'));
  assert.ok(kinds.includes('num:4200'));
  assert.ok(kinds.includes('kw:true'));
});

test('sql keywords are case-insensitive; js keeps its strings whole', () => {
  const sql = "create table books (id integer primary key, title text not null default '');";
  roundTrips(sql, 'sql');
  assert.ok(kindsOf(sql, 'sql').includes('kw:create'));

  const js = "import { openDb } from './db.js'; // one connection\nconst port = 4200;";
  roundTrips(js, 'ts');
  const kinds = kindsOf(js, 'ts');
  assert.ok(kinds.includes('kw:import'));
  assert.ok(kinds.includes("str:'./db.js'"));
  assert.ok(kinds.includes('com:// one connection'));
});

test('a block of nothing but text survives every grammar', () => {
  for (const lang of ['bash', 'json', 'sql', 'ts']) {
    roundTrips('', lang);
    roundTrips('\n\n', lang);
    roundTrips('plain words with no tokens at all', lang);
  }
});
