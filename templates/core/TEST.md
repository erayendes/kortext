---
status: uninitialized
author: +qa-engineer
approver: +architect
---

# Testing Strategy

## Testing Scope & Approach

- **Scope:** [What will be tested, and what will (for now) not be tested?]
- **Main Approach:** [e.g., Will TDD be applied? Will shift-left testing be practiced?]

## Tools & Frameworks

- **Unit Testing:** [e.g., Jest, Vitest]
- **Integration/E2E Testing:** [e.g., Cypress, Playwright]
- **Load/Performance Testing:** [e.g., k6, JMeter]

## Test Layers

### Unit Tests

- **Responsibility:** Developers (+backend-developer / +frontend-developer)
- **Rule:** Every function is tested in isolation (coverage target: `80%`)

### Integration Tests

- **Responsibility:** Developers & +qa-engineer
- **Rule:** API endpoints and database communication are tested.

### End-to-End (E2E) & Smoke Tests

- **Responsibility:** +qa-engineer
- **Rule:** The user's main flows (login, add to cart, checkout) must pass before anything ships to production.

## CI/CD Integration (Pipeline Rules)

- Outcome: `[Merge is blocked when tests fail]`
- Outcome: `[PR is rejected when coverage drops below 80%]`

## Compliance & Risk Gates

> A gate here proves an obligation `LEGAL.md` states or a risk `TRD.md` registers.
> Each row names what fails the release, not what someone should remember to check.

| Obligation / risk | Source | The gate that proves it |
| --- | --- | --- |
| [e.g., consent is captured before any tracking fires] | `LEGAL.md` | [the test that fails when a tag loads without consent] |
| [e.g., the job queue survives a restart] | `TRD.md` | [the test that proves it] |

## Acceptance Criteria (Definition of Done)

- [What test criteria must a task meet before the QA persona can approve it?]

## Revision Requests

- [One line per document, in the form: - [ ] `TARGET.md` — what must change there and why. Leave the box unticked; kortext ticks it and records the outcome underneath when the demand is settled. Leave this section empty when nothing upstream needs to change]

## Open Questions for prime

- [Anything prime must answer before this document can be relied on — leave this section empty when there is nothing]
