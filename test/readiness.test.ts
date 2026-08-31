import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { assessBrief } from '../server/readiness.js';

const FILLED = `---
status: approved
author: +prime
---

# Product Roadmap & Vision

## Product Vision & Goals

A shared shopping list for households, so two people never buy the same milk twice.
The list syncs live and works offline on the phone in the shop.

## Target Audience & Personas

Couples and flatmates who share a kitchen and shop separately.

## Key Performance Indicators (KPIs)

Weekly lists completed per household; duplicate purchases self-reported per month.

## Future Scope & Out of Scope

No price tracking, no recipes, no store integrations in v1.
`;

test('a one-word brief does not pass the floor', () => {
  const r = assessBrief('---\nstatus: approved\n---\n\nDeneme\n');
  assert.equal(r.ok, false);
  assert.equal(r.questions.length, 4);
});

test('the untouched skeleton does not pass the floor', () => {
  const skeleton = readFileSync(
    join(import.meta.dirname, '..', 'templates', 'foundation', 'BRD.md'),
    'utf8',
  );
  const r = assessBrief(skeleton);
  assert.equal(r.ok, false);
  // Every bracket line is the template asking, not the brief answering.
  assert.equal(r.questions.length, 4);
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
