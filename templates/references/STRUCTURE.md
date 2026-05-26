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
