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

- GitHub Repo: [to be filled by prime]
- Organization: [to be filled by prime]

## Hosting & Deployment

- Production URL: [to be filled by prime]
- Staging URL: [to be filled by prime]
- Platform: [Firebase Hosting / Vercel / AWS]

## Server Access

- SSH Root: [to be filled by prime]
- Domain: [to be filled by prime]

## Database Instances

- Provider: [Firebase / Supabase / PostgreSQL]
- Production Instance: [to be filled by prime]
- Staging Instance: [to be filled by prime]

## Other Services

- Analytics: [Google Analytics / Mixpanel]
- CDN: [Cloudflare]
- Mail: [SendGrid / Resend]

## Open Questions for prime

- [Anything prime must answer before this document can be relied on — leave this section empty when there is nothing]
