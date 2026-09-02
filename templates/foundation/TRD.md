---
status: uninitialized
author: +architect
approver: +prime
---

# Technical Requirements Document (TRD)


## Technical Goals

- **Product Goal:** [Reference to the Product Requirements Document]
- **Engineering Goal:** [The system's technical targets, e.g., must handle 1k requests per second]

## System Architecture & Boundaries

- **Client ↔ Server:** [Which interfaces will be used?]
- **Data Flow:** [What route does the data travel?]
- **Integrations:** [Which external services does it talk to?]

## Component Details

- **Frontend Requirements:** [e.g., SSR required, bundle size max 500kb]
- **Backend Requirements:** [e.g., a job queue must be used, caching must be enabled]
- **Data Layer:** [e.g., PostgreSQL 16, Redis 7.x]

## Non-functional Requirements

- **Performance:** [latency budget, throughput target]
- **Reliability:** [uptime, RTO/RPO]
- **Security:** [auth model, encryption requirements]
- **Observability:** [logging, metrics, tracing]

## Decisions

> The engineering decisions this report merges, each with the document it was made in.

- **[Decision]** — [what was chosen, and the alternative that lost] (`SOURCE.md`)

## Compliance Rulings & Conflicts

> Where `LEGAL.md` rules against the design, the contradiction is settled here: either the
> design changes and this line says how, or it stands and this line names the residual risk
> and who accepted it. An unresolved ruling is an open question, not a silent omission.

| Ruling | Source | Resolution | Residual risk |
| --- | --- | --- | --- |
| [what compliance requires] | `LEGAL.md` | [what changed, or why it stands] | [none / what remains] |

## Technical Constraints & Risks

- **Bottleneck:** [Where could the system slow down?]
- **Risk:** [Which risks, how likely, and what impact?]
- **Risk Mitigation:** [How will we manage this risk?]

## Implementation Plan

- [High-level implementation steps — fine-grained detail is worked out per task]

## Revision Requests

- [`TARGET.md` — what must change there and why. One line per document. Leave this section empty when nothing upstream needs to change]

## Open Questions for prime

- [Open questions awaiting a decision — escalated to `prime` or the relevant gate]
