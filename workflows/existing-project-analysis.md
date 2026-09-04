# Existing Project Analysis

> **In this file:** An existing project's codebase is examined and its actual state is documented in the reference + foundation files.

> **Scope before writing.** The codebase is the only evidence; there is no brief. Every step
> decides whether its document applies before it writes a line, and the `n/a when` condition
> below each step is that test — read the code, do not assume the project is like other
> projects. When the condition is met, the document is written with `status: not-applicable`
> and one line of reasoning, and the flow carries on. Steps with no `n/a when` line always
> apply. Absence of evidence is a finding, not a blank to fill.

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
   - n/a when: the codebase carries no persistence layer: no schema, no migrations, no ORM models, no database client.
   - approver: +prime

4. **+security-engineer:** Produce `SECURITY.md`. Scope: existing auth + authorization + middleware + env handling + CORS + rate limiting + secret management + logging + sensitive-data usage. Flag vulnerabilities and missing layers, against the boundaries `ARCHITECTURE.md` found and the data `DATABASE.md` holds.
   - inputs: `.kortext/STACK.md`, `.kortext/STRUCTURE.md`, `.kortext/ARCHITECTURE.md`, `.kortext/DATABASE.md`
   - outputs: `.kortext/SECURITY.md`
   - approver: +prime

5. **+devops-engineer:** Produce `ENVIRONMENT.md`. Scope: CI/CD pipelines, deployment processes, environment configurations, branch strategy + access ownership and account inventory (Access & Service section), secret management.
   - inputs: `.kortext/STACK.md`, `.kortext/STRUCTURE.md`, `.kortext/ARCHITECTURE.md`, `.kortext/SECURITY.md`
   - outputs: `.kortext/ENVIRONMENT.md`
   - approver: +prime

6. **+architect:** Produce `API.md`. Scope: endpoint list + request/response models + auth mechanisms + service boundaries + integration points.
   - inputs: `.kortext/STACK.md`, `.kortext/STRUCTURE.md`, `.kortext/DATABASE.md`
   - outputs: `.kortext/API.md`
   - n/a when: the codebase exposes no endpoint, handler or public interface and calls no external service.
   - approver: +prime

## Product Discovery

1. **+product-manager:** Produce `PRODUCT.md`. Scope: existing features + user flows + roles/permissions + known gaps + any existing roadmap/issue list — all from the code and the traces in the repo.
   - inputs: `.kortext/STACK.md`, `.kortext/STRUCTURE.md`, `.kortext/ARCHITECTURE.md`, `.kortext/DATABASE.md`, `.kortext/API.md`
   - outputs: `.kortext/PRODUCT.md`
   - approver: +prime

2. **+qa-engineer:** Produce `TEST.md`. Scope: test coverage + test types + CI test reports + untested areas. Document whether quality assurance is sufficient for the critical user flows.
   - inputs: `.kortext/PRODUCT.md`, `.kortext/STACK.md`, `.kortext/STRUCTURE.md`
   - outputs: `.kortext/TEST.md`
   - approver: +prime

3. **+designer:** Produce `DESIGN.md`. Extract the existing design language from the code: tokens/theme, components, layout patterns, accessibility state. Flag inconsistencies; set the rules future work must follow.
   - inputs: `.kortext/PRODUCT.md`, `.kortext/STACK.md`, `.kortext/STRUCTURE.md`
   - outputs: `.kortext/DESIGN.md`
   - n/a when: the codebase renders no user interface — no views, no templates, no components, no styling.
   - approver: +prime

4. **+growth-expert:** Produce `GROWTH.md`. Scope: current analytics/tracking state, SEO/ASO posture, activation and retention signals worth measuring; what to instrument next.
   - inputs: `.kortext/PRODUCT.md`, `.kortext/STACK.md`, `.kortext/DESIGN.md`
   - outputs: `.kortext/GROWTH.md`
   - n/a when: the codebase serves no measurable surface and reaches no acquisition channel — an internal tool or a library.
   - approver: +prime

5. **+compliance-expert:** Produce `LEGAL.md`. Scope: personal-data handling found in the code (KVKK/GDPR), license obligations of the dependency tree, terms/privacy needs, compliance gaps. Judge the codebase as it is: the hosting region from `ENVIRONMENT.md`, the third parties from `STACK.md` and `GROWTH.md`, the personal-data columns from `DATABASE.md`, the technical measures from `SECURITY.md`.
   - inputs: `.kortext/PRODUCT.md`, `.kortext/STACK.md`, `.kortext/SECURITY.md`, `.kortext/DATABASE.md`, `.kortext/ENVIRONMENT.md`, `.kortext/GROWTH.md`
   - outputs: `.kortext/LEGAL.md`
   - n/a when: the codebase touches no personal data, ships no third-party data flow and carries no licence obligation beyond permissive dependencies.
   - approver: +prime

6. **+copywriter:** Produce `CONTENT.md`. Scope: existing UI copy, tone of voice, error/empty-state messages, localization state; the content rules future work must follow. The interface language is whatever the code already speaks — read the strings, do not assume; if the codebase carries an i18n setup, record the source language, the target languages and the state of each.
   - inputs: `.kortext/PRODUCT.md`, `.kortext/DESIGN.md`, `.kortext/GROWTH.md`, `.kortext/LEGAL.md`
   - outputs: `.kortext/CONTENT.md`
   - n/a when: no string in the codebase is read by a person: no interface copy, no messages, no emails.
   - approver: +prime

## Technical Debt and TRD

1. **+architect:** Consolidate `ENGINEERING.md`. Scope: technical debt from the discovery outputs + architectural issues + security risks + test gaps + devops/release risks + improvement areas. For each debt item: impact, risk, dependencies, priority level.
   - inputs: `.kortext/PRODUCT.md`, `.kortext/STACK.md`, `.kortext/STRUCTURE.md`, `.kortext/ARCHITECTURE.md`, `.kortext/DATABASE.md`, `.kortext/SECURITY.md`, `.kortext/API.md`, `.kortext/ENVIRONMENT.md`, `.kortext/TEST.md`, `.kortext/LEGAL.md`
   - outputs: `.kortext/ENGINEERING.md`
   - approver: +prime
