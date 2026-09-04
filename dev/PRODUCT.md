# Product

What Kortext is, who it is for, and how it speaks. Architecture lives in
[ARCHITECTURE.md](./ARCHITECTURE.md), the visual language in [DESIGN.md](./DESIGN.md).

## Register

product — calm, exact, not selling. A tool does not explain itself; it shows its work.

## Users

Someone turning an idea, or an existing codebase, into a document foundation their own agent can
safely work on top of. They already have an agent CLI installed and paid for (Claude Code, Codex,
Gemini CLI); what is missing is not the agent but the ground it stands on.

They sit at two ends, and both have the same problem:

- **The solo developer / technical founder.** Their agent can write code, but it re-invents the
  architecture every session; two weeks later the project does not remember its own decisions.
- **The non-coding product owner.** They know what they want and not how to say it. "Build this"
  is not enough — the agent has to read what things are first.

Shared context: one screen, a focused session, more time in the panel than in the terminal. The
critical decisions are the human's; the writing is the agent's.

Kortext deliberately sits **between the two**. A term is never shortened away, and never left
unexplained either: a thing is called by its name, met with one sentence where it first appears,
and not explained a second time. It neither lectures the reader who does not know what an agent
CLI is, nor shuts them out.

## What the product is for

Kortext is an **analysis brain**. It turns a brief — or existing code — into an approved document
foundation, by driving the user's own agent CLI headlessly, in dependency order. Every document
lands as a draft; the user approves it, leaves notes, requests a revision, or selects a line and
asks its author about it. The chain advances on approvals.

When every document is settled, Kortext **retires**. The documents become the project's contract
and `AGENTS.md` the handover constitution; the user's own agent writes the code. Kortext writes
no code, runs no tasks, calls no LLM API and holds no key.

Success looks like this: a session opened two weeks later does not rediscover the project — it
reads it. And no document was written by inventing something the brief never said.

## Brand personality

**Reliable, silent, sharp.** The tool that does not announce the work it is doing. Staying calm
on screen while a dozen steps run is a feature. No cheer, no friction, no "great!".

And one more thing: honesty. Kortext says when it does not know. If the brief is thin it produces
no documents and asks instead — and it shows that as the correct outcome, not as a failure.

## Anti-references

- **Jira / Confluence.** Heavy, nested, enterprise-bureaucratic. Three clicks and a dropdown per
  action; the status disappears under the process.
- **The typical SaaS landing page.** Purple gradients, "empower your team", generous whitespace
  covering a thin feature set. Performative rather than functional.
- **The "does everything by itself" autonomous agent promise.** Kortext tried it and dropped it:
  no orchestration, no worker pool, no automated development. The smaller the promise got, the
  more of it was true.

## Design principles

1. **Show, don't announce.** State is visible at a glance. No banner declaring things are fine;
   the layout itself says it.
2. **Silence is a feature.** Colour and motion earn their place. Nothing is decorative; every
   element is load-bearing.
3. **One decision at a time.** A document awaiting approval, a standing demand, a failed step —
   each surfaced individually, not buried in a list of everything.
4. **Density that breathes.** Tight enough to see the whole system on one screen, open enough to
   scan quickly.
5. **What the user does not know is explained, not hidden.** The agent CLI, `AGENTS.md`,
   `.kortext/` — all visible. But the interface never assumes anyone knows what a worktree is.

## Accessibility

WCAG AA at minimum. Reduced-motion support is required — the one animation is the "alive" pulse,
and it must be able to stop. Status indicators are colour-blind safe: colour never carries meaning
alone, always alongside a label (`writing`, `approved`, `change request`).
