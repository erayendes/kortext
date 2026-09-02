---
status: uninitialized
author: +security-engineer
approver: +architect
---

# Security Rules

## Security Overview

- [Summary and findings of the project's tech stack report]
- [Areas that need attention]

## Auth & Authorization Model

> The schema and the endpoints are built on this section. Name roles and permissions
> concretely — `DATABASE.md` turns them into tables and `API.md` applies them per endpoint.

- **Authentication:** [mechanism — e.g., email + password with TOTP, OAuth via provider, magic link]
- **Session / token:** [what is issued, where it is stored, how long it lives, how it is revoked]
- **Roles:**

| Role | Can do | Must never reach |
| --- | --- | --- |
| `[role]` | [what this role is allowed to do] | [what it must never see or change] |

- **Authorization rule:** [how a permission is decided at request time — ownership, role, tenant, or a combination]

## Secret Management

- **Where secrets live:** [e.g., the platform's secret store; never in the repo]
- **Never committed:** [the `.gitignore` entries that enforce it]
- **Rotation:** [who rotates what, and when]

## Data Storage & Logging

- **At rest / in transit:** [what is encrypted and with what]
- **Sensitive fields:** [what needs hashing, masking or tokenizing rather than plain storage]
- **Never logged:** [the values that must never reach a log line or an error report]

## Security Rules

- [Security rules to follow across the project]

## Vulnerability Findings

> On an existing project, what the code already gets wrong. On a new project this section
> is written after the first implementation — leave it empty until then.

| Risk Level | Finding | Description | Recommendation |
|---|---|---|---|
| [High/Med] | [e.g., XSS vulnerability] | [Which file, how it occurs] | [Suggested fix] |
| [Low] | [e.g., Outdated package] | [Outdated library] | [Update npm package] |

## Action Plan

- [What must be done during the analysis phase based on the findings]

## Revision Requests

- [`TARGET.md` — what must change there and why. One line per document. Leave this section empty when nothing upstream needs to change]

## Open Questions for prime

- [Anything prime must answer before this document can be relied on — leave this section empty when there is nothing]
