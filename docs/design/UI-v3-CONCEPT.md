# Kortext v3 UI — Operations Center Concept

> **Karar tarihi:** 2026-05-21
> **Felsefe:** Vercel disiplini + Kortext işlevi. Sade ama bilgilendirici. Az renk, yüksek tipografik hiyerarşi, tablo/liste merkezli. Orbit/radial gibi fancy şeyler yok.
> **Önceki yaklaşım:** mockup-v2 (12 ekran, mission control feel) — referans olarak korunuyor ama paradigma değişti.

---

## 1. Felsefe

| Prensip | Anlamı |
|---|---|
| **Sade** | 7 route, derinlik tab'larda. 12 ekrandan 7'ye sıkıştırma. |
| **Yönetilebilir** | Her ekran 1 net amaç + 1 primary CTA. Tıklama derinliği max 2. |
| **Bilgilendirici** | Vercel gibi yüksek bilgi yoğunluğu (dense). Boş alan değil, ihtiyacın olan veri. |
| **Disiplinli** | Az renk, az glow, az animasyon. Status için renkli dot + text; background fill yok. |
| **Düzenlenebilir** | Markdown ağırlıklı içerikler (agents/workflows/rules/refs/memory) inline editor ile düzenlenebilir. |

> **Karşılaştırma:** Eski v2 "mission control / NASA-vari" — fancy, dramatik. Yeni v3 "operasyon merkezi / Vercel-vari" — fonksiyonel, sade.

---

## 2. 7 Route Mimarisi

```
┌──────────────────────────────────────────────────────────────┐
│ Top bar (48px): Logo · Acme CRM · ⌘K · ● 6/14 · user        │
├──┬───────────────────────────────────────────────────────────┤
│ N│                                                            │
│ a│  CONTENT (route'a göre değişir)                           │
│ v│                                                            │
│  │                                                            │
└──┴───────────────────────────────────────────────────────────┘
```

**Sidebar** (48px collapsed icon-only, 200px expanded):
1. **Overview** — operasyon merkezi
2. **Backlog** — Kanban
3. **Pipelines** — workflow yürütme
4. **Approvals** — tek inbox
5. **Memory** — Decisions/Learned/Handovers
6. **Library** — Agents/Workflows/Rules/References (markdown editor)
7. **Settings** — General/Models/Hooks/Integrations/Environment/Danger

**Onboarding (Setup)** sidebar'da yok — ilk kurulumda gösterilir.

---

## 3. Route Detayları

### 3.1 Overview (default landing)

**Amaç:** "Şu an Kortext ne yapıyor + bana ne soruyor" tek bakışta anlaşılır.

**Layout:**
```
┌─────────────────────────────────────────────────────────────┐
│ KPI Tiles (4 adet, single row):                            │
│ [Token rate]  [Cost today]  [Active: 6/14]  [Blocked: 2]   │
├─────────────────────────────────────────────────────────────┤
│ Active Work                          │ Awaiting You         │
│ (liste, geniş)                       │ (kuyruğun top 5'i)   │
│ - +backend-developer · T-101 · 4m   │ - Report approval    │
│ - +qa-engineer · T-097 · 12m        │ - Architecture ADR   │
│ - +designer · T-103 · 2m            │ - Deploy authorize   │
│ ...                                  │ - Blueprint v2 ...   │
├─────────────────────────────────────────────────────────────┤
│ Recent Activity (full width feed)                          │
│ 14:32 +operation-manager handed T-099 to +qa-engineer      │
│ 14:30 +backend-developer completed T-098 (auth flow)       │
│ ...                                                          │
└─────────────────────────────────────────────────────────────┘
```

**No cards, no glow.** Just border-divided regions, monospace timestamps, accent color only on hover.

### 3.2 Backlog

**Amaç:** Tüm iş listesi (Epic/Task/Bug/Spike/Hotfix). Sürükle-bırak status değişimi.

**Layout:** 5-kolon Kanban (Backlog / Ready / In Progress / Review / Done). Filter bar üstte: Epic filter / persona filter / type filter + "+ New" CTA + View toggle (Kanban / Table).

**Card minimal:** type icon (2-letter mono) + ID (mono) + title + assignee persona dot (no avatar circle, just colored dot + name).

**Item type ID format:**
- E-001 Epic
- T-101 Task
- B-203 Bug
- S-301 Spike
- H-401 Hotfix

### 3.3 Pipelines

**Amaç:** Aktif ve geçmiş workflow yürütmeleri. Her birinin step tree'sini gör, log oku, git diff gör.

**Layout:** Liste view default. Her satır:
- Status dot (running/completed/failed/paused)
- Pipeline ID + name (`04-development-cycle / run #042`)
- Mini progress bar (step X/Y)
- Started timestamp (mono)
- Duration (or elapsed if running)

**Tıkla → satır expand inline** (modal değil, drawer değil — Vercel'deki Deployments row expansion gibi):
- Step tree (text-based, indented)
- Son 5 log line
- "View full logs" + "View diff" linkleri (yeni route'a değil, side panel'e)

### 3.4 Approvals

**Amaç:** Tüm onay süreçleri tek yerde — Reports, ADRs, blueprints, deploys, task transitions.

**Layout:** Üstte type chips (All / Reports / Decisions / Blueprints / Deploys / Tasks). Liste her item:
- Type badge (mini)
- Title
- Persona (requesting)
- Summary (1-2 satır)
- Timestamp
- Action buttons inline: [Approve] [Reject] [Revise]

**Item expand** → full content + reject reason form (5+ char required) veya revise feedback form.

> Eski "Inbox" ekranı bu kapsama girdi. "Reports" eski ekranı da burada — type filter ile ayrılır.

### 3.5 Memory

**Amaç:** Decisions / Learned / Handovers — markdown içerik, görüntüle + düzenle.

**Layout:** Üstte 3 tab. Active tab tablo:

**Decisions tab:**
| ID | Title | Owner | Date | |
|---|---|---|---|---|
| D-001 | Auth strategy: Auth0 | engineering-manager | 14-May | Edit |
| D-002 | DB: PostgreSQL | engineering-manager | 14-May | Edit |
| ... |

Edit tıkla → drawer (sağdan slide) markdown editor + live preview.

**Learned tab:** benzer tablo, lesson + impact kolonları.

**Handovers tab:** timeline view (from → to + next steps + timestamp).

### 3.6 Library

**Amaç:** Tüm "definition" markdown dosyaları — Agents (14), Workflows (12), Rules (~5), References (proje dosyaları). Görüntüle + düzenle.

**Layout:** 4 tab. Her tab içeriği:
- Sol: file tree (200px), tıklanabilir liste
- Sağ: markdown editor (textarea + live preview toggle)

**Agents tab dosya listesi:**
- operation-manager.md
- engineering-manager.md
- backend-developer.md
- ... (14 toplam)

**Workflows tab:**
- 00-kortext-setup.md
- 01a-analysis-pipeline.md
- ... (12 toplam)

**Rules tab:**
- behavior.md
- commands.md
- emergency.md
- mcp.md
- models.md

**References tab:** kullanıcı projesinin doküman dosyaları (blueprint.md, tech-stack.md, brand-voice.md, vb.) + upload zone.

**Editor:**
- Sade textarea (mono font)
- Live preview toggle (split view veya tab)
- Save → file'a yaz + audit log

### 3.7 Settings

**Amaç:** Proje konfigürasyonu. Yan yana tab'lar.

**6 sub-tab:**

1. **General** — Project name, version, GitHub repo, workspace path, auto-commit toggle, PR approval toggle.
2. **Models** — 14 ajan tablosu. Her satır: persona name + tier + model dropdown + cost rating. 4 preset (All Opus / All Sonnet / All Haiku / Balanced). Daily/monthly cost estimate.
3. **Hooks** — 9 lifecycle hook toggle (PreToolUse, PostToolUse, UserPromptSubmit, SessionStart/End, TaskCreate, HandoverStart, PartyStart, BlockerDetected).
4. **Integrations** — 7 servis cards (GitHub/Vercel/Stripe/Auth0/Slack/Linear/Sentry). Connect/Disconnect.
5. **Environment** — Project-specific env variable tablosu. Key | Value (masked if secret) | Type (string/number/secret/bool). Add / Edit / Delete. (Bu eski mockup'ta yoktu, Eray spesifik istedi.)
6. **Danger** — Archive project (amber) / Reset memory (red) / Delete project (red, type-to-confirm).

---

## 4. Tasarım Disiplini (Vercel-style)

### 4.1 Renk Kullanımı (PALETTE-v3.md'den)

- Background: `#0A0814` (purple-tinted black) almost everywhere
- Border: `rgba(255,255,255,0.08)` — region separator
- Accent (purple `#A855F7`): **sadece** active nav, primary CTA, focus ring
- Signal (pink `#EC4899`): **sadece** live data pulse (running pipeline status dot)
- Semantic: success/warning/danger için dot + text — fill yok
- Glow: yok (Vercel hiç glow kullanmıyor)

### 4.2 Tipografi

- **Inter** 400/500/600 — UI default
- **JetBrains Mono** 400/500 — ID'ler, timestamps, code, file paths
- **Display fontu YOK** — h1 hero hiçbir yerde 24px üstü değil
- Size scale: 12 (caption) / 13 (compact body) / 14 (body) / 16 (h3) / 20 (h2) / 24 (h1)
- Line height: 1.4 default, 1.5 reading content

### 4.3 Layout

- Sidebar 48px collapsed (default), 200px expanded
- Top bar 48px
- Content area max-width yok — full bleed
- Content padding: 24px horizontal, 16-24px vertical
- Row height: 40-48px (Vercel'deki Deployments satır yüksekliği gibi)
- Border-radius: 6px her yerde
- Density: yüksek — 14px body, low whitespace, tablo tarzı

### 4.4 Components

- **Button:** solid accent (primary) / outline (secondary) / ghost (tertiary). Height 32px, padding 12-16px. Border-radius 6px.
- **Input:** Background `#14101F` (bg-1), border `rgba(255,255,255,0.10)`, focus ring purple. Height 32px.
- **Badge:** 11px text, padding 2-8px, border-radius 4px. Background color renk-coded ama %12-15 alpha (subtle).
- **Status dot:** 8px circle, renkli. Pulse animasyonu **sadece** "running" durumunda.
- **Tab:** underline-style. Active = purple underline + accent text.
- **Table:** No bg, border-bottom row separator. Hover: bg-1 subtle. Header row: caption tipografisi, uppercase letter-spacing.
- **Drawer:** Sağdan 480px slide. Backdrop: rgba(0,0,0,0.5), no blur.
- **Modal:** Center, 600px max. Backdrop ile blur.

### 4.5 Animasyon

- Sadece micro (200ms ease-out)
- Slow spin, sürekli pulse — YOK
- Status pulse — sadece running state, 1.6s interval, subtle

### 4.6 İkonlar

- **Lucide** (gri tonları default, accent purple on active)
- Size: 16px sidebar/inline, 14px badges/status, 20px primary CTA

---

## 5. Mock Data — Acme CRM (korunur)

Eski mockup'ın sample data'sı korunur:
- 14 ajan
- 4 Epic (E-001 Authentication, E-002 Billing, E-003 Dashboard, E-004 Admin)
- 13 task/bug/debt
- 6 Decision (D-001..D-006)
- 5 Learned (L-001..L-005)
- 4 Handover
- 3 Pending approval (now expandable to 6-8 including reports + blueprint + deploy)

---

## 6. Eski Mockup'tan Atılanlar

| Eski | Neden atıldı |
|---|---|
| Orbit ekranı | Fancy radial constellation — Mission Control için iyiydi ama "operasyon merkezi" hissine uymuyor. Bilgi var ama karar aleti değil. |
| Landing | Tek proje paradigmasında gereksiz — `kortext start` direkt Overview açar |
| Task Detail (ayrı route) | Drawer içinde gösterilir, ayrı route'a gerek yok |
| Agents (ayrı route) | Library / Agents tab'a indi |
| References (ayrı route) | Library / References tab'a indi |
| Reports (ayrı route) | Approvals'da type filter olarak indi |
| Workflows (ayrı route, visual flow diagram) | Library / Workflows tab'da markdown editor olarak indi. Görsel diagram v1.0 sonrası eklenebilir. |
| Status bar | Bilgisi Overview KPI tile'larına taşındı |
| Floating terminal | Gereksiz — backend tarafı zaten görünmüyor |
| Party Mode panel | v1.0 sonrası — şu an gereksiz karmaşıklık |
| Command Palette ⌘K | Korunur — sade ve güçlü, Vercel'de de var |

---

## 7. Sıradaki Adım

1. Bu concept'i baz alarak `wireframe-v3-ops-center.html` üret (low-fi tek HTML mockup, 7 route)
2. Eray browser'da gez, ekran-bazlı feedback
3. Onay sonrası: Faz 6 (React dashboard) implementasyonu bu tasarımdan port edilir
