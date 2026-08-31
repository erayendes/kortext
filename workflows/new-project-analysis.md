# New Project Analysis

> **In this file:** The reference + foundation files for a new project are produced.

## Product Analysis

1. **+compliance-expert:** Produce `LEGAL.md`. Scope: regulations that apply according to the BRD (KVKK, GDPR, CCPA, sector-specific) + data lifecycle rules (privacy, disclosure notices, consent, retention, deletion, third-party sharing).
   - label: LEGAL.md
   - activity: Applicable regulations identified. Data lifecycle rules defined.
   - inputs: `.kortext/foundation/BRD.md`
   - outputs: `.kortext/LEGAL.md`
   - approver: +prime

2. **+growth-expert:** Produce `GROWTH.md`. Scope: target audience, channel strategy, SEO/GEO, measurement, analytics, conversion tracking.
   - label: GROWTH.md
   - activity: Target audience and channels defined. SEO and measurement planned.
   - inputs: `.kortext/foundation/BRD.md`
   - outputs: `.kortext/GROWTH.md`
   - approver: +prime

3. **+product-manager:** Produce `PRD.md`. From BRD + LEGAL + GROWTH: scope, user types, main flows, priorities, acceptance criteria, out-of-scope items.
   - label: PRD.md
   - activity: Scope and user types settled. Main flows defined.
   - inputs: `.kortext/foundation/BRD.md`, `.kortext/LEGAL.md`, `.kortext/GROWTH.md`
   - outputs: `.kortext/foundation/PRD.md`
   - approver: +prime

4. **+copywriter:** Produce `CONTENT.md`. From PRD + LEGAL + GROWTH: brand voice, message hierarchy, page copy, microcopy, SEO content direction.
   - label: CONTENT.md
   - activity: Brand voice established. Page copy written.
   - inputs: `.kortext/foundation/PRD.md`, `.kortext/LEGAL.md`, `.kortext/GROWTH.md`
   - outputs: `.kortext/CONTENT.md`
   - approver: +prime

## Technical Analysis

1. **+architect:** Produce `STACK.md` + `STRUCTURE.md`. STACK: technology stack, MCP servers, dev tools, prerequisites to request from +prime (device, emulator, API key, external service). STRUCTURE: coding standards + folder structure + project terminology glossary.
   - label: STACK.md
   - activity: Technology stack chosen. Standards and glossary defined.
   - inputs: `.kortext/foundation/BRD.md`, `.kortext/foundation/PRD.md`
   - outputs: `.kortext/STACK.md`, `.kortext/STRUCTURE.md`
   - approver: +prime

2. **+architect:** Produce `ARCHITECTURE.md`. From PRD + STACK + STRUCTURE, design the shape of the system: components, data flow, boundaries and integration points, main architectural choices with one-line rationales (detailed decisions go to DECISIONS.md).
   - inputs: `.kortext/foundation/PRD.md`, `.kortext/STACK.md`, `.kortext/STRUCTURE.md`
   - outputs: `.kortext/ARCHITECTURE.md`
   - approver: +prime

3. **+security-engineer:** Produce `SECURITY.md`. On top of STACK: auth, authorization, secret management, data storage, logging, `.gitignore`, secure development discipline.
   - label: SECURITY.md
   - activity: Auth and secret management established. Secure development rules defined.
   - inputs: `.kortext/STACK.md`
   - outputs: `.kortext/SECURITY.md`
   - approver: +prime

4. **+designer:** Produce `DESIGN.md`. From PRD + CONTENT + STACK: color palette, typography, component principles, responsive behavior, accessibility, core UI rules.
   - label: DESIGN.md
   - activity: Colors and typography chosen. Component principles defined.
   - inputs: `.kortext/foundation/PRD.md`, `.kortext/STACK.md`, `.kortext/CONTENT.md`
   - outputs: `.kortext/DESIGN.md`
   - approver: +prime

5. **+db-admin:** Produce `DATABASE.md`. From PRD + SECURITY + STRUCTURE + STACK: tables, relationships, indexes, access rules, migration approach, data integrity.
   - label: DATABASE.md
   - activity: Database schema created. Tables and relationships defined.
   - inputs: `.kortext/foundation/PRD.md`, `.kortext/SECURITY.md`, `.kortext/STRUCTURE.md`, `.kortext/STACK.md`
   - outputs: `.kortext/DATABASE.md`
   - approver: +prime

6. **+architect:** Produce `API.md`. Endpoint list, request/response models, error formats, authorization requirements, data flow.
   - label: API.md
   - activity: Endpoints defined. Request/response models specified.
   - inputs: `.kortext/foundation/PRD.md`, `.kortext/SECURITY.md`, `.kortext/STRUCTURE.md`, `.kortext/STACK.md`, `.kortext/DATABASE.md`
   - outputs: `.kortext/API.md`
   - approver: +prime

7. **+architect:** Consolidate `TRD.md`. Merge the ARCHITECTURE + STACK + STRUCTURE + SECURITY + DATABASE + API + DESIGN outputs + engineering decisions into a single report.
   - label: TRD.md
   - activity: Technical decisions merged into a single report.
   - inputs: `.kortext/foundation/PRD.md`, `.kortext/ARCHITECTURE.md`, `.kortext/SECURITY.md`, `.kortext/STRUCTURE.md`, `.kortext/STACK.md`, `.kortext/DATABASE.md`, `.kortext/API.md`, `.kortext/DESIGN.md`
   - outputs: `.kortext/foundation/TRD.md`
   - approver: +prime

8. **+qa-engineer:** Produce `TEST.md`. From PRD + TRD: test types, critical user flows, automation coverage, manual QA, acceptance criteria, release quality gates.
   - label: TEST.md
   - activity: Test types and quality gates defined.
   - inputs: `.kortext/foundation/PRD.md`, `.kortext/foundation/TRD.md`
   - outputs: `.kortext/TEST.md`
   - approver: +prime

## Consolidation

1. **+operation-manager:** Consolidate `PFD.md`. From PRD + TRD + TEST: project scope, main decisions, open items, risks, dependencies, task headings to carry into the planning flow.
   - label: PFD.md
   - activity: Project summary drafted. Tasks for planning prepared.

   **Memory (permanent decision log):** Add the lasting product/architecture decisions made during the analysis phase to the VERY TOP of `.kortext/DECISIONS.md` (format: `## YYYY-MM-DD — title` + one-paragraph rationale). One entry per decision: what was decided + a short rationale (e.g. "Stack: Next.js + Postgres — team familiarity + SSR need", "KVKK scope: user data will not leave the EU"). This file grows with new entries added on top during the planning flow.
   - inputs: `.kortext/foundation/PRD.md`, `.kortext/foundation/TRD.md`, `.kortext/TEST.md`
   - outputs: `.kortext/foundation/PFD.md`
   - approver: +prime

**Next flow:** `planning-pipeline`

9. **+devops-engineer:** Produce `ENVIRONMENT.md`. Scope: environments (dev/prod), environment-variable plan, setup steps, CI/CD approach, access ownership and account inventory (Access & Service section), secret management.
   - inputs: `.kortext/STACK.md`, `.kortext/STRUCTURE.md`
   - outputs: `.kortext/ENVIRONMENT.md`
   - approver: +prime
