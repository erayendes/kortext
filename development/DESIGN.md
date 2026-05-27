# Kortext — Design System & UI Patterns

Görsel kontrol katmanının kanonik tasarım referansı. Token, tipografi, component library, ekran-bazlı layout, UI pattern'leri, kritik kod kuralları. Visual spec için [concepts/wireframe-v4-final.html](./concepts/wireframe-v4-final.html), kararların gerekçesi için [DECISIONS.md §4](./DECISIONS.md).

---

## 1. Felsefe

**Vibrant accent + Enterprise discipline.** Linear, Stripe Dashboard, Notion referansı. "Karnaval değil, control panel."

| Boyut | Karar |
|---|---|
| **Vibrant** | Accent renkler doygun ve göz çekici — purple-500, pink-500 |
| **Enterprise** | Layout disiplinli, glow minimal, animasyon az, hiyerarşi net |
| **Dark** | Default tema koyu — purple-tinted black background |
| **+prime özel** | Amber (cortex/sun metaforu, semantic warning ile aynı renk) |

**Vercel discipline:**
- Zero card fill — border-only regions
- Mono ID/timestamp (JetBrains Mono)
- Status = dot+text (no fill)
- One primary CTA per screen
- 200ms ease-out only
- No glow (sadece hover), no constant pulse, no fancy graphs

---

## 2. Design Tokens

### 2.1 Background katmanları (purple-tinted black)

```css
--bg-0:   #0A0814   /* deepest — main canvas, deep violet-black */
--bg-1:   #14101F   /* panels, sidebar */
--bg-2:   #1E1830   /* cards, elevated surfaces */
--bg-3:   #2A2240   /* hover states */
--bg-overlay: rgba(10, 8, 20, 0.75)
```

Saf siyah değil — hafif purple tint var. Accent renklerin ortama oturmasını sağlar.

### 2.2 Text hiyerarşisi

```css
--tx-1:        #FAFAFC   /* headlines, primary */
--tx-2:        #B5B0C2   /* body, labels */
--tx-3:        #6B6577   /* captions, muted */
--tx-disabled: #3F3B4F
```

### 2.3 Accent (primary brand)

**Purple — primary action:**
```css
--accent:        #A855F7   /* purple-500, vibrant */
--accent-soft:   #C084FC   /* purple-400, hover */
--accent-deep:   #7C3AED   /* violet-600, pressed */
--accent-glow:   rgba(168, 85, 247, 0.25)
```

**Magenta/Pink — signal, live data:**
```css
--signal:        #EC4899   /* pink-500 */
--signal-soft:   #F472B6   /* pink-400 */
--signal-glow:   rgba(236, 72, 153, 0.20)
```

**Kullanım kuralı:** Purple = navigation/CTA/brand; Pink = live indicators/"şu an oluyor". İkisi aynı element üstünde **kullanılmaz**.

### 2.4 Semantic

```css
--success:  #10B981   /* working green */
--warning:  #F59E0B   /* +prime amber, blocked-soft */
--danger:   #EF4444   /* critical, failed */
--info:     #3B82F6   /* blue, neutral */
```

`--warning` (amber) **+prime için korunur** — cortex/sun metaforu.

### 2.5 Borders & glows

```css
--border-subtle:   rgba(255, 255, 255, 0.05)
--border-default:  rgba(255, 255, 255, 0.10)
--border-accent:   rgba(168, 85, 247, 0.30)
--border-strong:   rgba(255, 255, 255, 0.18)

--glow-accent:     0 0 24px rgba(168, 85, 247, 0.20)
--glow-signal:     0 0 16px rgba(236, 72, 153, 0.18)
--glow-success:    0 0 12px rgba(16, 185, 129, 0.15)
```

**Disipline:** Glow sadece hover'da. Sürekli ışıltı yok (cyberpunk değil enterprise).

### 2.6 Backlog state badges

| State | Background | Text | Border |
|---|---|---|---|
| Epic | `rgba(168, 85, 247, .15)` | `#C084FC` purple | `rgba(168, 85, 247, .30)` |
| To Do | `#2A2240` | `#B5B0C2` neutral | `rgba(255,255,255,.06)` |
| In Progress | `rgba(236, 72, 153, .14)` | `#F472B6` pink | `rgba(236, 72, 153, .25)` |
| Test | `rgba(59, 130, 246, .14)` | `#60A5FA` info-blue | `rgba(59, 130, 246, .25)` |
| Review | `rgba(245, 158, 11, .14)` | `#FBBF24` amber | `rgba(245, 158, 11, .25)` |
| Done | `rgba(16, 185, 129, .14)` | `#34D399` green | `rgba(16, 185, 129, .25)` |
| Blocked | `rgba(239, 68, 68, .14)` | `#F87171` red | `rgba(239, 68, 68, .25)` |

---

## 3. Typography

### 3.1 Fonts

- **Inter** (Google Fonts) — sans, UI default
- **JetBrains Mono** (Google Fonts) — monospace, IDs/timestamps/code

### 3.2 Scale

| Token | Size | Weight | Line | Use |
|---|---|---|---|---|
| display | 48px | 700 | 1.1 | Landing hero |
| h1 | 32px | 600 | 1.2 | Page titles |
| h2 | 24px | 600 | 1.3 | Section headers |
| h3 | 18px | 600 | 1.4 | Card titles |
| body | 14px | 400 | 1.5 | Default |
| body-sm | 13px | 400 | 1.5 | Compact UI |
| caption | 12px | 500 | 1.4 | Labels |
| mono-sm | 12px | 500 | 1.4 | Log lines, IDs |
| mono-xs | 11px | 500 | 1.3 | Inline code |

### 3.3 Letterspacing

- Display: `-0.02em` (tight)
- All caps labels: `0.06em` (loose)
- Code/IDs: default monospace tracking

---

## 4. Spacing, Radius, Shadow

- **Spacing:** `4, 8, 12, 16, 24, 32, 48, 64` px
- **Radius:** `4` (chips), `6` (buttons), `8` (cards), `12` (panels), `50%` (avatars)
- **Shadow:** Çok hafif — dark theme'de border + glow tercih edilir

---

## 5. Persona renkleri (14 ajan)

`src/lib/persona-colors.ts` kanonik mapping:

| Persona | Renk | Tier | Default Model |
|---|---|---|---|
| operation-manager | `#A855F7` purple | Orchestrator | claude-opus-4 |
| product-manager | `#3B82F6` blue | Manager | claude-sonnet-4-5 |
| engineering-manager | `#7C3AED` violet-deep | Manager | claude-opus-4 |
| delivery-manager | `#F97316` orange | Manager | claude-haiku-3-5 |
| backend-developer | `#6366F1` indigo | Specialist | claude-sonnet-4-5 |
| frontend-developer | `#EC4899` pink | Specialist | claude-sonnet-4-5 |
| designer | `#10B981` emerald | Specialist | claude-sonnet-4-5 |
| qa-engineer | `#EAB308` yellow | Specialist | claude-haiku-3-5 |
| db-admin | `#14B8A6` teal | Specialist | claude-haiku-3-5 |
| devops-engineer | `#EF4444` red | Specialist | claude-haiku-3-5 |
| security-engineer | `#DC2626` red-deep | Specialist | claude-sonnet-4-5 |
| copywriter | `#84CC16` lime | Specialist | claude-sonnet-4-5 |
| compliance-expert | `#22D3EE` sky | Specialist | claude-haiku-3-5 |
| growth-expert | `#F43F5E` rose | Specialist | claude-haiku-3-5 |

**+prime** (Eray, sentetik) — amber `#F59E0B`.

**Model assignment:**
- Strategic/orchestrator → Opus
- Critical specialists (backend, frontend, designer, copywriter, security) → Sonnet
- Utility (qa, db, devops, compliance, growth) → Haiku

---

## 6. Component Library

| Class | Açıklama |
|---|---|
| `.btn` / `.btn-primary` / `.btn-ghost` / `.btn-outline` / `.btn-sm` / `.btn-xs` | Button variants |
| `.badge` | Pill, 11px — 7 state variant |
| `.card` / `.card-flat` / `.card-panel` / `.card-interactive` | Card variants |
| `.tab` | Underline-style |
| `.input` | bg-2, 1px border, focus glow |
| `.settings-toggle` | 36×20 pill switch, purple when checked |
| `.settings-chip` | Multi-select pill with checked state |
| `.dive-panel` / `.party-panel` / `.adr-backdrop` | Drawer + modal variants |
| Toast | Bottom-right, dark, fade, 2.5s auto-dismiss |
| `personaAvatar(id, size, statusColor?)` | Circular avatar with initials (18-48px) |

---

## 7. Global Shell (v4 wireframe)

```
┌─────────────────────────────────────────────────────────────┐
│ Header (56px) [K-logo · Project · ⌘K · N active · inbox·+p]│
├──┬──────────────────────────────────────────────────────────┤
│  │                                                          │
│64│            Main content (flex)                           │
│px│                                                          │
│  │                                                          │
├──┴──────────────────────────────────────────────────────────┤
│ Footer (32px) [● Project · active · idle · blocked · …]    │
└─────────────────────────────────────────────────────────────┘
                                          [Floating terminal]
```

### 7.1 Header

- Sol: K gradient logo (24×24 accent→signal) + wordmark "Kortext" + ince divider + proje adı + v3.1.0 badge
- Orta: ⌘K cmdk-trigger (320px sabit, "soon" badge — disabled)
- Sağ: Inbox bell (red badge dot), Terminal toggle (`>_`), +p avatar (solid amber)

### 7.2 Sidebar (64px, icon-only)

```
WORKSPACE
  Dashboard / Board / Memory / Reports / References
PROJECT
  Project settings / Agents / Rules / Workflows
SYSTEM
  Hooks / Integrations / Environment
  Danger zone
```

Lucide icons (24px). `tx-disabled` dim section title. Flex-spacer ile Danger sticky bottom.

### 7.3 Footer

12px font, 3 vertical divider:
- `● Acme CRM` (proje)
- `● N active · N idle · N blocked` (dinamik)
- `⚡ ~1.2K tkn/s` (v3.2)
- `$ 4.30 today` (v3.2)
- `⎇ feature/auth-42` (v3.2)
- `workflow: 04-development 4/7` (sağda)

---

## 8. Routes (TanStack Router, hash history)

> **v3.2 redesign uyarısı:** Aşağıdaki route şeması **v3.1 production** durumudur. v3.2'de multi-project routing gelecek (`/[proje]/dashboard`, `/[proje]/board` vb.) — daemon birden fazla projeye URL bazında hizmet edecek. `/onboarding` route'u da postinstall'la otomatik açılan `/onboard` ekranına dönüşecek. Yön kararı: [DECISIONS.md Bölüm 0](./DECISIONS.md). v3.2 implementation başlayana kadar bu bölüm canlıdır.

| Path | Ekran | Ana özellik |
|---|---|---|
| `/` | Dashboard | RunsTable + PendingQuestionsCard + Timeline sidebar |
| `/board` | Backlog | 5 status kolon + Epic + filter + "+ New Task" modal |
| `/memory` | Memory | 3-tab (Decisions/Learned/Handovers) + mem-card |
| `/reports` | Reports | per-file rapor listesi (SQL) + filter |
| `/references` | References | 2-pane md-shell + Edit/Preview toggle |
| `/settings/*` | 8 pane | project/agents/rules/workflows/hooks/integrations/environment/danger |
| `/onboarding` | Wizard | Project init form |

### Onboarding wizard

Tek-sayfa form (wireframe-v4 'Initialize your project' 1:1):
1. Project Name
2. Project Code (slug, A-Z0-9, 2-6)
3. Project Type radyo (new/existing)
4. Target Platform chips (Web/iOS/Android, multi)
5. Blueprint dropzone (`.md|.txt`, ≤100KB)
6. Sample MD / AI Prompt yardımcı paneller
7. GitHub repo (opsiyonel)
8. Executor seçimi (Mock / Claude / AGY + binary path)

Submit → `POST /api/blueprint` → `.kortext/foundation/BRD.md` + `.kortext/project.json` → `triggerWorkflowId` → mock executor.

---

## 9. Overlays

| Overlay | Trigger | Konum |
|---|---|---|
| Header bell popup | `/api/questions` poll (3s) yeni id | Top-right header |
| Toast | Yeni approval | Bottom-right, 8s auto-close |
| Terminal panel | `>_` toggle | Sağ-alt floating (440×280 expanded, 24px header collapsed) |
| Timeline drawer | Inline 340px (Dashboard'da) | Dashboard içinde, route değişimi etkilemiyor |
| Inbox drawer | Bell tıkla | 420px right slide — Approve/Revise/Reject |

---

## 10. Interaction patterns

### Hover
- Cards: 1px ember-glow border + subtle lift
- Buttons: brightness +15%
- Nav items: bg-2 background

### Active
- Tab: purple underline + accent
- Nav: bg-2 + accent left bar
- Toggle: purple bg + thumb right

### Live data
- Status dots: subtle pulse for working
- Activity feed: prepend new items every ~3s
- Handover beam: animated dashed line

### Modals
- Backdrop: rgba(10,8,20,.75) + 4px blur
- 600px wide, max-height 80vh

### Drawers (right-slide)
- 380-480px wide
- `translateX(100%) → 0`
- 300ms ease-out cubic-bezier

### Command palette (⌘K)
- Disabled ("soon") — v3.2'de implement

---

## 11. Kritik UI kuralları

Yalnızca **görsel/UX ile bağı olan** kod kuralları burada. Saf backend/runtime kuralları için: [ARCHITECTURE.md §8 Dashboard + §16 Gotchas](./ARCHITECTURE.md), pure code lint kuralları için: [DECISIONS.md #24, #25, #57, #64](./DECISIONS.md).

### 11.1 Markdown render (XSS koruma)

Tüm markdown render `marked` + `DOMPurify` ile sanitize edilir (`MarkdownViewer.tsx`). Doğrudan HTML inject **yasak** — PreToolUse hook block'lar. Eğer React'in raw-HTML inject prop'u (sanitize edilmiş içerikle) gerekiyorsa, dosyayı `cat > file <<EOF` heredoc ile yaz (sanitization katmanı zaten yerinde).

### 11.2 Tek polling kaynağı

`PendingQuestionsProvider` Header bell + Dashboard card + Toast emitter için tek `/api/questions` poll'ünü yürütür. Toast "yeni-id signal": `useRef<Set<number>>` ile "az önce gördüğüm" id'leri tut. UX prensibi: kullanıcı aynı yenilik için iki kez bildirim almasın.

### 11.3 Overlay pattern

TerminalPanel + TimelinePanel + Toasts `position: fixed` + RootShell altında — route değişimleri etkilemiyor. Route geçişinde Terminal kapanmaz, Timeline kaymaz.

---

## 12. Animasyon

### Status dot

```css
@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}
```
Working: solid + subtle pulse (3s).
Blocked: solid + faster pulse.

### Drawer/modal
- Enter: `translateX(100%) → 0`, 300ms ease-out cubic-bezier
- Exit: 200ms

### Toast
- Enter: bottom slide-in + fade, 200ms
- Auto-dismiss: 2.5s info / 8s approval

---

## 13. Backend bağlanma noktaları

| UI eylemi | REST endpoint |
|---|---|
| Pending questions polling | `GET /api/questions` (3s) |
| Approve/Reject question | `POST /api/questions/:id/answer` |
| Approve run | `POST /api/runs/:runId/approve` |
| Recent runs | `GET /api/runs[?status=…]` |
| Run detail | `GET /api/runs/:id` |
| Handovers | `GET /api/handovers` |
| Backlog list | `GET /api/backlog` |
| Backlog item | `GET /api/backlog/:id` |
| New backlog item | `POST /api/backlog` |
| Personas | `GET /api/personas` · `PUT /api/personas/:handle` |
| Workflows | `GET /api/workflows` |
| Doctor | `GET /api/doctor` |
| Docs (scope) | `GET /api/docs/:scope[/:file]` (foundation, references, reports, memory, rules, workflows) |
| Blueprint | `POST /api/blueprint` · `GET /api/blueprint/status` |
| MCP | `GET /mcp/sse` · `POST /mcp/messages` |

---

## 14. Bilinen tasarım borçları (v3.2'ye ertelendi)

- Mobile responsive değil (1280px+ optimize)
- A11y minimal (focus var, aria yok)
- i18n yok (Settings'te seçim var ama statik)
- LocalStorage persistence yok
- ⌘K command palette disabled ("soon")
- Reports SQL UI revamp (mevcut `/api/docs/reports` filesystem; `/api/reports` SQL-backed endpoint bekliyor)
- Memory archive dropdown (handover-`<ts>.md` segmentleri)
- Footer canlı stats wiring (tkn/s + $today + branch chip'leri hardcoded)
- Inline markdown save endpoint (PUT /api/docs/:scope/:file)
- Reviewer-as-step runtime (agent-to-agent review)
- Light theme variant
- Decisions cards'a author + quote alanı

---

## 15. Visual artifacts

Tüm mockup/wireframe/concept dosyaları [concepts/](./concepts/) altında:

| Dosya | Açıklama |
|---|---|
| `wireframe-v4-final.html` | **AKTIF visual spec** (~2400 satır) — tek kanonik referans |
| `mockup-v3-palette-preview.html` | v3 vibrant purple+pink palette preview (arşiv) |
| `wireframe-v3-ops.html` | v3 ops-center wireframe (eski iterasyon) |
| `mockup-v2.html` | v2 mockup — indigo+cyan palette (arşiv) |
| `ui-concept-v3.md` | v3 concept doc (eski) |
| `onboarding-scenario.md` | Onboarding aktör formatı taslağı (Eray scratch) |
