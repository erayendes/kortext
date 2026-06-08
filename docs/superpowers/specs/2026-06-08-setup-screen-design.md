# Setup Screen — Design

**Date:** 2026-06-08
**Status:** Approved (design); pending implementation plan
**Owner:** Eray (product) / Claude (code)

## Problem

The current `initializing.tsx` only covers one slice of project setup: reviewing
Foundation/References artefacts (LEGAL.md, PRD.md, etc.). It has no awareness of
the other phases a project must complete before the development cycle begins:

- Backlog creation and item-relationship enrichment (Planning)
- Environment configuration (CI provider, cloud, auth stack)

There is also no lifecycle gating — the screen is reachable via `/initializing`
but does not auto-show during setup or auto-route to the dashboard when done. The
sidebar is missing entirely, leaving the user with no map of the overall setup journey.

## Scope

This spec covers the **entire pre-development-cycle UI**: everything a user sees from
the moment onboarding submits until the dashboard unlocks. Four phases, one screen.

```
Onboarding wizard → Setup Screen → Dashboard
                    ↑ this spec
```

Phases covered (in dependency order; some run in parallel per the engine's DAG):
1. **Analysis** — Foundation/References artefacts produced by specialist agents
2. **Planning** — Backlog creation and relationship enrichment by operation-manager
3. **Environment Setup** — CI, cloud, auth, and other configuration questions

## Decisions (locked)

| Question | Decision | Reason |
|---|---|---|
| Sidebar role | Navigation + status | Clickable when artefact is ready; read-only otherwise |
| Planning approval | None — fully autonomous | 70+ items; Prime reviews in dashboard if needed |
| Env setup UX | Inline chip questions in log stream | Keeps user in "observer" flow; no panel switch |
| Overall layout | Sidebar + swappable main panel | Matches mental model; persistent map across phases |
| Dashboard transition | Automatic | System routes when all phases complete |

## Layout

Two fixed regions:

```
┌──────────────┬────────────────────────────────────────┐
│              │                                        │
│   Sidebar    │           Main Panel                   │
│   (172px)    │   (log view  OR  review panel)         │
│              │                                        │
└──────────────┴────────────────────────────────────────┘
```

- **Sidebar**: always visible; never collapses.
- **Main panel**: default = Activity Log. When an artefact is opened (via sidebar
  click or `[← REVIEW]` link) the main panel swaps to the Review Panel. Closing the
  review returns to the log. The swap is not a route change — it is local component
  state (`activeReview: InitRow | null`).

## Sidebar

Three phase sections (ANALYSIS · PLANNING · ENVIRONMENT SETUP), each with a heading
and a list of items.

### Item states

| State | Indicator | Clickable | Behaviour |
|---|---|---|---|
| Not yet produced | `○` grey | No | — |
| In progress | `◌` spinning | No | — |
| Ready — awaiting approval | `●` purple | **Yes** | Opens review panel |
| Approved | `✓` green | Yes (read-only) | Opens review in read-only mode |
| Need action (env) | `⚠` amber | No — action is in log | Highlights pending env question |
| Done (planning step) | `✓` green | No | — |

### Section contents

**ANALYSIS** — one item per artefact path emitted by the `questions` API
(`artifact_path`, e.g. `LEGAL.md`, `GROWTH.md`, `PRD.md`). Items are ordered by
question id (same order as `deriveRows` in `initializing.tsx`).

**PLANNING** — static step labels reflecting the operation-manager's known backlog
phases: *Creating items*, *Relationship enrichment*. These are read-only progress
indicators; no questions are raised.

**ENVIRONMENT SETUP** — one item "Config" with an `⚠` badge when an unanswered
env question is pending in the log. Turns `✓` once all env questions are answered.

## Activity Log (main panel — default)

Real-time feed of agent actions, polled from the existing activity/pipeline endpoint.

Format per row:
```
HH:MM  – +persona-name:  action description  (duration)
```

### Inline `[← REVIEW]` link

When an artefact is ready for Prime's approval, the log line appends a tappable
`[← REVIEW]` link. Clicking it is equivalent to clicking the sidebar item —
opens the review panel.

### Inline env questions

When the env-agent needs user input it appends a question row followed by a chip row:
```
13:00  – +env-agent:  CI provider seçin:
         [GitHub Actions]  [GitLab CI]  [CircleCI]
```
Clicking a chip records the answer and renders the next question. No panel switch.
This keeps the user in observer mode rather than context-switching to a form.

## Review Panel (main panel — artefact open)

Opened by: sidebar item click (ready/approved) or `[← REVIEW]` log link.

```
┌─ Header ─────────────────────────────────────────────┐
│ [avatar]  LEGAL.md  +legal-expert · analysis  [Need action]  [✕]
├─ Body (scrollable) ───────────────────────────────────┤
│  Rendered markdown content                            │
│  ...                                                  │
│  YANIT BEKLENİYOR...                                  │
│    1. Agent's open question to Prime                  │
│    2. ...                                             │
├─ Footer ──────────────────────────────────────────────┤
│  [✓ Onayla]  [↩ Revize]  [? Açıklama iste]  [Yanıtla]│
└───────────────────────────────────────────────────────┘
```

Closing the panel (✕) returns the main panel to the Activity Log.

### Chat overlay

Opened by: `[Açıklama iste]` or `[Yanıtla]` footer button.

A panel slides in from the right, overlapping the right portion of the document body.
The document remains partially visible on the left.

```
┌─ Document (narrowed) ──┬─ Chat overlay (340px) ──────┐
│                         │  [Selected line context]    │
│ document text...        │                             │
│                         │  Prime: user's question     │
│ [highlighted selection] │  Model: AI response         │
│                         │                             │
│                         │  [prompt input]  [Send]     │
└─────────────────────────┴─────────────────────────────┘
```

The "selected line" context is the line the user highlighted (or the most recently
visible `YANIT BEKLENİYOR` question if nothing is selected). Prime's question
is pre-populated from the button context (e.g. "Açıklama iste" pre-fills a
clarification prompt). Closing the chat returns to the full review panel.

**Backend for chat:** A new endpoint `POST /api/prime/chat` accepts
`{ context: string, question: string }` and returns `{ answer: string }` via
a single executor call (same executor already configured for the project). This
is a synchronous Prime-facing assistant call — no question/run records are
created. Response is streamed or returned in one shot.

## Dashboard Transition

**Completion signal:** `GET /api/blueprint/status` already returns a `phase` field.
A new phase value `"development"` (or equivalent) is emitted by the engine when all
setup phases complete. The UI polls this endpoint (~3s interval) and auto-navigates
when the phase transitions out of `"init"`.

When complete:
- The log appends: `system: Setup tamamlandı — dashboard açılıyor…`
- The router auto-navigates to the dashboard (existing `router.tsx` guard logic).

No manual "proceed" button is required. This matches the existing `autoStartPendingAnalysis`
pattern — the system drives state, the UI follows.

## Affected files (expected)

| File | Change |
|---|---|
| `src/routes/initializing.tsx` | Major revision — add sidebar, env section, inline chips, chat overlay |
| `src/components/v6/AnnotatableDoc.tsx` | May need line-selection support for chat context |
| `server/routes/questions.ts` | Possibly expose env-question type so UI can render chips vs text |
| `src/router.tsx` | Lifecycle gating: auto-show setup screen during init phase, auto-route to dashboard on completion |

## Out of scope

- Dashboard itself (separate spec)
- Onboarding wizard changes (already shipped)
- Backlog item UI within setup (reviewed in dashboard after dev cycle starts)
- Multi-model executor selection per persona (separate feature, noted in HANDOVER)
