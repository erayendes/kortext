import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { assessBrief, countSourceFiles } from '../server/readiness.js';

const FILLED = `---
status: approved
author: +prime
---

# Project Brief (BRD)

## Product Vision & Goals

A shared shopping list for households, so two people never buy the same milk twice.
The list syncs live and works offline on the phone in the shop.

## Target Audience & Personas

Couples and flatmates who share a kitchen and shop separately.

## Interface Language

Turkish only in v1; English is a later decision, not a v1 scope item.

## Key Performance Indicators (KPIs)

Weekly lists completed per household; duplicate purchases self-reported per month.

## Future Scope & Out of Scope

No price tracking, no recipes, no store integrations in v1.
`;

test('a one-word brief does not pass the floor', () => {
  const r = assessBrief('---\nstatus: approved\n---\n\nDeneme\n');
  assert.equal(r.ok, false);
  assert.equal(r.questions.length, 5);
});

test('the untouched skeleton does not pass the floor', () => {
  const skeleton = readFileSync(
    join(import.meta.dirname, '..', 'templates', 'docs', 'BRIEF.md'),
    'utf8',
  );
  const r = assessBrief(skeleton);
  assert.equal(r.ok, false);
  // Every bracket line is the template asking, not the brief answering.
  assert.equal(r.questions.length, 5);
});

test('a brief that answers every section passes the floor', () => {
  assert.deepEqual(assessBrief(FILLED), { ok: true, questions: [] });
});

test('a half-filled brief names only the sections still empty', () => {
  const half = FILLED.replace(
    'Weekly lists completed per household; duplicate purchases self-reported per month.',
    '- [What are the success criteria?]',
  );
  const r = assessBrief(half);
  assert.equal(r.ok, false);
  assert.equal(r.questions.length, 1);
  assert.match(r.questions[0], /Key Performance Indicators/);
});

test('headings alone are not content, however many there are', () => {
  const headingsOnly = FILLED.split('\n')
    .filter((l) => l.startsWith('#') || l.trim() === '')
    .join('\n');
  assert.equal(assessBrief(headingsOnly).ok, false);
});

test('countSourceFiles ignores scaffolding and stops at the limit', () => {
  const work = mkdtempSync(join(tmpdir(), 'kortext-readiness-'));
  // a folder holding only kortext's own scaffolding is not a project
  mkdirSync(join(work, '.kortext'), { recursive: true });
  writeFileSync(join(work, '.kortext', 'STACK.md'), 'x');
  writeFileSync(join(work, 'AGENTS.md'), 'x');
  assert.equal(countSourceFiles(work, 3), 0);

  mkdirSync(join(work, 'node_modules', 'left-pad'), { recursive: true });
  writeFileSync(join(work, 'node_modules', 'left-pad', 'index.js'), 'x');
  assert.equal(countSourceFiles(work, 3), 0); // dependencies are not the project

  mkdirSync(join(work, 'src'));
  for (const f of ['a.ts', 'b.ts', 'c.ts', 'd.ts']) writeFileSync(join(work, 'src', f), 'x');
  assert.equal(countSourceFiles(work, 3), 3); // early exit: counts to the floor, not beyond
  rmSync(work, { recursive: true, force: true });
});

test('a brief that never says which language the product speaks is not ready', () => {
  const noLanguage = FILLED.replace(
    /## Interface Language\n\n.*\n/,
    '## Interface Language\n\n- [Which language does the product speak to its users?]\n',
  );
  const r = assessBrief(noLanguage);
  assert.equal(r.ok, false);
  assert.equal(r.questions.length, 1);
  assert.match(r.questions[0], /Interface Language/);
});

test("the panel's example brief passes the gate it is offered under", () => {
  // The Insert example button must not hand the user a brief the floor rejects.
  const app = readFileSync(join(import.meta.dirname, '..', 'ui', 'src', 'App.tsx'), 'utf8');
  const example = app.match(/const BRIEF_EXAMPLE = `([\s\S]*?)`;/)?.[1];
  assert.ok(example, 'BRIEF_EXAMPLE not found in App.tsx');
  assert.deepEqual(assessBrief(example), { ok: true, questions: [] });
});

test('a brief written in another language is measured on its prose, not on English headings', () => {
  const turkish = `---
status: approved
author: +prime
---

# Ürün Yol Haritası ve Vizyon

## Ürün Vizyonu ve Hedefleri

Aynı apartmandaki komşuların birbirine matkap, merdiven, bavul gibi eşyalar ödünç verdiği bir
web uygulaması. Kimse yılda iki kez kullanacağı bir alet için ikinci kez para vermesin.

## Hedef Kitle ve Personalar

Türkiye'de apartman veya sitede oturan 25-55 yaş arası kiracı ve ev sahipleri.

## Arayüz Dili

Türkçe varsayılan, İngilizce ikinci dil.

## Temel Performans Göstergeleri

Bina başına haftalık tamamlanan ödünç verme sayısı.

## Kapsam Dışı

Ödeme yok, kargo yok, binalar arası paylaşım yok.
`;
  assert.deepEqual(assessBrief(turkish), { ok: true, questions: [] });
});
