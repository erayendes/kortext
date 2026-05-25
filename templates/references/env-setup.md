---
status: uninitialized
author: +devops-engineer
reviewer:
approver: +prime
---

# Environment Setup Guide

> +devops-engineer rehberi. Bu dosya, yeni bir geliştirici (insan veya ajan) projeyi sıfırdan ayağa kaldırmak istediğinde başvurduğu tek noktadır.

## Local Setup

- **Prerequisites:** [Node sürümü, paket yöneticisi, OS notları]
- **Installation:**
  - `git clone <repo>`
  - `cd <project>`
  - `<package-manager> install`
- **Start commands:**
  - `<package-manager> run dev` — geliştirme sunucusu
  - `<package-manager> test` — testler

## Environment Variables

`.env` dosyası git-ignore edilir. `.env.example` üzerinden kopyalanır.

| Key | Required | Default | Description |
| :--- | :---: | :--- | :--- |
| `[KEY_NAME]` | Yes/No | `[default]` | [Açıklama] |

## Database

- **Provider:** [PostgreSQL / Supabase / Firebase]
- **Migration:** [Migration tool komutu]
- **Seed data:** [Varsa seed komutu]
- **Local instance:** [Docker / native]

## External Services

- **Auth:** [Provider + bağlanma adımı]
- **Payments:** [Provider + sandbox key kaynağı]
- **Email:** [Provider + test mode notu]
- **Storage/CDN:** [Provider + lokal stub varsa]

## Common Issues

- **Issue:** [Yaygın hata mesajı] → **Çözüm:** [Adım]
- **Issue:** [Port çakışması] → **Çözüm:** [.env'de port değiştir]
