---
status: uninitialized
author: +db-admin
approver: +architect
---

# Database Schema

## Database Overview

- **Database Engine:** [e.g., PostgreSQL, MongoDB]
- **ORM / ODM:** [e.g., Prisma, Mongoose]
- **Migrations Tool:** [e.g., Prisma Migrate, TypeORM]

## Conventions & Standards

- **Table Naming:** [e.g., snake_case (plural)]
- **Column Naming:** [e.g., snake_case / camelCase]
- **Primary Keys:** [e.g., UUID / Auto-increment integer]
- **Timestamps:** `created_at`, `updated_at` (required)
- **Personal data:** every column holding personal data carries a `[PII]` marker in its line below, and is repeated in the roll-up section

## Entity-Relationship (ERD) Structure

### Table: `[table_name]`

- **Description:** [What the table does]
- **Columns:**
  - `id` (PK, UUID)
  - `[column_name]` ([type], [nullable/unique]) [PII if personal] - [Description]
- **Relations:**
  - `[FK/Relation]` -> `[Related Table]`

### Table: `[table_name_2]`

- **Description:** [What the table does]
- **Columns:**
  - `id` (PK)

## Indexes & Performance Optimizations

- **[table_name]:** `[column_name]` (Index Type) -> Reason

## Personal Data Columns

> `LEGAL.md` is run against this list — it decides retention and erasure duties from it.
> Write `none` when the schema holds no personal data at all.

| Table.Column | What it holds | Why the product needs it |
| --- | --- | --- |
| `[table].[column]` | [e.g., the user's email address] | [what breaks without it] |

## Security Policies / Row-Level Security

- [e.g., RLS rules, encryption of sensitive data]

## Revision Requests

- [`TARGET.md` — what must change there and why. One line per document. Leave this section empty when nothing upstream needs to change]

## Open Questions for prime

- [Anything prime must answer before this document can be relied on — leave this section empty when there is nothing]
