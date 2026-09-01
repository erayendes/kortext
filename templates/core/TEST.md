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

## Acceptance Criteria (Definition of Done)

- [What test criteria must a task meet before the QA persona can approve it?]
