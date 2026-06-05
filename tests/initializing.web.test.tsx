import { describe, it, expect } from 'vitest';
import {
  isApprove,
  artifactFilename,
  questionStatus,
  deriveRows,
  docsPathFor,
} from '../src/routes/initializing.tsx';
import type { PendingQuestion } from '../src/lib/api-types.ts';

function q(partial: Partial<PendingQuestion> & Pick<PendingQuestion, 'id'>): PendingQuestion {
  return {
    run_id: 1,
    step_id: null,
    question: 'Onaylıyor musun?',
    choices: ['approve', 'revise'],
    status: 'open',
    answer: null,
    answered_by: null,
    answered_at: null,
    created_at: 0,
    artifact_path: null,
    persona: null,
    phase: null,
    ...partial,
  };
}

describe('isApprove', () => {
  it('treats only "approve" (case/space-insensitive) as approval', () => {
    expect(isApprove('approve')).toBe(true);
    expect(isApprove(' Approve ')).toBe(true);
    expect(isApprove('APPROVE')).toBe(true);
    expect(isApprove('please fix the tone')).toBe(false);
    expect(isApprove('revise')).toBe(false);
    expect(isApprove(null)).toBe(false);
    expect(isApprove(undefined)).toBe(false);
  });
});

describe('artifactFilename', () => {
  it('returns the last path segment', () => {
    expect(artifactFilename('.kortext/references/LEGAL.md')).toBe('LEGAL.md');
    expect(artifactFilename('GROWTH.md')).toBe('GROWTH.md');
    expect(artifactFilename(null)).toBe('—');
    expect(artifactFilename(undefined)).toBe('—');
  });
});

describe('questionStatus', () => {
  it('open question → need_action', () => {
    expect(questionStatus(q({ id: 1, status: 'open' }))).toBe('need_action');
  });
  it('answered with approve → approved', () => {
    expect(questionStatus(q({ id: 1, status: 'answered', answer: 'approve' }))).toBe('approved');
  });
  it('answered with a revision reason → waiting', () => {
    expect(questionStatus(q({ id: 1, status: 'answered', answer: 'tone too formal' }))).toBe(
      'waiting',
    );
  });
  it('expired/cancelled → waiting', () => {
    expect(questionStatus(q({ id: 1, status: 'expired' }))).toBe('waiting');
    expect(questionStatus(q({ id: 1, status: 'cancelled' }))).toBe('waiting');
  });
});

describe('deriveRows', () => {
  it('builds one stable row per question, sorted by id, carrying metadata', () => {
    const rows = deriveRows([
      q({ id: 2, status: 'open', artifact_path: '.kortext/references/GROWTH.md', persona: '+growth-expert', phase: 'init' }),
      q({ id: 1, status: 'answered', answer: 'approve', artifact_path: '.kortext/references/LEGAL.md', persona: '+legal-expert' }),
    ]);
    expect(rows.map((r) => r.key)).toEqual(['q-1', 'q-2']);
    expect(rows[0]!.status).toBe('approved');
    expect(rows[0]!.filename).toBe('LEGAL.md');
    expect(rows[0]!.persona).toBe('+legal-expert');
    expect(rows[1]!.status).toBe('need_action');
    expect(rows[1]!.filename).toBe('GROWTH.md');
    expect(rows[1]!.phase).toBe('init');
  });
  it('empty list → no rows', () => {
    expect(deriveRows([])).toEqual([]);
  });
});

describe('docsPathFor', () => {
  it('maps a .kortext artifact path to the docs scope/file endpoint', () => {
    expect(docsPathFor('.kortext/references/LEGAL.md')).toBe('/api/docs/references/LEGAL.md');
    expect(docsPathFor('.kortext/memory/MEMORY.md')).toBe('/api/docs/memory/MEMORY.md');
  });
  it('handles paths without the leading .kortext segment', () => {
    expect(docsPathFor('references/PRD.md')).toBe('/api/docs/references/PRD.md');
  });
  it('returns null for unmappable paths', () => {
    expect(docsPathFor(null)).toBeNull();
    expect(docsPathFor('LEGAL.md')).toBeNull();
    expect(docsPathFor('.kortext/references/notes.txt')).toBeNull();
  });
});
