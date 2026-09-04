---
status: uninitialized
author: +architect
approver: +prime
---

# File System & Architecture

## High-Level Folder Structure

```
[Project Root]/
├── src/
│   ├── components/    → [Description]
│   ├── pages/         → [Description]
│   ├── utils/         → [Description]
│   └── api/           → [Description]
├── public/            → [Description]
└── [Config Files]     → (package.json, tsconfig.json, etc.)
```

## Directory Rules

- **`/components/`:** Holds reusable UI elements only.
- **`/pages/` or `/app/`:** Holds page/route management only.
- **`/utils/`:** Pure helper functions live here (no state).

## Path Aliases

- [e.g., `@components/*` -> `src/components/*`]
- [e.g., `@utils/*` -> `src/utils/*`]

## Feature-Based vs Type-Based Structure

- [Which structure the project follows (domain-driven, feature-sliced, etc.) and a short explanation]

# Coding Dictionary & Standards

## Naming Conventions

- **Variables & Functions:** [`camelCase, snake_case`]
- **Classes & Interfaces:** [`PascalCase`]
- **Constants:** [`UPPER_SNAKE_CASE`]
- **Files & Directories:** [`kebab-case`]
- **Database Tables:** [`snake_case, plural/singular`]

## Code Quality & Formatting

- **Linter & Formatter:** [e.g., ESLint + Prettier settings]
- **Indent:** [e.g., 2 spaces]
- **Quote Mark:** [e.g., Single quotes ('')]

## Project Terminology (Domain Language)

- **[Term]:** [Definition / what it means in our app]
- *Example:* **Client:** The customer using the app (we do not say "User").
- *Example:* **Cart:** The shopping cart (we do not say "Basket").

## Commenting & Documentation Rules

- [e.g., Use JSDoc; comments explain "why" the code does something, not "what" it does]

## Error Handling Pattern

- [General try/catch or error response conventions]

## Revision Requests

- [One line per document, in the form: - [ ] `TARGET.md` — what must change there and why. Leave the box unticked; kortext ticks it and records the outcome underneath when the demand is settled. Leave this section empty when nothing upstream needs to change]

## Open Questions for prime

- [Anything prime must answer before this document can be relied on — leave this section empty when there is nothing]
