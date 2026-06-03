# Product

## Register

product

## Users

Technical founders, solo engineers, and small engineering leads who want AI agent teams to run software projects autonomously with minimal intervention. They sit at a real-time dashboard, approve critical gates, and let agents handle the rest. Context: focused work session, usually one monitor, high trust in the tool once it proves itself.

## Product Purpose

Kortext is an autonomous AI agent runtime. You write a blueprint, flip it to approved, and the agents — backed by a TypeScript runtime, SQLite state store, and git worktrees — handle analysis, planning, development, and testing end-to-end. The dashboard surfaces what's running, what needs a human decision, and what shipped. Success looks like: zero surprises, every approval prompt answered in under 30 seconds, no manual task coordination needed.

## Brand Personality

Reliable, Silent, Sharp. The tool that does the work without making noise about it. Control-room confidence — things are under control, even when a lot is happening. No cheerfulness, no friction.

## Anti-references

- **Jira / Confluence**: Heavy, nested, enterprise-bureaucratic. Every action requires three clicks and a dropdown. Status is obscured by process.
- **Typical SaaS landing page aesthetic**: Purple gradients, "empower your team", generous whitespace hiding shallow feature sets. Performative instead of functional.

## Design Principles

1. **Show, don't announce.** Status is visible at a glance. No banners proclaiming things are fine; the layout itself communicates health.
2. **Silence is a feature.** Colour and motion earn their place. Nothing decorative; every element is load-bearing.
3. **Expert confidence.** The interface assumes the user knows what a worktree is. No onboarding hand-holding on core concepts; complexity is surfaced directly, not hidden behind abstraction.
4. **Density with breathing room.** Compact enough to see the whole system at once; generous enough that scanning is fast. Linear-class information density, not Grafana-class chaos.
5. **One decision at a time.** Approval prompts, blocked items, and gate failures are surfaced clearly and individually — not buried in a list of everything.

## Accessibility & Inclusion

WCAG AA minimum. Reduced motion support required (agents run 24/7; some users monitor on large displays in dark rooms — flicker and animation must be dimmable). Color-blind safe status indicators (never color-only; always paired with label or icon).
