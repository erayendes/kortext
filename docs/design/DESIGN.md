# Kortext UI — Design System & Screens

> Görsel tasarım referansı + ekran-bazlı layout açıklamaları. Hangi token, hangi component, hangi pattern nerede kullanılıyor.

---

## 1. Design Tokens

### 1.1 Background katmanları
```css
--bg-0:   #0A0A0B   /* deepest — main canvas */
--bg-1:   #111114   /* panels, sidebar */
--bg-2:   #1A1A1F   /* cards, elevated surfaces */
--bg-3:   #25252C   /* hover states */
```

### 1.2 Text
```css
--tx-1:    #F5F5F7   /* headlines, primary */
--tx-2:    #A1A1AA   /* body, labels */
--tx-3:    #52525B   /* captions, muted */
--tx-disabled: #3F3F46
```

### 1.3 Accent (Neural indigo)
```css
--accent:        #6366F1   /* indigo — primary brand */
--accent-soft:   #8B5CF6   /* purple — secondary */
--accent-glow:   rgba(99,102,241,0.18)
--signal:        #06B6D4   /* cyan — live data, active pulse */
```

### 1.4 Semantic
```css
--success:  #10B981   /* working green */
--warning:  #F59E0B   /* amber, +prime */
--danger:   #EF4444   /* critical red */
--info:     #3B82F6   /* signal blue */
--party:    #A855F7   /* party mode purple */
```

### 1.5 Backlog state badges (6 states)
| State | Background | Text |
|-------|------------|------|
| Epic | `rgba(139,92,246,.14)` | `#C4B5FD` purple |
| To Do | `#25252C` | `#A1A1AA` neutral |
| In Progress | `rgba(99,102,241,.14)` | `#818CF8` indigo |
| Test | `rgba(6,182,212,.14)` | `#67E8F9` cyan |
| Review | `rgba(245,158,11,.14)` | `#FBBF24` amber |
| Done | `rgba(16,185,129,.14)` | `#34D399` green |
| Blocked | `rgba(239,68,68,.14)` | `#F87171` red |

### 1.6 Borders & glows
```css
--border-subtle:  rgba(255,255,255,0.06)
--border-default: rgba(255,255,255,0.10)
--glow-accent:    0 0 24px rgba(99,102,241,0.18)
--glow-signal:    0 0 16px rgba(6,182,212,0.20)
```

---

## 2. Typography

### 2.1 Fonts
- **Inter** (Google Fonts) — sans, UI default
- **JetBrains Mono** (Google Fonts) — monospace, IDs/timestamps/code

### 2.2 Scale
| Token | Size | Weight | Line | Use |
|-------|------|--------|------|-----|
| display | 48px | 700 | 1.1 | Landing hero |
| h1 | 32px | 600 | 1.2 | Page titles |
| h2 | 24px | 600 | 1.3 | Section headers |
| h3 | 18px | 600 | 1.4 | Card titles |
| body | 14px | 400 | 1.5 | Default |
| body-sm | 13px | 400 | 1.5 | Compact UI |
| caption | 12px | 500 | 1.4 | Labels |
| mono-sm | 12px | 500 | 1.4 | Log lines, IDs (JBM) |
| mono-xs | 11px | 500 | 1.3 | Inline code |

### 2.3 Letterspacing
- Display: `-0.02em` (tight)
- All caps labels: `0.06em` (loose)
- Code/IDs: default monospace tracking

---

## 3. Spacing, Radius, Shadow

- **Spacing scale:** `4, 8, 12, 16, 24, 32, 48, 64` px
- **Radius:** `4` (chips), `6` (buttons), `8` (cards), `12` (panels), `50%` (avatars)
- **Shadow:** Çok hafif — dark theme'de border + glow tercih edilir, drop shadow minimal.

---

## 4. Component Library

### 4.1 Buttons
- `.btn` — base
- `.btn-primary` — indigo solid
- `.btn-ghost` — transparent + border
- `.btn-sm` — compact
- `.btn-xs` — extra compact

### 4.2 Badges
- `.badge` — pill, 11px
- 7 state variants (todo, progress, test, review, done, blocked, epic/strategic)

### 4.3 Cards
- `.card` — bg-1, border, padding-16
- `.card-flat` — bg-1, border-subtle, no shadow
- `.card-panel` — bg-2, slim card (Kanban)
- `.card-interactive` — hover lift + glow

### 4.4 Tabs
- `.tab` — underline-style, active state
- Used in Memory, Settings, Deep Dive, Reports

### 4.5 Inputs
- `.input` — bg-2, 1px border, focus glow
- `<select class="input">` — same styling

### 4.6 Toggle (Settings)
- `.settings-toggle` — 36×20 pill switch, indigo when checked

### 4.7 Chip (multi-select)
- `.settings-chip` — pill with checked state (Setup platform, Settings appearance)

### 4.8 Drawer / Panel
- `.dive-panel` — 380px right-slide, dark
- `.party-panel` — 480px right-slide with header
- `.adr-backdrop` — modal overlay with blur

### 4.9 Toast
- Bottom-right, dark, fade in/out
- Triggered via `showToast(text)`

### 4.10 Avatar
- `personaAvatar(id, size, statusDotColor?)` — circular avatar with initials
- 14 ajanın her birinde farklı renk
- Size: 18, 20, 24, 28, 36, 40, 48 px

---

## 5. Global Shell

```
┌─────────────────────────────────────────────────────────────┐
│ TopBar (56px) [Logo · Project · ⌘K · Live · User]          │
├──┬──────────────────────────────────────────────────────────┤
│  │                                                          │
│64│            Main content (flex)                           │
│px│                                                          │
│  │                                                          │
├──┴──────────────────────────────────────────────────────────┤
│ StatusBar (32px) [Live audit feed → workflow chip]         │
└─────────────────────────────────────────────────────────────┘
                                          [Floating terminal]
```

### 5.1 TopBar
- Sol: Logo SVG (28px) + wordmark "Kortext" + ince divider + proje adı "Acme CRM" + version chip
- Orta: ⌘K search trigger
- Sağ: `● 6/14 active` live indicator + bildirim icon + user avatar

### 5.2 Sidebar (collapsed icon-only, 64px)
Nav items (top to bottom):
1. Orbit (orbit icon)
2. Backlog (clipboard-list)
3. Agents (users)
4. Memory (brain)
5. References (book-open)
6. Reports (bar-chart-3)
7. Inbox (inbox + badge-count)
8. Workflows (git-branch)
9. ─── (separator)
10. Settings (settings, en altta)

### 5.3 StatusBar
KPI chip'ler:
- `● Live · Acme CRM` (proje)
- `👥 6 working` (active agents)
- `⚡ ~1.2K tkn/s` (token rate)
- `$ $4.30 today` (cost)
- `⎇ feature/auth-42` (git branch)
- `🔒 locked` (workspace)
- `📡 online`
- `[party-chip if party active]`
- (Sağa) `workflow: 04-development 4/7`

---

## 6. Ekran-bazlı layouts

### 6.1 Landing (`#landing`)
- **Full-screen**, no chrome (no sidebar/topbar)
- Center: Kortext logo + "Your AI workforce, one mission control." h1 + subtitle + CTA button
- Bottom 3 feature cards: "14 specialized agents", "Workflow-driven execution", "Total visibility"

### 6.2 Setup (`#setup`)
- Centered card (640px max), full-page
- Hero: small logo + "Initialize your project"
- Form fields:
  1. Project Name (text)
  2. Project Code (slug)
  3. Target Platform (checkbox multi-select: Web/iOS/Android/Desktop)
  4. Blueprint (drag-drop zone + "Örnek .md" + "AI Prompt" alternative)
  5. GitHub Repository (optional)
- CTA: `Initialize project →`

### 6.3 Orbit (`#orbit`)
**Layout:** CSS grid `auto 1fr` (header + content)

**Header (40px):**
- "Orbit" title + workflow + step
- Right: ⌘+click to select · click to dive
- Party CTA (visible when 2+ selected)
- Clear button (visible when selected)
- Timeline toggle (visible when timeline hidden)

**Content split (flex row):**
- **Left:** Canvas (flex:1) — SVG 1400×920 viewBox
  - Background: dot grid + radial gradient
  - Slowly rotating outer guide rings (120s spin)
  - +prime hero card (280×110) at center
  - 4 manager cards (240×80) in "+" pattern
  - 10 specialist cards (200×70) radially distributed
  - Color-coded SVG line connections
  - Animated cyan handover beam (op-mgr → backend-dev)
- **Right:** Timeline sidebar (340px, collapsible)
  - Header + close button
  - Filter dropdown + search
  - Scrollable event list (TIMELINE_EVENTS array)

**Card structure (foreignObject inside SVG):**
```html
<foreignObject x=... y=... width=... height=...>
  <div xmlns="http://www.w3.org/1999/xhtml" 
       class="orbit-card working|idle|blocked|prime orbit-node" 
       data-id="agent-id"
       style="--accent:#color;--accent-rgb:r,g,b;"
       onclick="handleNodeClick(event,'id')">
    <!-- row 1: avatar + name + status dot -->
    <!-- row 2: model (mono) -->
    <!-- row 3: task (mono) -->
  </div>
</foreignObject>
```

### 6.4 Backlog (`#backlog`)
**Layout:** flex column, kanban scroll

- Header: title + filter bar (Epic/Persona/Status dropdowns) + view toggle + `+ New Task`
- **6 columns** (horizontal scroll if needed):
  - Epic | To Do | In Progress | Test | Review | Done
- Epic cards: progress bar, child count, owner
- Task/Bug/Debt cards: ID + parent epic + state + agent + meta
- Blocked items: red left-border (any column)
- Click Epic → `openEpicDetail(id)` modal
- Click Task → `showScreen('task')`

### 6.5 Task Detail (`#task`)
- Breadcrumb: `Backlog / E-001 / T-101`
- Header: ID + title + state badge + transition buttons (→ Test, → Done)
- 2-column body:
  - **Sol (60%):**
    - Description (markdown rendered)
    - Acceptance Criteria checklist + progress
    - Audit Trail timeline
    - Comments section
  - **Sağ (40%):**
    - Assigned Agent card
    - Details (epic, status, assigned)
    - Blockers (tasks bu task'ı bağlıyor)
    - Blocking (bu task'ı bekleyen tasks)
    - Related files

### 6.6 Agents (`#agents`)
- Header: "Agents · 14 personas · 6 active" + search
- **4-column grid** (sm: 2-col)
- Her ajan kart: avatar + name + state dot + role + active task + stats
- Tıklayınca → `openDeepDive(id)` panel

### 6.7 Memory (`#memory`)
- Header: title + subtitle "Collective intelligence of Acme CRM"
- **3 tabs:**
  - **Decisions** (6 cards) — title + rationale + agent + date + tags + expand
  - **Learned** (5 cards) — lesson + context + impact + source task
  - **Handovers** (4 cards) — from → to + next steps + files + timestamp
- Tüm kartlar expandable (chevron + "View"/"Close")
- Handover dosya linkleri → file viewer modal

### 6.8 Inbox (`#inbox`)
- Header: "Inbox · 3 pending"
- 3 approval cards:
  1. Task transition request (copywriter → review)
  2. New task request (backend-dev → engineering-manager approval)
  3. Review complete (qa-engineer → done)
- Her kart: header + details chevron + Approve / Reject buttons
- **Reject form** (hidden until clicked): reason textarea (5+ char required) + optional instructions + Send button (disabled until valid)
- "All caught up" empty state

### 6.9 References (`#references`)
- Header: title + "Context documents & knowledge base"
- 2x3 card grid:
  - blueprint.md (product vision)
  - tech-stack.md (architecture)
  - components/dashboard.fig (design asset)
  - references/brand-voice.md
  - decisions/ADR-003-auth-strategy.md
  - Upload zone (empty slot)
- Click kart → `openFileViewer(fileKey)` modal

### 6.10 Reports (`#reports`)
- Header: title + "Acme CRM · Day 4" + "2 pending review" badge
- 3 report cards stacked:
  1. **Daily Status Report — Day 4** (Pending Review, op-manager)
  2. **Sprint Progress — Week 1** (Pending Review, delivery-manager)
  3. **Security Audit** (Approved, security-engineer)
- Her rapor 3 modda:
  - **view:** `<pre>` markdown content + actions (Approve, Request revision, Edit)
  - **edit:** `<textarea>` ile inline edit + Save/Cancel
  - **revise:** feedback textarea (5+ char required) + Send revision
- State badge da güncellenir (Approved ✓ / Revision requested ↩)

### 6.11 Workflows (`#workflows`)
**Layout:** 2-column grid (flow + detail panel)

**Sol (flow):**
- Top: 4 workflow chips (04-development-cycle active, 01-analysis, 02-design, others)
- Done phase strip (3 phases): 01 Analysis ✓, 02 Design ✓, 03 Planning ✓
- **Active phase block (Phase 04):** Implementation & Code Review
  - Active agents badges + tasks + progress
  - "Show more" expand
- **Decision gate ◇:** "Code Review Gate · Does code pass review?"
  - PASS → down to next phase
  - FAIL → loop-back arrow (red callout) → back to 04
- Continued: Phase 05 (Testing), QA Gate, Phase 06 (Staging), Release Gate, Phase 07

**Sağ (detail panel):**
- Current step info
- Progress bar
- Active tasks list
- Blockers list
- Legend (color codes)

### 6.12 Settings (`#settings`)
**Layout:** 2-column (200px nav + content)

**Left nav (6 tabs):**
1. General
2. Models
3. Hooks
4. Integrations
5. Appearance
6. ─── Danger Zone (red)

**Pane contents:**
- **General:** Project (name/code/version/platform/repo/blueprint) + Workspace (path/auto-commit/PR approval toggles)
- **Models:** 14 agent rows (avatar + tier + model select + cost rating) + Quick presets (All Opus/Sonnet/Haiku/Balanced) + Cost estimate ($4.30/day, ~$129/mo) + Token limits
- **Hooks:** 9 lifecycle hook rows with toggles (PreToolUse, PostToolUse, UserPromptSubmit, SessionStart/End, TaskCreate enabled; HandoverStart, PartyStart, BlockerDetected disabled)
- **Integrations:** 7 service cards (GitHub/Vercel/Stripe/Auth0 connected; Slack/Linear/Sentry available)
- **Appearance:** Theme cards (Dark active, Light/System v0.2) + Language select + Density chips
- **Danger:** Archive (amber) + Reset Memory (red) + Delete Project (red, type-to-confirm)

---

## 7. Interaction patterns

### 7.1 Hover states
- Cards: 1px ember-glow border + subtle lift
- Buttons: brightness +15%
- Nav items: bg-2 background

### 7.2 Active state
- Tab: indigo underline + accent color
- Nav item: bg-2 + accent left bar
- Toggle: indigo bg + thumb right

### 7.3 Live data
- Status dots: pulse animation for working
- Activity feed: prepend new items every 4s
- Handover beam: animated dashed line

### 7.4 Modals
- Backdrop: rgba(0,0,0,0.7) + 4px blur
- Modal: 600px wide, max-height 80vh
- Close: × icon top-right OR click backdrop

### 7.5 Drawers (right-slide)
- 380-480px wide
- transform: translateX(100%) → 0
- 300ms ease-out cubic-bezier

### 7.6 Command palette (⌘K)
- Center modal, dark
- Search input + quick navigation + recent tasks
- ↑↓ navigate · ⏎ select · ESC close

---

## 8. SVG patterns

### 8.1 Pulse ring animation
```css
@keyframes nodeRingPulse {
  0%   { r: 20; stroke-opacity: 0.7; }
  70%  { r: 36; stroke-opacity: 0; }
  100% { r: 36; stroke-opacity: 0; }
}
```

### 8.2 Slow spin (Orbit guide rings)
```css
@keyframes slowSpin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
```

### 8.3 Pulse (status dot for blocked)
```css
@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
```

### 8.4 Handover beam (Orbit)
```svg
<line stroke="url(#beamGradV)" stroke-dasharray="6 4">
  <animate attributeName="stroke-dashoffset" values="20;0" dur="0.8s" repeatCount="indefinite"/>
  <animate attributeName="stroke-opacity" values="0.3;1;0.3" dur="2.4s" repeatCount="indefinite"/>
</line>
```

### 8.5 Dot grid background
```svg
<pattern id="dotGrid" width="28" height="28" patternUnits="userSpaceOnUse">
  <circle cx="1" cy="1" r="0.9" fill="rgba(255,255,255,0.04)"/>
</pattern>
<rect width="..." height="..." fill="url(#dotGrid)"/>
```

---

## 9. Special components

### 9.1 +prime hero card (Orbit)
- Amber gradient background
- 32px sun avatar with radial gradient
- KPI inline strip: `6/14 active · 1.2K/s tkn · 1 blocked`
- Progress bar (workflow %)
- LEAD badge

### 9.2 Avatar with status (Orbit cards)
```html
<div class="orbit-card-avatar">XX</div>
<!-- 24px circle, accent border, mono font, glow shadow -->
```

### 9.3 Handover beam (decorative)
- Linear gradient with mid-stop opaque cyan
- Animated dash offset for "flowing" effect

### 9.4 Status indicator dots
- Working: `#10B981` + `box-shadow: 0 0 8px`
- Idle: `#52525B` + ring
- Blocked: `#EF4444` + `pulse` animation

---

## 10. Renderer helpers (JS)

### 10.1 `renderHTML(el, html)`
Safe DOM write — uses `replaceChildren + insertAdjacentHTML` (NOT `innerHTML =`, which is blocked).

### 10.2 `personaAvatar(id, size, statusColor?)`
Returns HTML string for circular avatar based on `KORTEXT_PALETTE`.

### 10.3 `showToast(text)`
Bottom-right toast with auto-dismiss after 2.5s.

### 10.4 `escapeHTML(str)`
XSS-safe escape for dynamic content.

### 10.5 `switchScreen(name)` (internal `showScreen`)
Hash routing + section toggle + re-render screen-specific data.
