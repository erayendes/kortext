# Existing Project Analysis

> **In this file:** An existing project's codebase is examined and its actual state is documented in the reference + foundation files.

## Technical Discovery

1. **+architect:** Produce `STACK.md` + `STRUCTURE.md`. Scan the existing codebase — the ground truth is THE CODE ITSELF (there is no BRD in this flow). Scope: STACK (technology stack, MCP servers, dev tools, dependencies, language/framework versions), STRUCTURE (folder structure, naming conventions, coding standards + project terminology glossary).
   - inputs:
   - outputs: `.kortext/STACK.md`, `.kortext/STRUCTURE.md`
   - approver: +prime

2. **+architect:** Produce `ARCHITECTURE.md`. Extract the actual shape of the existing system: components, data flow, boundaries and integration points, the rationales behind the main architectural choices. Flag the gaps between code and intent.
   - inputs: `.kortext/STACK.md`, `.kortext/STRUCTURE.md`
   - outputs: `.kortext/ARCHITECTURE.md`
   - approver: +prime

3. **+db-admin:** Produce `DATABASE.md`. Scope: existing migrations + schema + ORM models + connection setup + tables + relationships + indexes + data types + integrity rules.
   - inputs: `.kortext/STACK.md`, `.kortext/STRUCTURE.md`
   - outputs: `.kortext/DATABASE.md`
   - approver: +prime

4. **+security-engineer:** Produce `SECURITY.md`. Scope: existing auth + authorization + middleware + env handling + CORS + rate limiting + secret management + logging + sensitive-data usage. Flag vulnerabilities and missing layers.
   - inputs: `.kortext/STACK.md`, `.kortext/STRUCTURE.md`
   - outputs: `.kortext/SECURITY.md`
   - approver: +prime

5. **+devops-engineer:** Produce `ENVIRONMENT.md`. Scope: CI/CD pipelines, deployment processes, environment configurations, branch strategy + access ownership and account inventory (Access & Service section), secret management.
   - inputs: `.kortext/STACK.md`, `.kortext/STRUCTURE.md`
   - outputs: `.kortext/ENVIRONMENT.md`
   - approver: +prime

6. **+architect:** Produce `API.md`. Scope: endpoint list + request/response models + auth mechanisms + service boundaries + integration points.
   - inputs: `.kortext/STACK.md`, `.kortext/STRUCTURE.md`, `.kortext/DATABASE.md`
   - outputs: `.kortext/API.md`
   - approver: +prime

## Product Discovery

1. **+product-manager:** Produce `PRD.md`. Scope: existing features + user flows + roles/permissions + known gaps + any existing roadmap/issue list — all from the code and the traces in the repo.
   - inputs: `.kortext/STRUCTURE.md`
   - outputs: `.kortext/foundation/PRD.md`
   - approver: +prime

2. **+qa-engineer:** Produce `TEST.md`. Scope: test coverage + test types + CI test reports + untested areas. Document whether quality assurance is sufficient for the critical user flows.
   - inputs: `.kortext/foundation/PRD.md`, `.kortext/STRUCTURE.md`
   - outputs: `.kortext/TEST.md`
   - approver: +prime

3. **+designer:** Produce `DESIGN.md`. Extract the existing design language from the code: tokens/theme, components, layout patterns, accessibility state. Flag inconsistencies; set the rules future work must follow. If the project has no user interface, mark it not-applicable.
   - inputs: `.kortext/foundation/PRD.md`, `.kortext/STRUCTURE.md`
   - outputs: `.kortext/DESIGN.md`
   - approver: +prime

4. **+copywriter:** Produce `CONTENT.md`. Scope: existing UI copy, tone of voice, error/empty-state messages, localization state; the content rules future work must follow. If the project has no user-facing content, mark it not-applicable.
   - inputs: `.kortext/foundation/PRD.md`, `.kortext/DESIGN.md`
   - outputs: `.kortext/CONTENT.md`
   - approver: +prime

5. **+compliance-expert:** Produce `LEGAL.md`. Scope: personal-data handling found in the code (KVKK/GDPR), license obligations of the dependency tree, terms/privacy needs, compliance gaps. If truly nothing applies, mark it not-applicable with the reasoning.
   - inputs: `.kortext/foundation/PRD.md`, `.kortext/SECURITY.md`
   - outputs: `.kortext/LEGAL.md`
   - approver: +prime

6. **+growth-expert:** Produce `GROWTH.md`. Scope: current analytics/tracking state, SEO/ASO posture, activation and retention signals worth measuring; what to instrument next. If growth genuinely does not apply, mark it not-applicable with the reasoning.
   - inputs: `.kortext/foundation/PRD.md`
   - outputs: `.kortext/GROWTH.md`
   - approver: +prime

## Technical Debt and TRD

1. **+architect:** Consolidate `TRD.md`. Scope: technical debt from the discovery outputs + architectural issues + security risks + test gaps + devops/release risks + improvement areas. For each debt item: impact, risk, dependencies, priority level.
   - inputs: `.kortext/foundation/PRD.md`, `.kortext/STACK.md`, `.kortext/STRUCTURE.md`, `.kortext/ARCHITECTURE.md`, `.kortext/DATABASE.md`, `.kortext/SECURITY.md`, `.kortext/API.md`, `.kortext/ENVIRONMENT.md`, `.kortext/TEST.md`
   - outputs: `.kortext/foundation/TRD.md`
   - approver: +prime

## Consolidation

1. **+operation-manager:** Consolidate `PFD.md`. From the discovery outputs: current-state summary + reference files + technical-debt list + open decisions + task headings to hand over to the planning flow.
   - inputs: `.kortext/foundation/PRD.md`, `.kortext/foundation/TRD.md`, `.kortext/TEST.md`, `.kortext/DESIGN.md`, `.kortext/CONTENT.md`, `.kortext/LEGAL.md`, `.kortext/GROWTH.md`
   - outputs: `.kortext/foundation/PFD.md`
   - approver: +prime

**Next flow:** `planning-pipeline`
