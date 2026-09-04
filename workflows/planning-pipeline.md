# Planning Pipeline — "Transfer to Kopeng" (splitting the work into tasks)

> Runs only when +prime presses the **"Transfer to Kopeng"** button in the panel. Produces
> the Version → Epic → Task structure from the approved analysis documents and puts the
> files Kopeng will read under `.kopeng/`. This is the final step of the handshake.

## Inputs

Approved documents: `PRODUCT.md`, `ENGINEERING.md`, `.kortext/ARCHITECTURE.md`,
`STACK.md`, `SECURITY.md`, `LEGAL.md`, `API.md`, `DATABASE.md`, `DESIGN.md`, `TEST.md`
(skip the ones marked not-applicable).

## Output — `.kopeng/` file layout (DRAFT contract; Kopeng conforms to this format)

```
.kopeng/
├── project.yaml                  # name, code, status: draft, created
├── versions/
│   └── v0.1.yaml                 # id, name, description, epics: [ACME-E01, …]
├── epics/
│   └── ACME-E01.yaml             # id, name, version, description, tasks: [ACME-T001, …]
└── tasks/
    └── ACME-T001.md              # frontmatter + body (below)
```

**Task file** (`tasks/<ID>.md`) — frontmatter:
`id`, `name`, `epic` (optional — a task may have no epic), `assignee` (`ai` | `prime`),
`blocked_by: []` (always write it; empty list if none), `blocks: []`.
Body headings (all required; write "—" where one does not apply):

```
## Description
## Functional Requirements
## User Flow
## UI Requirements
## Technical Notes
## Acceptance Criteria
```

## Rules

1. **ID convention:** project code as prefix — `<CODE>-E01` (epic), `<CODE>-T001` (task).
   Slug/kebab-case ids are FORBIDDEN.
2. **Scope ceiling:** if the PRD/BRD sets an item limit or an "MVP/small" note, do NOT
   exceed it; when in doubt, fewer, larger tasks. One feature = one task; do NOT split it
   into frontend/backend/test.
3. **Few versions:** 1–3 versions for an MVP; every epic belongs to a version; tasks do not
   have to belong to an epic (an independent task is not written to the version root — it
   stays epic-less).
4. **+prime prerequisites (MANDATORY):** scan STACK/SECURITY/LEGAL/API; produce every need
   that requires human action (opening an account, API key, domain, device, budget approval)
   as an `assignee: prime` task and add it to the `blocked_by` of the tasks that depend on it.
5. **Dependencies:** encode the real ordering constraints with `blocked_by`; leave no
   dangling ids; keep the `blocks` field consistent in the reverse direction.
6. **Acceptance Criteria** must align with TEST.md's quality bar and be behavior-focused
   and verifiable.
7. **Self-check (before finishing):** does every file conform to the schema; are every
   epic's `version` and listed `tasks` real; are every task's frontmatter fields complete;
   are the ids on convention; is `project.yaml` at `status: draft`. Fix any problem you find.
