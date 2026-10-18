---
status: uninitialized
author: +devops-engineer
approver: +prime
---

# Environment Setup Guide

> +devops-engineer's guide. This file is the single point of reference for a new developer (human or agent) who wants to bring the project up from scratch.

## Local Setup

- **Prerequisites:** [Node version, package manager, OS notes]
- **Installation:**
  - `git clone <repo>`
  - `cd <project>`
  - `<package-manager> install`
- **Start commands:**
  - `<package-manager> run dev` — development server
  - `<package-manager> test` — tests

## Environment Variables

The `.env` file is git-ignored. Copy it from `.env.example`.

| Key | Required | Default | Description |
| :--- | :---: | :--- | :--- |
| `[KEY_NAME]` | Yes/No | `[default]` | [Description] |

## Database

- **Provider:** [PostgreSQL / Supabase / Firebase]
- **Migration:** [Migration tool command]
- **Seed data:** [Seed command, if any]
- **Local instance:** [Docker / native]

## External Services

- **Auth:** [Provider + connection steps]
- **Payments:** [Provider + where sandbox keys come from]
- **Email:** [Provider + test mode note]
- **Storage/CDN:** [Provider + local stub, if any]

## Common Issues

- **Issue:** [Common error message] → **Fix:** [Steps]
- **Issue:** [Port conflict] → **Fix:** [Change the port in .env]

# Access & Service Configuration

## Local Development Tools

- [Tool name] — [setup note]
- [MCP server name] — [setup note]

## Version Control

- GitHub Repo: [the value, if the inputs name it — otherwise: Not decided yet — set during the build]
- Organization: [the value, if the inputs name it — otherwise: Not decided yet — set during the build]
- Branch strategy: [which branches exist, what merges into what, what is protected]

## CI/CD Pipeline

- **Cloud provider:** [e.g., AWS, Vercel, Google Cloud]
- **CI/CD platform:** [e.g., GitHub Actions, GitLab CI]
- **On every push:** [what runs — lint, typecheck, tests]
- **On merge to the release branch:** [what deploys, and where]
- **Rollback:** [how a bad release is undone, and by whom]

## Hosting & Deployment

- Production URL: [the value, if the inputs name it — otherwise: Not decided yet — set during the build]
- Staging URL: [the value, if the inputs name it — otherwise: Not decided yet — set during the build]
- Platform: [Firebase Hosting / Vercel / AWS]
- **Hosting region:** [where the servers physically run — e.g., `eu-central-1` (Frankfurt). Compliance decides the cross-border transfer regime on this line, so name a region, not a provider]

## Server Access

- SSH Root: [the value, if the inputs name it — otherwise: Not decided yet — set during the build]
- Domain: [the value, if the inputs name it — otherwise: Not decided yet — set during the build]

## Database Instances

- Provider: [Firebase / Supabase / PostgreSQL]
- Engine + version: [e.g., PostgreSQL 16 — the schema is designed for this]
- **Region:** [where the data physically sits]
- Production Instance: [the value, if the inputs name it — otherwise: Not decided yet — set during the build]
- Staging Instance: [the value, if the inputs name it — otherwise: Not decided yet — set during the build]

## Other Services

- Analytics: [Google Analytics / Mixpanel]
- CDN: [Cloudflare]
- Mail: [SendGrid / Resend]

## Change Requests

- [What THIS document asks of another, one line per request: - `TARGET.md` — what must change there and why. It travels to that document when this one is approved. Lines that start with `from` are the other direction — what others asked of this document; the human decides them, kortext ticks them, leave them exactly as they are. Leave this section empty when nothing upstream needs to change]

## Questions for Prime

- [Anything prime must answer before this document can be relied on — leave this section empty when there is nothing]
