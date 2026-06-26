import { describe, it, expect } from 'vitest';
import {
  buildSetupView,
  setupStepLabel,
  type PipelineInput,
} from '../server/orchestrator/setup-view.ts';
import type { WorkflowDefinition, WorkflowStep } from '../server/engine/workflow-parser.ts';
import type { RunStep, PendingQuestion } from '../server/db/schemas.ts';

function wfStep(p: Partial<WorkflowStep> & Pick<WorkflowStep, 'key' | 'index'>): WorkflowStep {
  return {
    phase: 'Product Analysis',
    persona: '+growth-expert',
    description: '',
    inputs: [],
    outputs: [],
    approver: null,
    reviewer: null,
    label: null,
    activity: null,
    ...p,
  };
}

function def(id: string, steps: WorkflowStep[]): WorkflowDefinition {
  return { id, title: id, startCommand: null, nextWorkflowId: null, steps, gates: [] };
}

function runStep(p: Partial<RunStep> & Pick<RunStep, 'id' | 'step_name' | 'status'>): RunStep {
  return {
    run_id: 1,
    step_index: 0,
    persona: '+growth-expert',
    started_at: null,
    ended_at: null,
    log_path: null,
    output_summary: null,
    error_message: null,
    usage_metadata: null,
    ...p,
  };
}

function question(p: Partial<PendingQuestion> & Pick<PendingQuestion, 'id'>): PendingQuestion {
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
    metadata: null,
    ...p,
  };
}

const analysisDef = def('new-project-analysis', [
  wfStep({ key: 'product-analysis.1', index: 0, persona: '+compliance-expert', outputs: ['.kortext/references/LEGAL.md'] }),
  wfStep({ key: 'product-analysis.2', index: 1, persona: '+growth-expert', outputs: ['.kortext/references/GROWTH.md'] }),
  wfStep({ key: 'product-analysis.3', index: 2, persona: '+product-manager', outputs: ['.kortext/foundation/PRD.md'] }),
]);

function pipe(over: Partial<PipelineInput>): PipelineInput {
  return {
    key: 'analysis',
    title: 'Analysis',
    workflowId: 'new-project-analysis',
    definition: analysisDef,
    run: null,
    steps: [],
    ...over,
  };
}

describe('setupStepLabel', () => {
  it('uses the markdown artifact filename when a step produces one', () => {
    expect(setupStepLabel(wfStep({ key: 'a.1', index: 0, outputs: ['.kortext/references/LEGAL.md'] }))).toBe(
      'LEGAL.md',
    );
  });

  it('falls back to the step description (trimmed) for non-doc steps', () => {
    expect(
      setupStepLabel(wfStep({ key: 'b.1', index: 0, outputs: ['.kortext/foundation/backlog.yaml'], description: 'Create the backlog' })),
    ).toBe('Create the backlog');
  });

  it('falls back to a yaml filename, then phase index, when there is no description', () => {
    expect(setupStepLabel(wfStep({ key: 'b.2', index: 1, outputs: ['.kortext/foundation/backlog.patch.yaml'] }))).toBe(
      'backlog.patch.yaml',
    );
    expect(setupStepLabel(wfStep({ key: 'c.1', index: 2, phase: 'Atama', outputs: [] }))).toBe('Atama 3');
  });
});

describe('buildSetupView — step statuses', () => {
  it('shows every definition step as queued before the run starts', () => {
    const view = buildSetupView([pipe({ run: null, steps: [] })], []);
    const steps = view.pipelines[0]!.steps;
    expect(steps.map((s) => s.label)).toEqual(['LEGAL.md', 'GROWTH.md', 'PRD.md']);
    expect(steps.every((s) => s.status === 'queued')).toBe(true);
    expect(view.pipelines[0]!.status).toBe('queued');
  });

  it('reflects live run_step statuses (done / running / queued)', () => {
    const view = buildSetupView(
      [
        pipe({
          run: { id: 1, status: 'running' },
          steps: [
            runStep({ id: 10, step_index: 0, step_name: 'whatever', status: 'succeeded' }),
            runStep({ id: 11, step_index: 1, step_name: 'long description, not the key', status: 'running' }),
          ],
        }),
      ],
      [],
    );
    const [legal, growth, prd] = view.pipelines[0]!.steps;
    expect(legal!.status).toBe('done');
    expect(growth!.status).toBe('running');
    expect(prd!.status).toBe('queued'); // no run_step yet
    expect(view.pipelines[0]!.status).toBe('running');
  });

  it('marks a step as review when an open gate guards it (by step_id)', () => {
    const view = buildSetupView(
      [
        pipe({
          run: { id: 1, status: 'awaiting_approval' },
          steps: [runStep({ id: 11, step_index: 1, step_name: 'long desc', status: 'succeeded' })],
        }),
      ],
      [question({ id: 5, step_id: 11, artifact_path: '.kortext/references/GROWTH.md', status: 'open' })],
    );
    const growth = view.pipelines[0]!.steps.find((s) => s.label === 'GROWTH.md')!;
    expect(growth.status).toBe('review');
    expect(growth.questionId).toBe(5);
    expect(growth.artifactPath).toBe('.kortext/references/GROWTH.md');
  });

  it('lights ONLY the gated step when several steps share an output artifact (step_id join)', () => {
    // Two planning-like steps both patch backlog.patch.yaml; the gate carries
    // the run_step id of the SECOND step. Only that step must show review — the
    // old artifact_path fallback lit every step sharing the artifact.
    const planning = def('planning-pipeline', [
      wfStep({ key: 'backlog.1', index: 0, persona: '+engineering-manager', outputs: ['.kortext/foundation/backlog.patch.yaml'] }),
      wfStep({ key: 'consolidation.1', index: 1, persona: '+operation-manager', outputs: ['.kortext/foundation/backlog.patch.yaml'] }),
    ]);
    const view = buildSetupView(
      [
        pipe({
          key: 'planning',
          title: 'Planning',
          workflowId: 'planning-pipeline',
          definition: planning,
          run: { id: 1, status: 'awaiting_approval' },
          steps: [
            runStep({ id: 20, step_index: 0, step_name: 'backlog', status: 'succeeded' }),
            runStep({ id: 21, step_index: 1, step_name: 'consolidation', status: 'succeeded' }),
          ],
        }),
      ],
      [question({ id: 9, step_id: 21, artifact_path: '.kortext/foundation/backlog.patch.yaml', status: 'open' })],
    );
    const steps = view.pipelines[0]!.steps;
    expect(steps[0]!.status).toBe('done'); // shared artifact, NOT the gated step
    expect(steps[1]!.status).toBe('review');
    expect(steps[1]!.questionId).toBe(9);
  });

  it('does NOT light any step for a step_id-less gate on a shared (non-unique) artifact', () => {
    const planning = def('planning-pipeline', [
      wfStep({ key: 'backlog.1', index: 0, outputs: ['.kortext/foundation/backlog.patch.yaml'] }),
      wfStep({ key: 'consolidation.1', index: 1, outputs: ['.kortext/foundation/backlog.patch.yaml'] }),
    ]);
    const view = buildSetupView(
      [pipe({ key: 'planning', title: 'Planning', workflowId: 'planning-pipeline', definition: planning, run: { id: 1, status: 'awaiting_approval' }, steps: [] })],
      [question({ id: 9, step_id: null, artifact_path: '.kortext/foundation/backlog.patch.yaml', status: 'open' })],
    );
    expect(view.pipelines[0]!.steps.some((s) => s.status === 'review')).toBe(false);
  });

  it('matches a gate by artifact path when step_id is absent', () => {
    const view = buildSetupView(
      [pipe({ run: { id: 1, status: 'awaiting_approval' }, steps: [] })],
      [question({ id: 7, step_id: null, artifact_path: '.kortext/references/LEGAL.md', status: 'open' })],
    );
    const legal = view.pipelines[0]!.steps.find((s) => s.label === 'LEGAL.md')!;
    expect(legal.status).toBe('review');
    expect(legal.questionId).toBe(7);
  });

  it('scopes step keys by pipeline so same-named steps across pipelines stay unique', () => {
    // analysis + planning both have a "Konsolidasyon" step → identical step.key.
    // The view must make them unique (pipeline-prefixed) or the drawer opens the
    // wrong one (UAT 2026-06-20: planning gate un-openable, analysis doc shown).
    const konsoStep = (id: string) => def(id, [wfStep({ key: 'konsolidasyon.1', index: 0, persona: '+operation-manager' })]);
    const view = buildSetupView(
      [
        pipe({ key: 'analysis', title: 'Analysis', workflowId: 'a', definition: konsoStep('a'), run: { id: 1, status: 'succeeded' } }),
        pipe({ key: 'planning', title: 'Planning', workflowId: 'p', definition: konsoStep('p'), run: { id: 2, status: 'running' } }),
      ],
      [],
    );
    const aKey = view.pipelines[0]!.steps[0]!.key;
    const pKey = view.pipelines[1]!.steps[0]!.key;
    expect(aKey).not.toBe(pKey);
  });

  it('labels a finished +prime-gated step "approved" but a gate-less step "done" (+ endedAt)', () => {
    const def2 = def('new-project-analysis', [
      wfStep({ key: 'a.1', index: 0, persona: '+compliance-expert', approver: '+prime', outputs: ['.kortext/references/LEGAL.md'] }),
      wfStep({ key: 'a.2', index: 1, persona: '+growth-expert', approver: null, outputs: ['.kortext/references/GROWTH.md'] }),
    ]);
    const view = buildSetupView(
      [
        pipe({
          definition: def2,
          run: { id: 1, status: 'running' },
          steps: [
            runStep({ id: 10, step_index: 0, step_name: 'legal', status: 'succeeded', started_at: 1000, ended_at: 4000 }),
            runStep({ id: 11, step_index: 1, step_name: 'growth', status: 'succeeded', started_at: 5000, ended_at: 5500 }),
          ],
        }),
      ],
      [],
    );
    const [legal, growth] = view.pipelines[0]!.steps;
    expect(legal!.status).toBe('approved'); // had a +prime gate
    expect(legal!.endedAt).toBe(4000);
    expect(growth!.status).toBe('done'); // gate-less
  });

  it('treats every step of a succeeded run as done even without run_step rows', () => {
    const view = buildSetupView([pipe({ run: { id: 1, status: 'succeeded' }, steps: [] })], []);
    expect(view.pipelines[0]!.steps.every((s) => s.status === 'done')).toBe(true);
    expect(view.pipelines[0]!.status).toBe('done');
  });
});

describe('buildSetupView — phase across pipelines', () => {
  const planning = pipe({ key: 'planning', title: 'Planning', workflowId: 'planning-pipeline', definition: def('planning-pipeline', [wfStep({ key: 'backlog.1', index: 0 })]) });

  it('phase = the first not-done pipeline', () => {
    const view = buildSetupView(
      [
        pipe({ run: { id: 1, status: 'succeeded' } }), // analysis done
        { ...planning, run: { id: 2, status: 'running' }, steps: [] }, // planning running
      ],
      [],
    );
    expect(view.phase).toBe('planning');
  });

  it('phase = development once all pipelines are done (v1.0: analysis + planning)', () => {
    const view = buildSetupView(
      [
        pipe({ run: { id: 1, status: 'succeeded' } }),
        { ...planning, run: { id: 2, status: 'succeeded' }, steps: [] },
      ],
      [],
    );
    expect(view.phase).toBe('development');
  });
});
