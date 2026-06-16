/**
 * Kortext › Workflows (engine scope) — GET /api/workflows + /api/workflows/:id.
 *
 * Read-only workflow viewer (`.kpane[data-k=workflows]` in wireframe-v6-hifi.html).
 * Workflows aren't markdown files — they're parsed step/gate definitions — so
 * `loadBody` fetches the detail and formats it into markdown the shared
 * AnnotatableDoc viewer can render. Package-defined → read-only.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiGet } from '../../lib/api.ts';
import type { WorkflowDetail, WorkflowSummary } from '../../lib/api-types.ts';
import { FileBrowser, type FBItem } from '../../components/v6/FileBrowser.tsx';

type WorkflowsResponse = { workflows: WorkflowSummary[] };
type WorkflowDetailResponse = { workflow: WorkflowDetail };

/** Render a parsed workflow as viewer markdown (steps + gates). */
function toMarkdown(w: WorkflowDetail): string {
  const out: string[] = [`# ${w.title}`, ''];
  if (w.startCommand) out.push(`> Start command: \`${w.startCommand}\``, '');
  if (w.nextWorkflowId) out.push(`> Next workflow: \`${w.nextWorkflowId}\``, '');

  out.push('## Steps', '');
  for (const s of w.steps) {
    out.push(`### ${s.index + 1}. ${s.phase}${s.persona ? ` — \`${s.persona}\`` : ''}`);
    if (s.description) out.push(s.description);
    if (s.inputs.length) out.push(`- **Inputs:** ${s.inputs.join(', ')}`);
    if (s.outputs.length) out.push(`- **Outputs:** ${s.outputs.join(', ')}`);
    if (s.reviewer) out.push(`- **Reviewer:** \`${s.reviewer}\``);
    if (s.approver) out.push(`- **Approver:** \`${s.approver}\``);
    out.push('');
  }

  if (w.gates.length) {
    out.push('## Gates', '');
    for (const g of w.gates) {
      out.push(`### ${g.phase} — after step ${g.afterStepIndex + 1}`);
      if (g.body) out.push(g.body);
      if (g.approver) out.push(`- **Approver:** \`${g.approver}\``);
      out.push('');
    }
  }

  return out.join('\n');
}

export function WorkflowsRoute() {
  const [workflows, setWorkflows] = useState<WorkflowSummary[]>([]);

  useEffect(() => {
    let alive = true;
    apiGet<WorkflowsResponse>('/api/workflows')
      .then((r) => alive && setWorkflows(r.workflows))
      .catch(() => alive && setWorkflows([]));
    return () => {
      alive = false;
    };
  }, []);

  const items: FBItem[] = useMemo(
    () =>
      workflows.map((w) => ({
        id: w.id,
        name: w.title,
        meta: `${w.stepCount} step${w.stepCount === 1 ? '' : 's'} · ${w.gateCount} gate${w.gateCount === 1 ? '' : 's'}`,
        status: 'ro' as const,
      })),
    [workflows],
  );

  const loadBody = useCallback(async (id: string) => {
    const r = await apiGet<WorkflowDetailResponse>(`/api/workflows/${encodeURIComponent(id)}`);
    return toMarkdown(r.workflow);
  }, []);

  return (
    <FileBrowser
      title="Workflows"
      sub="The step-by-step workflows the engine runs"
      items={items}
      loadBody={loadBody}
      mode="ro"
      hideListMeta
    />
  );
}
