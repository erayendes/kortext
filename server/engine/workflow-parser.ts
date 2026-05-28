import { readFileSync } from 'node:fs';
import { basename } from 'node:path';

/**
 * Workflow markdown parser.
 *
 * Input format (see workflows/*.md):
 *
 *   # Title (`!start <id>`)
 *
 *   ## Phase Name
 *
 *   1. **+persona:** description text.
 *      - Inputs: path/a.md, path/b.md
 *      - Outputs: path/c.md
 *      - Approver: +persona
 *      - Reviewer: +persona
 *
 *   > [!NOTE] RAPOR HAZIR
 *   > +prime, ... !approve/reject xyz
 *
 * Output:
 *   - WorkflowDefinition: { id, title, startCommand, steps[], gates[] }
 *   - Steps are NOT resolved into a DAG here; that lives in dag.ts.
 */

export type WorkflowStep = {
  /** Unique within the workflow: phase-slug.step-index, e.g. 'product-analysis.2' */
  key: string;
  /** Position within the workflow, useful for deterministic ordering. */
  index: number;
  /** Phase name (## heading) the step lives under. */
  phase: string;
  /** Persona handle, e.g. '+product-manager'. Null when the heading number has no persona. */
  persona: string | null;
  /** Free-text description (everything after the persona handle on the bullet line). */
  description: string;
  /** Files listed under `- Inputs:` */
  inputs: string[];
  /** Files listed under `- Outputs:` */
  outputs: string[];
  /** Persona under `- Approver:` */
  approver: string | null;
  /** Persona under `- Reviewer:` */
  reviewer: string | null;
};

export type ApprovalGate = {
  /** Phase the gate appears under. */
  phase: string;
  /** Step index after which the gate fires (0-based, refers to step.index). */
  afterStepIndex: number;
  /** Raw NOTE block body, useful for surfacing to the dashboard. */
  body: string;
  /** Approver mentioned in the body (usually +prime). */
  approver: string | null;
};

export type WorkflowDefinition = {
  /** Filename stem (e.g. 'new-project-analysis'). */
  id: string;
  /** First H1 in the file. */
  title: string;
  /** Shell-style start command captured from `!start <name>` in the title. */
  startCommand: string | null;
  /** Optional `Sonraki akış:` reference (next workflow id or filename). */
  nextWorkflowId: string | null;
  steps: WorkflowStep[];
  gates: ApprovalGate[];
};

const PERSONA_RE = /^\*\*(\+[\w-]+):\*\*\s*(.*)$/;
const PHASE_HEADING_RE = /^##\s+(.+?)\s*$/;
const STEP_BULLET_RE = /^(\d+)\.\s+(.*)$/;
const SUB_BULLET_RE = /^\s*[-*]\s+([A-Za-z]+):\s*(.+?)\s*$/;
const NOTE_OPEN_RE = /^>\s*\[!(NOTE|TIP|INFO|WARNING)\]/i;
const NEXT_WORKFLOW_RE = /\*\*Sonraki akış[^:]*:\*\*\s*(?:onay sonrası\s+)?`([^`]+)`/i;
const START_COMMAND_RE = /`!start\s+([\w-]+)`/i;

function slugifyPhase(phase: string): string {
  return phase
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-');
}

function splitList(value: string): string[] {
  return value
    .replace(/`/g, '')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .map(normalizeWorkflowPath);
}

/**
 * Workflow files live at `<paket-kökü>/workflows/<id>.md` (v3.1: global
 * runtime) and author paths relative to that location — e.g.
 * `../.kortext/references/foo.md` (or legacy `../workspace/foo.md` until
 * Faz 13 rewrites the workflow content). The engine executes steps with
 * cwd = project root (or a worktree of it), so we strip exactly one
 * leading `../` per entry so the path resolves correctly under cwd.
 * Non-path entries (free-text "Inputs: existing codebase…") are unaffected
 * because they don't start with `../`.
 */
function normalizeWorkflowPath(raw: string): string {
  if (raw.startsWith('../')) return raw.slice(3);
  return raw;
}

export function parseWorkflowMarkdown(source: string, fileId: string): WorkflowDefinition {
  const lines = source.split('\n');

  let title = fileId;
  let startCommand: string | null = null;
  let nextWorkflowId: string | null = null;
  const steps: WorkflowStep[] = [];
  const gates: ApprovalGate[] = [];

  let currentPhase = '__preamble__';
  let stepCounter = 0;
  let stepByPhaseCount = new Map<string, number>();

  // Cursor state while consuming a step's sub-bullets.
  let activeStep: WorkflowStep | null = null;

  // Faz 13: gates are derived directly from `approver: +prime` sub-bullets
  // — every step that names +prime as approver opens a runtime gate after
  // it. The previous `> [!NOTE] RAPOR HAZIR` callout convention is gone
  // (cosmetic markdown noise that AI agents had to skip); semantic intent
  // already lives in the sub-bullet.
  const flushStep = () => {
    if (activeStep) {
      steps.push(activeStep);
      if (activeStep.approver === '+prime') {
        gates.push({
          phase: activeStep.phase === '__preamble__' ? '(preamble)' : activeStep.phase,
          afterStepIndex: activeStep.index,
          body: `${activeStep.persona ?? '(no persona)'} step in ${activeStep.phase}: ${activeStep.description}`,
          approver: '+prime',
        });
      }
      activeStep = null;
    }
  };

  const noteCollect = (startIdx: number): { body: string; consumedTo: number } => {
    const bodyLines: string[] = [];
    let i = startIdx;
    while (i < lines.length) {
      const line = lines[i];
      if (line === undefined) break;
      if (!line.startsWith('>')) break;
      bodyLines.push(line.replace(/^>\s?/, ''));
      i += 1;
    }
    return { body: bodyLines.join('\n').trim(), consumedTo: i - 1 };
  };

  for (let i = 0; i < lines.length; i += 1) {
    const raw = lines[i] ?? '';
    const line = raw.replace(/\r$/, '');

    if (i === 0 || (title === fileId && line.startsWith('# '))) {
      const h1 = line.match(/^#\s+(.+?)\s*$/);
      if (h1?.[1]) {
        title = h1[1].replace(/`[^`]*`/g, '').trim();
        const cmd = line.match(START_COMMAND_RE);
        if (cmd?.[1]) startCommand = cmd[1];
      }
    }

    const phaseMatch = line.match(PHASE_HEADING_RE);
    if (phaseMatch?.[1]) {
      flushStep();
      currentPhase = phaseMatch[1].trim();
      continue;
    }

    // Callout blocks are still consumed (so they don't bleed into the next
    // step) but no longer produce gates — see flushStep() above for the new
    // approver-based gate derivation.
    const noteMatch = line.match(NOTE_OPEN_RE);
    if (noteMatch) {
      flushStep();
      const block = noteCollect(i);
      i = block.consumedTo;
      continue;
    }

    if (!nextWorkflowId) {
      const nextMatch = line.match(NEXT_WORKFLOW_RE);
      if (nextMatch?.[1]) {
        nextWorkflowId = nextMatch[1].replace(/\.md$/, '').replace(/^.*\//, '');
      }
    }

    const stepMatch = line.match(STEP_BULLET_RE);
    if (stepMatch?.[2]) {
      flushStep();
      const inlineRest = stepMatch[2].trim();
      const personaMatch = inlineRest.match(PERSONA_RE);
      const persona = personaMatch?.[1] ?? null;
      const description = personaMatch?.[2]?.trim() ?? inlineRest;

      const phaseCount = (stepByPhaseCount.get(currentPhase) ?? 0) + 1;
      stepByPhaseCount.set(currentPhase, phaseCount);
      const key = `${slugifyPhase(currentPhase)}.${phaseCount}`;

      activeStep = {
        key,
        index: stepCounter,
        phase: currentPhase,
        persona,
        description,
        inputs: [],
        outputs: [],
        approver: null,
        reviewer: null,
      };
      stepCounter += 1;
      continue;
    }

    if (activeStep) {
      const sub = line.match(SUB_BULLET_RE);
      if (sub?.[1] && sub[2]) {
        const label = sub[1].toLowerCase();
        const value = sub[2];
        if (label === 'inputs') activeStep.inputs = splitList(value);
        else if (label === 'outputs') activeStep.outputs = splitList(value);
        else if (label === 'approver') activeStep.approver = value.trim().replace(/[`*]/g, '');
        else if (label === 'reviewer') activeStep.reviewer = value.trim().replace(/[`*]/g, '');
        continue;
      }
      // Blank line or unrelated content ends step body.
      if (line.trim() === '') {
        // Don't flush yet — sub-bullets may continue after blank lines in some files.
        continue;
      }
    }
  }
  flushStep();

  return {
    id: fileId,
    title,
    startCommand,
    nextWorkflowId,
    steps,
    gates,
  };
}

export function loadWorkflowFromFile(filePath: string): WorkflowDefinition {
  const source = readFileSync(filePath, 'utf8');
  const fileId = basename(filePath).replace(/\.md$/, '');
  return parseWorkflowMarkdown(source, fileId);
}
