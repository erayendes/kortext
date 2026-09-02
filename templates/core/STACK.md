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

## Architecture Pattern

- [e.g., Microservices, monolith, or serverless? Which design pattern (MVC, etc.) will be used?]

## Tooling & Prerequisites

- **Package Manager:** [e.g., npm, yarn, pnpm]
- **Environment:** [e.g., Docker Desktop, Node v20+]
- **Testing:** [e.g., Jest, Cypress, Playwright]
- **Tools:** [e.g., Postman, Antigravity, etc.]
- **MCP's:** [e.g., Vercel MCP, Firebase MCP]

## Infrastructure & Deployment (CI/CD)

- **Cloud Provider:** [e.g., AWS, Vercel, Google Cloud]
- **CI/CD Platform:** [e.g., GitHub Actions, GitLab CI]
- **Containerization:** [e.g., Docker]

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

- [`TARGET.md` — what must change there and why. One line per document. Leave this section empty when nothing upstream needs to change]

## Open Questions for prime

- [Anything prime must answer before this document can be relied on — leave this section empty when there is nothing]
