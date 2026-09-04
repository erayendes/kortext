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

## Revision Requests

- [One line per document, in the form: - [ ] `TARGET.md` — what must change there and why. Leave the box unticked; kortext ticks it and records the outcome underneath when the demand is settled. Leave this section empty when nothing upstream needs to change]

## Open Questions for prime

- [Anything prime must answer before this document can be relied on — leave this section empty when there is nothing]
