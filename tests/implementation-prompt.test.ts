import { describe, expect, it } from 'vitest';
import type { ExecutorContext } from '../server/engine/executor.ts';
import type { WorkflowStep } from '../server/engine/workflow-parser.ts';
import { buildCodexPrompt } from '../server/engine/executors/codex-cli-executor.ts';
import { buildUserPrompt } from '../server/engine/executors/claude-cli-executor.ts';
import { buildItemContext } from '../server/orchestrator/run-item.ts';

// ---------------------------------------------------------------------------
// UAT #10L — codex `exec` read files and exited 0 without writing ANY code in
// the implementation step, every gate failed ("no code to review") → churn.
// Root cause was the PROMPT, not the sandbox (cwd=worktree and
// `--sandbox workspace-write` were already correct):
//   1. The codex prompt ended with bare metadata — NO imperative "now
//      implement / write files" mandate (antigravity's prompt has one and it
//      wrote code; pure executor variance).
//   2. NO executor ever received the ITEM being implemented (title /
//      description / acceptance criteria) — the dev-cycle step text says
//      "implement the item assigned to you" without saying which item.
// ---------------------------------------------------------------------------

const step: WorkflowStep = {
  key: 'implementation.1',
  index: 0,
  phase: 'Implementation',
  persona: '+assignee',
  description: 'Implement the assigned item in the worktree.',
  inputs: [],
  outputs: ['item-in-test'],
  approver: null,
  reviewer: null,
};

const ctx: ExecutorContext = {
  workflowId: 'development-cycle',
  runId: 1,
  runStepId: 1,
  worktreePath: '/tmp/wt',
  signal: new AbortController().signal,
};

describe('buildItemContext (UAT #10L — the item finally reaches the prompt)', () => {
  it('renders id, title, description and acceptance criteria', () => {
    const block = buildItemContext({
      id: 'NOT-001',
      type: 'task',
      title: 'Landing page',
      body_md: 'Build the landing page per DESIGN.md.',
      frontmatter: { acceptance_criteria: ['hero renders', 'responsive at 380px'] },
    });
    expect(block).toContain('NOT-001');
    expect(block).toContain('Landing page');
    expect(block).toContain('Build the landing page per DESIGN.md.');
    expect(block).toContain('hero renders');
    expect(block).toContain('responsive at 380px');
  });

  it('tolerates missing description/criteria', () => {
    const block = buildItemContext({
      id: 'NOT-002',
      type: 'bug',
      title: 'Fix header',
      body_md: '',
      frontmatter: {},
    });
    expect(block).toContain('NOT-002');
    expect(block).toContain('Fix header');
  });
});

describe('buildCodexPrompt (UAT #10L — "uygula", not "keşfet")', () => {
  it('carries the work item context when the run is an item build', () => {
    const prompt = buildCodexPrompt(step, { ...ctx, itemContext: 'Item: NOT-001 — Landing page' }, 'persona');
    expect(prompt).toContain('NOT-001 — Landing page');
  });

  it('ends with an imperative implementation mandate, not bare metadata', () => {
    const prompt = buildCodexPrompt(step, ctx, 'persona');
    // The mandate that was missing: codex must WRITE files, reading alone is failure.
    expect(prompt).toMatch(/Now perform the Task/i);
    expect(prompt).toMatch(/creat\w+ and\/or modif\w+ real files/i);
    expect(prompt).toMatch(/Reading files alone is NOT/i);
  });

  it('shows the worktree CWD so file writes land in the right place', () => {
    const prompt = buildCodexPrompt(step, ctx, 'persona');
    expect(prompt).toContain('CWD:      /tmp/wt');
  });

  it('folds in revise feedback on a bounced re-code (gate findings reach codex)', () => {
    const prompt = buildCodexPrompt(step, { ...ctx, reviseFeedback: 'design_review: missing alt text' }, 'persona');
    expect(prompt).toContain('design_review: missing alt text');
  });
});

describe('claude buildUserPrompt — item context parity', () => {
  it('carries the work item context when set', () => {
    const prompt = buildUserPrompt(step, { ...ctx, itemContext: 'Item: NOT-001 — Landing page' });
    expect(prompt).toContain('NOT-001 — Landing page');
  });
});
