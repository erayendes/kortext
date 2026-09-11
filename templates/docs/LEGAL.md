---
status: uninitialized
author: +compliance-expert
approver: +prime
---

# Legal & Compliance Strategy

## Compliance Scope

- [Compliance targets based on the project's scope (KVKK, GDPR, CCPA, etc.)]

## Identified Risks

- [Risk description — e.g., user location data being kept exposed]

## Required Approvals & Consents

- [e.g., Privacy Policy consent at sign-up (required)]
- [How will cookie consent (Cookie Policy) be handled?]

## Data Lifecycle

> One row per personal-data field `DATABASE.md` marks. Retention and erasure are duties,
> not preferences — name the period and the mechanism, not an intention.

| Data | Lawful basis | Retention | Erasure — how and on whose request | Shared with |
| --- | --- | --- | --- | --- |
| `[table.column]` | [consent / contract / legitimate interest] | [e.g., 2 years after last login] | [the mechanism that actually deletes it] | [the processor from `STACK.md`, or none] |

## Required Notices

> The user-facing text this product owes its users. `CONTENT.md` writes each one in full —
> name what must be said and where, not the wording.

- **[Notice]** — [what it must disclose, on which surface, at which moment]

## Technical Integration Requests

- [e.g., The `password` and `national_id` columns in the database must be hashed.]

## Change Requests

- [What THIS document asks of another, one line per request: - `TARGET.md` — what must change there and why. It travels to that document when this one is approved. Lines that start with `from` are the other direction — what others asked of this document; the human decides them, kortext ticks them, leave them exactly as they are. Leave this section empty when nothing upstream needs to change]

## Questions for Prime

- [Anything prime must answer before this document can be relied on — leave this section empty when there is nothing]
