import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseWorkflowSteps } from '../server/docs.js';

const pkgRoot = process.cwd();
const workflow = (name: string) =>
  parseWorkflowSteps(readFileSync(join(pkgRoot, 'workflows', `${name}.md`), 'utf8'));

// The order is the argument: a step may only read what an earlier step wrote.
for (const name of ['new-project-analysis', 'existing-project-analysis']) {
  test(`${name}: no step reads a document written after it`, () => {
    const written = new Set(['foundation/BRD.md']);
    for (const step of workflow(name)) {
      for (const input of step.inputs) {
        assert.ok(written.has(input), `${step.output} reads ${input}, which is written later`);
      }
      written.add(step.output);
    }
  });
}

// A persona's declared upstream is the same list its step declares — otherwise
// the agent reads a document the chain never approved for it.
test('personas declare the same upstream the workflow gives them', () => {
  const steps = workflow('new-project-analysis');
  const byAuthor = new Map<string, typeof steps>();
  for (const step of steps) byAuthor.set(step.author, [...(byAuthor.get(step.author) ?? []), step]);
  for (const [author, owned] of byAuthor) {
    if (owned.length !== 1) continue; // ponytail: multi-document authors state their upstream per step, in prose
    const step = owned[0];
    const persona = readFileSync(join(pkgRoot, 'agents', `${author.slice(1)}.md`), 'utf8');
    const line = persona.split('\n').find((l) => l.startsWith('- **Upstream:**'));
    assert.ok(line, `${author}: no Upstream line`);
    const declared = [...line.matchAll(/`\.kortext\/(.+?)`/g)].map((m) => m[1]).sort();
    assert.deepEqual(declared, [...step.inputs].sort(), `${author} (${step.output})`);
  }
});
