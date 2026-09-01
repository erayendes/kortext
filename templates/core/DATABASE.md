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

## Entity-Relationship (ERD) Structure

### Table: `[table_name]`

- **Description:** [What the table does]
- **Columns:**
  - `id` (PK, UUID)
  - `[column_name]` ([type], [nullable/unique]) - [Description]
- **Relations:**
  - `[FK/Relation]` -> `[Related Table]`

### Table: `[table_name_2]`

- **Description:** [What the table does]
- **Columns:**
  - `id` (PK)

## Indexes & Performance Optimizations

- **[table_name]:** `[column_name]` (Index Type) -> Reason

## Security Policies / Row-Level Security

- [e.g., RLS rules, encryption of sensitive data]
