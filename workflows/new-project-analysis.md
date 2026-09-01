# New Project Analysis

> **In this file:** The reference + foundation files for a new project are produced.

> **Scope before writing.** Every step decides whether its document applies to THIS project
> before it writes a line. The `n/a when` condition below each step is that test; when it is
> met, the document is written with `status: not-applicable` and one line of reasoning, and
> the flow carries on — a correct outcome, not a gap. Steps with no `n/a when` line always
> apply. What the inputs do not say, no document may assume.

> **The order is the argument.** Each document is written only once every fact it depends on
> exists. Product before measurement, because you cannot instrument a flow you have not
> defined. Stack before architecture, architecture before security, security before schema:
> each is the ground the next stands on. Compliance and content come near the end because
> both judge a system rather than imagine one — the hosting region, the processor list and
> the stored fields are what compliance rules on, and the components are what copy is written
> into. Where a late document finds a problem, the fix is a revision of the document that
> caused it, not a quiet assumption in the one that found it.

## Product

1. **+product-manager:** Produce `PRD.md`. From the BRD: scope, user types, main flows, priorities, acceptance criteria, out-of-scope items. State plainly which personal data each flow needs — that list is what the compliance analysis will be run against later.
   - label: PRD.md
   - activity: Scope and user types settled. Main flows defined.
   - inputs: `.kortext/foundation/BRD.md`
   - outputs: `.kortext/foundation/PRD.md`
   - approver: +prime

2. **+growth-expert:** Produce `GROWTH.md`. Scope: target audience, channel strategy, SEO/GEO, measurement, analytics, conversion tracking. The event taxonomy instruments the flows `PRD.md` defines — name them, do not invent parallel ones. Every third party that would touch user data here becomes a processor `LEGAL.md` has to account for, so name the measurement mechanism concretely.
   - label: GROWTH.md
   - activity: Target audience and channels defined. SEO and measurement planned.
   - inputs: `.kortext/foundation/BRD.md`, `.kortext/foundation/PRD.md`
   - outputs: `.kortext/GROWTH.md`
   - n/a when: the brief describes no surface worth measuring and no acquisition channel — an internal tool, a library, or something with one known user.
   - approver: +prime

## Engineering

1. **+architect:** Produce `STACK.md` + `STRUCTURE.md`. STACK: technology stack, MCP servers, dev tools, prerequisites to request from prime (device, emulator, API key, external service). STRUCTURE: coding standards + folder structure + project terminology glossary. Name every third-party service that will see user data, and the region it runs in — compliance is judged on this list.
   - label: STACK.md
   - activity: Technology stack chosen. Standards and glossary defined.
   - inputs: `.kortext/foundation/BRD.md`, `.kortext/foundation/PRD.md`
   - outputs: `.kortext/STACK.md`, `.kortext/STRUCTURE.md`
   - approver: +prime

2. **+architect:** Produce `ARCHITECTURE.md`. From PRD + STACK + STRUCTURE, design the shape of the system: components, data flow, boundaries and integration points, main architectural choices, each with its rationale and the alternative that lost. The boundaries drawn here are the ones `SECURITY.md` will defend.
   - label: ARCHITECTURE.md
   - activity: Components and data flow designed. Boundaries named.
   - inputs: `.kortext/foundation/PRD.md`, `.kortext/STACK.md`, `.kortext/STRUCTURE.md`
   - outputs: `.kortext/ARCHITECTURE.md`
   - approver: +prime

3. **+security-engineer:** Produce `SECURITY.md`. Auth, authorization, secret management, data storage, logging, `.gitignore`, secure development discipline. Defend the boundaries `ARCHITECTURE.md` draws around the data `PRD.md` says the product handles — not a generic checklist for the stack.
   - label: SECURITY.md
   - activity: Auth and secret management established. Secure development rules defined.
   - inputs: `.kortext/foundation/PRD.md`, `.kortext/STACK.md`, `.kortext/ARCHITECTURE.md`
   - outputs: `.kortext/SECURITY.md`
   - approver: +prime

4. **+db-admin:** Produce `DATABASE.md`. Tables, relationships, indexes, access rules, migration approach, data integrity. Mark which columns hold personal data — `LEGAL.md` reads this to decide retention and erasure duties.
   - label: DATABASE.md
   - activity: Database schema created. Tables and relationships defined.
   - inputs: `.kortext/foundation/PRD.md`, `.kortext/ARCHITECTURE.md`, `.kortext/SECURITY.md`, `.kortext/STRUCTURE.md`, `.kortext/STACK.md`
   - outputs: `.kortext/DATABASE.md`
   - n/a when: the product persists nothing beyond its own configuration: no database, no stored records, no user data at rest.
   - approver: +prime

5. **+architect:** Produce `API.md`. Endpoint list, request/response models, error formats, authorization requirements, data flow.
   - label: API.md
   - activity: Endpoints defined. Request/response models specified.
   - inputs: `.kortext/foundation/PRD.md`, `.kortext/ARCHITECTURE.md`, `.kortext/SECURITY.md`, `.kortext/STRUCTURE.md`, `.kortext/STACK.md`, `.kortext/DATABASE.md`
   - outputs: `.kortext/API.md`
   - n/a when: nothing crosses a program boundary: the product exposes no endpoint and calls no external service.
   - approver: +prime

6. **+devops-engineer:** Produce `ENVIRONMENT.md`. Environments (dev/prod), environment-variable plan, setup steps, CI/CD approach, access ownership and account inventory (Access & Service section), secret management. State the hosting region explicitly — it is the single fact that decides whether a cross-border transfer regime applies.
   - label: ENVIRONMENT.md
   - activity: Environments and deployment defined. Accounts and secrets planned.
   - inputs: `.kortext/STACK.md`, `.kortext/STRUCTURE.md`, `.kortext/SECURITY.md`
   - outputs: `.kortext/ENVIRONMENT.md`
   - approver: +prime

7. **+designer:** Produce `DESIGN.md`. Color palette, typography, component principles, responsive behavior, accessibility, core UI rules. The components named here are the ones `CONTENT.md` writes copy into, so name them concretely.
   - label: DESIGN.md
   - activity: Colors and typography chosen. Component principles defined.
   - inputs: `.kortext/foundation/PRD.md`, `.kortext/STACK.md`
   - outputs: `.kortext/DESIGN.md`
   - n/a when: the product has no visual surface — a CLI, a library, or a service that renders nothing.
   - approver: +prime

## Judgement

1. **+compliance-expert:** Produce `LEGAL.md`. Regulations that apply (KVKK, GDPR, CCPA, sector-specific) + data lifecycle rules (privacy, disclosure notices, consent, retention, deletion, third-party sharing). Judge the system as designed, not as imagined: the hosting region from `ENVIRONMENT.md`, the processors from `STACK.md` and `GROWTH.md`, the personal-data columns from `DATABASE.md`, the technical measures from `SECURITY.md`. Where the design breaks an obligation, name the document that must change and why — that is a revision request, not an open question.
   - label: LEGAL.md
   - activity: Applicable regulations identified. Data lifecycle rules defined.
   - inputs: `.kortext/foundation/BRD.md`, `.kortext/foundation/PRD.md`, `.kortext/GROWTH.md`, `.kortext/STACK.md`, `.kortext/SECURITY.md`, `.kortext/DATABASE.md`, `.kortext/ENVIRONMENT.md`
   - outputs: `.kortext/LEGAL.md`
   - n/a when: the design touches no personal data, no accounts, no third party receiving data and no regulated content — a tool whose data never leaves the user's own machine.
   - approver: +prime

2. **+copywriter:** Produce `CONTENT.md`. Brand voice, message hierarchy, page copy, microcopy, SEO content direction. Write into the components `DESIGN.md` names and the flows `PRD.md` defines. Every string a user reads is written in the interface language the BRD names — and if the BRD names more than one, add the localization plan: source language, target languages, what is translated and what stays fixed. The notices `LEGAL.md` requires are content: write them, do not reference them.
   - label: CONTENT.md
   - activity: Brand voice established. Page copy written.
   - inputs: `.kortext/foundation/PRD.md`, `.kortext/DESIGN.md`, `.kortext/GROWTH.md`, `.kortext/LEGAL.md`
   - outputs: `.kortext/CONTENT.md`
   - n/a when: nothing in the product is read by a person: no interface copy, no messages, no emails, no listing.
   - approver: +prime

## Consolidation

1. **+architect:** Consolidate `TRD.md`. Merge the engineering documents and their decisions into a single report. `LEGAL.md` is an input, not a courtesy: where it rules against the design, the contradiction is resolved here or carried as a named risk.
   - label: TRD.md
   - activity: Technical decisions merged into a single report.
   - inputs: `.kortext/foundation/PRD.md`, `.kortext/ARCHITECTURE.md`, `.kortext/STACK.md`, `.kortext/STRUCTURE.md`, `.kortext/SECURITY.md`, `.kortext/DATABASE.md`, `.kortext/API.md`, `.kortext/ENVIRONMENT.md`, `.kortext/DESIGN.md`, `.kortext/LEGAL.md`
   - outputs: `.kortext/foundation/TRD.md`
   - approver: +prime

2. **+qa-engineer:** Produce `TEST.md`. Test types, critical user flows, automation coverage, manual QA, acceptance criteria, release quality gates. The gates prove the obligations `LEGAL.md` states and the risks `TRD.md` registers, not only that features work.
   - label: TEST.md
   - activity: Test types and quality gates defined.
   - inputs: `.kortext/foundation/PRD.md`, `.kortext/foundation/TRD.md`, `.kortext/LEGAL.md`
   - outputs: `.kortext/TEST.md`
   - approver: +prime

3. **+operation-manager:** Consolidate `PFD.md`. Project scope, main decisions, open items, risks, dependencies, task headings to carry into the planning flow.
   - label: PFD.md
   - activity: Project summary drafted. Tasks for planning prepared.
   - inputs: `.kortext/foundation/PRD.md`, `.kortext/foundation/TRD.md`, `.kortext/TEST.md`, `.kortext/LEGAL.md`, `.kortext/GROWTH.md`, `.kortext/CONTENT.md`
   - outputs: `.kortext/foundation/PFD.md`
   - approver: +prime

**Next flow:** `planning-pipeline`
