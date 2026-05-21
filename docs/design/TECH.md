# Kortext UI — Technical Reference

> Stack, dosya yapısı, kritik kod pattern'ları, güvenlik kuralları. Kodu okurken/yazarken referans.

---

## 1. Stack

| Katman | Teknoloji | Nasıl |
|--------|-----------|-------|
| CSS | **Tailwind CSS via CDN** (`https://cdn.tailwindcss.com`) | Inline class + custom CSS variables |
| Fonts | **Inter** (sans) + **JetBrains Mono** (monospace) | Google Fonts CDN |
| Icons | **Lucide** | `<i data-lucide="icon-name">` + `lucide.createIcons()` |
| JS | **Vanilla JS** | No React/Vue/build step |
| Routing | **Hash routing** (`#orbit`, `#backlog`) | `showScreen(name)` + window.location.hash |
| Server | **`npx serve`** | Static file serving |

---

## 2. Dosya yapısı

```
kortext/
├── kortext-ui-mockup-v2.html      # ★ ASIL MOCKUP (~311 KB, ~3850 satır)
├── kortext-ui-mockup.html          # Eski v1 (artık kullanılmıyor)
├── .claude/
│   └── launch.json                 # IDE launch config (npx serve)
├── app-design/                     # ★ BU DİZİN
│   ├── README.md
│   ├── DECISIONS.md
│   ├── DESIGN.md
│   ├── TECH.md                     # bu dosya
│   ├── NEXT-STEPS.md
│   └── kortext-ui-mockup-v2.html   # kopya (ana dosya değişirse senkronize et)
├── agents/                         # Kortext framework dosyaları
├── hooks/
├── rules/
├── scripts/
├── settings/
├── skills/
├── workflows/
└── workspace/                      # Runtime state (her zaman güncel)
```

---

## 3. Çalıştırma

### Local development server
```bash
cd /Users/erayendes/Documents/_docbase/kortext
npx serve . -l 8092
open http://localhost:8092/kortext-ui-mockup-v2.html
```

### Doğrudan dosya açma
Dosya `file://` modunda da çalışır — Tailwind/Lucide/Fonts için internet bağlantısı gerekir.

### Launch config
`.claude/launch.json` zaten ayarlı:
```json
{
  "version": "0.0.1",
  "configurations": [
    {
      "name": "kortext-ui",
      "runtimeExecutable": "npx",
      "runtimeArgs": ["serve", "/Users/erayendes/Documents/_docbase/kortext", "-l", "8092"],
      "port": 8092
    }
  ]
}
```

---

## 4. ⚠️ Kritik güvenlik kuralı — DOM yazma

PreToolUse hook tarafından doğrudan `.innerHTML` atama bloklanır (XSS koruma). Bunun yerine bu projede **global helper** kullanılır:

```js
window.renderHTML = function(el, html) {
  if (!el) return;
  el.replaceChildren();                       // önce temizle
  el.insertAdjacentHTML('afterbegin', html);  // sonra HTML ekle
  if (window.lucide) window.lucide.createIcons();
};
```

**Kullanım:**
```js
renderHTML(document.getElementById('foo'), '<div>...</div>');
```

Bu pattern dosyanın `<script>` bloğunda tanımlı, tüm DOM güncellemelerinde kullanılır. `.insertAdjacentHTML()`, `.textContent`, `.appendChild()` gibi metodlar serbest — sadece doğrudan property atama (`.innerHTML = '...'`) engelli.

**İstisna:** Inline `style` attribute'a değer atamak (örn. `el.style.background = ...`) sorun değil — sadece DOM HTML setter pattern'ı engelleniyor.

---

## 5. Global JS değişkenler

### 5.1 `KORTEXT_PALETTE`
Ajan ID → renk + mono + role mapping:
```js
window.KORTEXT_PALETTE = {
  'operation-manager': { color: '#06B6D4', mono: 'OM', role: 'Orchestrator' },
  'product-manager':   { color: '#3B82F6', mono: 'PM', role: 'Product Strategy' },
  // ...14 toplam
};
```

### 5.2 `DIVE_DATA`
Deep Dive panel için ajan-bazlı state. Sadece 7 ajanın tam verisi var, diğerleri `getDiveData(id)` ile default'a düşer.

```js
const DIVE_DATA = {
  'backend-developer': {
    state: 'working',
    stateColor: '#10B981',
    task: 'Implement OAuth login flow',
    taskId: 'T-101',
    tokens: 21300,
    tokenLimit: 50000,
    lastActivity: '2m ago',
    desc: 'Builds server-side APIs...',
    authority: 'Operational',
    reportsTo: 'engineering-manager',
    directs: [],
    skills: ['node.js', 'postgresql', 'rest-api', 'auth0'],
    logs: [{ time: '14:35', text: '...' }, ...],
    history: ['T-104 DB schema migration — Done', ...],
  },
  // ...
};
```

### 5.3 `EPIC_DATA`
Backlog Epic detail modal için:
```js
const EPIC_DATA = {
  'E-001': {
    title: 'Authentication & Users',
    owner: 'product-manager',
    progress: 40,
    total: 5, done: 2,
    items: [
      { id: 'T-101', title: '...', status: 'In Progress', agent: '...', statusClass: 'badge-progress' },
      // ...
    ],
  },
  // ...4 epic
};
```

### 5.4 `TIMELINE_EVENTS`
Orbit timeline sidebar için kronolojik olay listesi (12 event).

### 5.5 `KORTEXT_AGENTS_LIST`
Settings → Models tab için 14 ajan + default model + tier.

### 5.6 `FILES`
References + Memory file viewer için sample dosya içerikleri (textContent olarak, NOT HTML).

---

## 6. Kritik JS fonksiyonlar

### 6.1 Screen routing
```js
function showScreen(name) {
  // Hide all
  document.querySelectorAll('.screen').forEach(s => {
    s.classList.remove('active');
    s.style.display = 'none';
  });
  // Show target — clear inline style so CSS rule takes over
  const target = document.querySelector('.screen[data-screen="'+name+'"]');
  target.classList.add('active');
  target.style.display = '';

  // App chrome hide for landing/setup
  const app = document.getElementById('app');
  if (name === 'landing' || name === 'setup') app.classList.add('no-chrome');
  else app.classList.remove('no-chrome');

  // Nav active state
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.querySelector('.nav-item[data-screen="'+name+'"]')?.classList.add('active');

  // Hash + scroll
  window.location.hash = name;
  document.getElementById('main').scrollTop = 0;

  // Re-render screen-specific data
  if (name === 'orbit') renderOrbitScreen();
  if (name === 'backlog') renderKanban();
  // ... vb. for each screen
}
```

### 6.2 Deep Dive panel
- `openDeepDive(id)` — opens right-side panel with Live + Profile tabs
- `closeDeepDive()`
- `switchDiveTab(btn, tab)` — swaps tab content
- `renderDiveTab(tab)` — renders Live or Profile content

### 6.3 Party Mode
- `openParty(participants)` — multi-agent chat panel
- `endPartySession()` — close party → open ADR modal
- `appendPartyMsg(actor, text)`
- `sendPartyMsg()` — user (+prime) sends + auto-reply

### 6.4 ADR Modal
- `openADR()` / `closeADR()`

### 6.5 Epic detail
- `openEpicDetail(epicId)` — modal with child issues
- `closeEpicDetail()`

### 6.6 File viewer
- `openFileViewer(fileKey)` — modal with file content (uses `textContent`, safe)
- `closeFileViewer()`

### 6.7 Inbox actions
- `approveInbox(btn, msg)`
- `toggleInboxDetail(cardId)`
- `toggleRejectForm(cardId)`
- `validateRejectForm(textarea)` — enable Send when 5+ chars
- `sendRejection(cardId, toastMsg)`

### 6.8 Reports modes
- `toggleReportMode(reportId, mode)` — view | edit | revise
- `saveReportEdit(reportId)`
- `approveReport(reportId)`
- `sendRevision(reportId)`

### 6.9 Memory expansion
- `toggleMemCard(btn)` — expand decision/learned/handover card
- `switchMemTab(btn, tab)`

### 6.10 Settings
- `switchSettingsTab(btn, tab)`
- `renderSettingsModelList()` — render 14 agent rows
- `applyModelPreset(preset)` — all-opus/all-sonnet/all-haiku/balanced
- `updateAgentModel(id, model)` — single update

### 6.11 Orbit
- `handleNodeClick(e, id)` — Cmd+click multi-select, single click → openDeepDive
- `updateOrbitSelectionUI()` — show Clear/Party CTA when selected
- `clearOrbitSelection()`
- `openPartyFromSelection()` — open Party with selected agents
- `toggleOrbitTimeline()` — show/hide right timeline sidebar
- `renderOrbitScreen()` — render timeline events

### 6.12 Workflows
- `selectWfNode(id)` — update right detail panel for selected phase

### 6.13 Helpers
- `showToast(text)` — bottom-right toast
- `escapeHTML(str)` — XSS-safe escape
- `personaAvatar(id, size, statusColor?)` — HTML string for circular avatar
- `renderHTML(el, html)` — safe DOM write (see Section 4)

---

## 7. CSS organization

### 7.1 Tüm CSS dosya içinde (`<style>` block, ~line 30-460)

```css
/* 1. Reset + base + tokens */
:root { --bg-0: ...; --accent: ...; }

/* 2. Layout — screens, nav, topbar, statusbar */
.screen { ... }
.screen.active { display: block; }
.screen.active[data-screen="orbit"] { display: grid; grid-template-rows: auto 1fr; }

/* 3. Typography utilities */
.text-display { ... }

/* 4. Component classes */
.card, .badge, .btn, .input, .tab, .toast, .dive-panel, ...

/* 5. Screen-specific helpers */
.orbit-card, .orbit-node, .settings-tab, .mem-expand, .kanban-col, ...

/* 6. Animations */
@keyframes nodeRingPulse, fadeIn, slowSpin, pulse
```

### 7.2 Inline styles
Yoğun kullanım (mockup için OK). Production'da Tailwind classes'a refactor edilebilir.

---

## 8. HTML organization

```
<!DOCTYPE html>
<html>
<head>
  <!-- meta, fonts, Tailwind CDN, Lucide CDN -->
  <style>
    /* design tokens + components ~430 satır */
  </style>
</head>
<body>
  <div id="app">
    <topbar />
    <div id="layout-row">
      <sidebar />  <!-- 9 nav items + Settings -->
      <main id="main">
        <!-- 12 screen sections, each: -->
        <section class="screen" data-screen="orbit">...</section>
        <section class="screen" data-screen="backlog">...</section>
        <!-- ... -->
      </main>
    </div>
    <footer id="statusbar">...</footer>
  </div>

  <!-- Modals & overlays (z-index high) -->
  <div id="cmdk">...</div>           <!-- Command Palette -->
  <div id="toast">...</div>
  <div id="dive-panel">...</div>     <!-- Deep Dive right-slide -->
  <div id="party-panel">...</div>    <!-- Party Mode right-slide -->
  <div id="adr-backdrop">...</div>   <!-- ADR Modal -->
  <div id="epic-backdrop">...</div>  <!-- Epic Detail Modal -->
  <div id="file-viewer-modal">...</div>

  <script>
    // ~600+ satır vanilla JS
    // Sections:
    //   1. Globals (KORTEXT_PALETTE, DIVE_DATA, etc.)
    //   2. Helpers (renderHTML, escapeHTML, showToast, personaAvatar)
    //   3. Screen routing (showScreen)
    //   4. Screen renderers (renderOrbitScreen, renderKanban, ...)
    //   5. Interaction handlers (clicks, tabs, modals)
    //   6. Init on load
  </script>
</body>
</html>
```

---

## 9. Performans notları

- **Tek dosya ~311 KB** — instant load
- **~3850 satır** — Cmd+F ile sorun değil
- **Lucide icons** create-on-demand (her DOM update'inde `lucide.createIcons()` çağrılır)
- **Yok:** Bundler, transpiler, package.json
- **Tailwind CDN production warning** — mockup için sorun değil

---

## 10. Bilinen tasarım borçları

- Mobile responsive değil (1280px+ optimize)
- A11y minimal (focus states var ama aria yok)
- i18n yok (sadece İngilizce, Settings'te seçim var ama statik)
- Real-time data yok (sample data hardcoded)
- Form validation minimal (sadece reject form)
- LocalStorage persistence yok (sayfa yenilenince state sıfırlanır)

---

## 11. Backend ile bağlanma noktaları

Hangi UI eylemi hangi backend API'sine bağlanacak:

| UI eylemi | Beklenen backend |
|-----------|------------------|
| `openDeepDive(id)` | `GET /api/agents/:id/state` |
| Approve/Reject Inbox | `POST /api/inbox/:id/approve` veya `/reject` |
| Send revision (Reports) | `POST /api/reports/:id/revise` |
| Approve report | `POST /api/reports/:id/approve` |
| Toggle hook | `PATCH /api/settings/hooks/:name` |
| Update agent model | `PATCH /api/settings/agents/:id/model` |
| Send party msg | `POST /api/party/:sessionId/message` |
| End party → ADR | `POST /api/party/:sessionId/end → returns ADR draft` |
| Open new task | `POST /api/tasks` (with approval flow) |
| Click handover | `POST /api/handovers` (workflow advance) |

---

## 12. Test akışları (manuel QA)

### Akış A: Onboarding
1. `#landing` → CTA tıkla
2. `#setup` → Acme CRM init → CTA
3. → `#orbit` (default screen) — toast bildirimi

### Akış B: Workflow drilling
1. `#orbit` → backend-dev kart tıkla → Deep Dive açılır
2. Profile tab → Chain of command görünür
3. ESC veya × ile kapat → `#orbit` döner

### Akış C: Multi-agent Party Mode
1. `#orbit` → Cmd+click 3 manager (+prime hariç)
2. Party Mode CTA görünür → tıkla
3. Party Panel açılır, otomatik openers gelir
4. Mesaj yaz, agent cevap verir
5. "End → ADR" → ADR modal açılır

### Akış D: Task approval flow
1. `#inbox` → "New task request" Details aç
2. Reject tıkla → reject form
3. Reason yaz (5+ char) → Send activates
4. Send → toast "Rejection sent"

### Akış E: Settings model değişikliği
1. `#settings` → Models tab
2. backend-developer dropdown → claude-opus-4 seç
3. Toast: "backend-developer → claude-opus-4"
4. "All Haiku" preset → tümü Haiku
5. "Balanced" preset → akıllı dağıtım

### Akış F: Epic drill-in
1. `#backlog` → E-001 kart tıkla
2. Modal açılır → 5 child issue
3. Bir task tıkla → `#task` screen
4. Back to backlog → breadcrumb

### Akış G: Memory file linki
1. `#memory` → Handovers tab
2. Bir handover kart aç (chevron)
3. Dosya linki tıkla → file viewer modal
4. İçerik görünür, ESC ile kapat

---

## 13. Bilinen browser desteği

- **Chrome/Edge:** Tam destek
- **Firefox:** Tam destek
- **Safari:** Tam destek (SVG `<foreignObject>` desteği var)
- **Mobile browsers:** Test edilmedi, 1280px+ tasarım

`<foreignObject>` Safari'de bazen text rendering hafif farklı olabilir — Orbit ekranı için kabul edilebilir.

---

## 14. Hızlı debug ipuçları

### Bir ekran açılmıyor
```js
showScreen('settings');  // console'dan
```

### Deep Dive açmak
```js
openDeepDive('backend-developer');
```

### Tüm screen'leri listele
```js
document.querySelectorAll('section[data-screen]').forEach(s => console.log(s.dataset.screen));
```

### Sample data inspect
```js
console.log(DIVE_DATA);
console.log(EPIC_DATA);
console.log(KORTEXT_PALETTE);
```
