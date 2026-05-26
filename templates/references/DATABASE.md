---
status: uninitialized
author: +db-admin
reviewer: +backend-developer
approver: +engineering-manager
---

# Database Schema

## Database Overview

- **Database Engine:** [Örn: PostgreSQL, MongoDB]
- **ORM / ODM:** [Örn: Prisma, Mongoose]
- **Migrations Tool:** [Örn: Prisma Migrate, TypeORM]

## Conventions & Standards

- **Table Naming:** [Örn: snake_case (çoğul)]
- **Column Naming:** [Örn: snake_case / camelCase]
- **Primary Keys:** [Örn: UUID / Auto-increment integer]
- **Timestamps:** `created_at`, `updated_at` (Zorunlu)

## Entity-Relationship (ERD) Structure

### Table: `[table_name]`

- **Description:** [Tablonun işlevi]
- **Columns:**
  - `id` (PK, UUID)
  - `[column_name]` ([type], [nullable/unique]) - [Description]
- **Relations:**
  - `[FK/Relation]` -> `[Related Table]`

### Table: `[table_name_2]`

- **Description:** [Tablonun işlevi]
- **Columns:**
  - `id` (PK)

## Indexes & Performance Optimizations

- **[table_name]:** `[column_name]` (Index Type) -> Nedeni

## Security Policies / Row-Level Security

- [Örn: RLS Kuralları, Hassas verilerin şifrelenmesi]
