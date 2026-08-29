---
status: uninitialized
author: +engineering-manager
reviewer:
approver: +prime
---

# File System & Architecture

## High-Level Folder Structure

```
[Project Root]/
├── src/
│   ├── components/    → [Açıklama]
│   ├── pages/         → [Açıklama]
│   ├── utils/         → [Açıklama]
│   └── api/           → [Açıklama]
├── public/            → [Açıklama]
└── [Config Files]     → (package.json, tsconfig.json vb.)
```

## Directory Rules

- **`/components/`:** Yalnızca tekrar kullanılabilir UI elemanlarını barındırır.
- **`/pages/` veya `/app/`:** Sadece sayfa/route yönetimini barındırır.
- **`/utils/`:** Saf (pure) yardımcı fonksiyonlar bulunur (state içermez).

## Path Aliases

- [Örn: `@components/*` -> `src/components/*`]
- [Örn: `@utils/*` -> `src/utils/*`]

## Feature-Based vs Type-Based Structure

- [Projenin yapısı (domain-driven, feature-sliced, vb.) hangisine uyacaksa açıklaması]

# Coding Dictionary & Standards

## Naming Conventions

- **Variables & Functions:** [`camelCase, snake_case`]
- **Classes & Interfaces:** [`PascalCase`]
- **Constants:** [`UPPER_SNAKE_CASE`]
- **Files & Directories:** [`kebab-case`]
- **Database Tables:** [`snake_case, plural/singular`]

## Code Quality & Formatting

- **Linter & Formatter:** [Örn: ESLint + Prettier ayarları]
- **Indent:** [Örn: 2 spaces]
- **Quote Mark:** [Örn: Single quotes ('')]

## Project Terminology (Domain Language)

- **[Kullanılan Terim]:** [Açıklama / Bizim uygulamamızdaki anlamı]
- *Örnek:* **Client:** Uygulamayı kullanan müşteri (User demeyeceğiz).
- *Örnek:* **Cart:** Alışveriş sepeti (Basket demeyeceğiz).

## Commenting & Documentation Rules

- [Örn: JSDoc kullanılacak, kodun "ne" yaptığı değil, "neden" yaptığı yorumlanacak]

## Error Handling Pattern

- [Genel try/catch veya error response fırlatma standartları]
