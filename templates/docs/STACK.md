---
status: uninitialized
author: +architect
approver: +prime
---

# Tech Stack & Infrastructure

## Core Technologies

- **Frontend:** [Language, framework, version — e.g., TypeScript, React 18, Next.js 14, Kotlin, SwiftUI]
- **Backend:** [Language, framework, version — e.g., Node.js 20, NestJS]
- **Database:** [Database, version — e.g., PostgreSQL 16, Redis]

## Tooling & Prerequisites

- **Package Manager:** [e.g., npm, yarn, pnpm]
- **Environment:** [e.g., Docker Desktop, Node v20+]
- **Containerization:** [e.g., Docker — the local runtime, not the deployment target]
- **Testing:** [e.g., Jest, Cypress, Playwright]
- **Tools:** [e.g., Postman, Antigravity, etc.]
- **MCP's:** [e.g., Vercel MCP, Firebase MCP]

## Prerequisites from prime

> Everything the stack needs that only a person can supply. The planning flow turns each
> row into an `assignee: prime` task and blocks whatever depends on it, so a missing row
> becomes work nobody scheduled.

| Need | Why the stack needs it | Blocks |
| --- | --- | --- |
| `[e.g., an Apple Developer account]` | [what cannot be built without it] | [what waits on it] |
| `[e.g., a physical test device]` | [what cannot be verified without it] | [what waits on it] |

## Third-Party Services & Integrations

> Every row here is a processor `LEGAL.md` will rule on. Name the region it runs in and
> say plainly whether it sees user data — a service with no region named cannot be judged.

| Service | Purpose | Region | Sees user data |
| --- | --- | --- | --- |
| `[Auth0]` | Auth | `[eu]` | [yes — email, name] |
| `[Stripe]` | Payments | `[us]` | [yes — name, billing address] |
| `[Cloudflare]` | CDN | `[global]` | [no] |

## Security & Policies

- [How sensitive data is stored, custom gitignore rules, etc.]
- For security rules, see `.kortext/SECURITY.md`.

## Revision Requests

- [One line per document, in the form: - [ ] `TARGET.md` — what must change there and why. Leave the box unticked; kortext ticks it and records the outcome underneath when the demand is settled. Leave this section empty when nothing upstream needs to change]

## Open Questions for prime

- [Anything prime must answer before this document can be relied on — leave this section empty when there is nothing]
