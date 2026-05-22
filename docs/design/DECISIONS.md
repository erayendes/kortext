# Kortext UI — Design Decisions

> **Bu dosyanın amacı:** Hangi kararı, **neden** verdik. Yeni bir session'da bir şeyi değiştirmeye karar verirken, önce burayı oku — eskiyi neden böyle yaptığımızı anlamadan değiştirme.

---

## 1. Proje-seviyesi kararlar

| Karar | Seçim | Gerekçe |
|-------|-------|---------|
| Hedef kullanıcı | Kod bilmeyen herkes (PM, founder, ürün sahibi) | Kortext'in misyonu zaten bu. Eray (kullanıcı) da kod bilmiyor. |
| Teslim formatı | **Tek interaktif HTML dosyası** | Slayda atılabilir, demo edilebilir, asset yok, build yok |
| Ekran sayısı | **12 ekran** (Landing, Setup, Orbit, Backlog, Task, Agents, Memory, Inbox, References, Reports, Workflows, Settings) | Tüm Kortext akışlarını kapsar |
| Görsel stil | **Mission control / NASA-vari (dark theme)** | Multi-agent orchestration için doğru ton — "uzay üssü" hissi |
| Dil | **Tamamen İngilizce** UI | Hedef kitle global. Sample veriler de İngilizce. |
| Multi-project | **YOK** — her kurulum tek proje | Kortext "framework olarak tek projeye bağlı" — switcher gereksiz |
| Light theme | v0.2'ye ertelendi | Şimdilik dark only |
| Logo | Cortex + context: küçük amber sun ile neural node graph | "cortex" (beyin) + "context" (bağlam) anlamı |

---

## 2. Renk paleti (önemli geçmiş)

**Eski (v1):** Ember/amber dominant — sıcak, ama AI metaforuna uymuyordu  
**Yeni (v2):** **Indigo + cyan signal** — cooler, daha "intelligent" hissi

```
--accent:        #6366F1  (indigo — primary)
--accent-soft:   #8B5CF6  (purple — secondary)
--signal:        #06B6D4  (cyan — live data, active)
--success:       #10B981  (green — working)
--warning:       #F59E0B  (amber — +prime, blocked nodes)
--danger:        #EF4444  (red — blocked, critical)
```

**+prime** rengi **amber** kaldı (cortex/sun metaforu) — diğer node'lardan ayrışsın diye.

---

## 3. Backlog kararları

| Karar | Detay |
|-------|-------|
| Kolon sayısı | **6 kolon**: Epic \| To Do \| In Progress \| Test \| Review \| Done |
| ~~Story~~ kaldırıldı | Framework'te bu görev tipi yok |
| ~~Complexity rozeti~~ kaldırıldı | Framework'te yok, v1.0 sonrasına ertelendi |
| ~~Priority etiketi~~ kaldırıldı | Önceki wireframe'de hataen vardı |
| Epic kartı tıklaması | Modal aç → child issues listele (T-101, B-203, vs.) |
| Blocker/Blocking | Hem kartta görünür, hem detay panelde |
| Sample backlog | 4 Epic (E-001..E-004) + 13 task/bug/debt |
| Bağımlılık badge | Her biri ayrı badge (`→ T-38 ✓`, `→ T-39 ✗`) |

---

## 4. Orbit ekranı — 4 iterasyon sonrası bulundu

Bu ekran tasarımının evrimi:

### v1: Radyal SVG circle graph
- Ring 1 (managers) + Ring 2 (specialists) + +prime center
- **Sorun:** node'lar küçük, ne yaptıkları belli değil, "generic AI mind map" hissi
- Kullanıcı: *"node'ların tasarımı çok kötü. büyüklükleri çok kötü"*

### v2: Mission Floor — pod-based card layout
- 3 squad (Product/Engineering/Delivery) sütun layout
- Her squad'da: manager card + team member list
- **Sorun:** Orbit metaforu kayboldu, "kanban gibi" hissi
- Kullanıcı: *"orbir mantığı iyiydi. tasarım kötüydü"*

### v3: Premium refined radial circles
- Daha büyük circle'lar, gradient fills, glow halos, sun-like +prime
- **Sorun:** Hala "circles in space" — bilgi yok, sadece görsel
- Kullanıcı: *"hala orbitler çok kötü. yepyeni bir yaklaşıma geç"*

### v4: ✅ Radyal yerleşim + dikdörtgen kartlar (FINAL)
- ViewBox 1400×920, `<foreignObject>` ile HTML kart embed
- Her kart: **avatar + name + model + task + status dot**
- **+prime hero card** (280×110) — amber gradient, workflow KPI'ları
- 4 manager (240×80) "+ pattern"
- 10 specialist (200×70) radyal etrafa dağılmış
- SVG line connections renk-kodlu
- Cyan animated handover beam (op-mgr → backend-dev)
- Background: dot grid + radial gradient
- Kullanıcı: *"bu oldu işte"* ✅

**Anahtar prensip:** Radyal yerleşim hiyerarşiyi anlatır, dikdörtgen kartlar durumu anlatır.

### Orbit yan-sidebar Timeline
- Eski: Orbit altında yatay panel (resize edilebilir)
- Yeni: **Sağ sidebar** (340px), collapsible, default açık
- Sebep: Orbit canvas tam yükseklik kazanır, timeline her zaman görünür

---

## 5. Agent palet (14 ajan)

Her ajanın **rolü + rengi + tier'i + default model**:

| Agent | Rol | Renk | Tier | Default Model |
|-------|-----|------|------|---------------|
| **operation-manager** | Orchestrator | `#06B6D4` cyan | Orchestrator | claude-opus-4 |
| product-manager | Backlog & strategy | `#3B82F6` blue | Manager | claude-sonnet-4-5 |
| engineering-manager | Code & arch | `#8B5CF6` purple | Manager | claude-opus-4 |
| delivery-manager | Release & hotfix | `#F97316` orange | Manager | claude-haiku-3-5 |
| backend-developer | Server & API | `#6366F1` indigo | Specialist | claude-sonnet-4-5 |
| frontend-developer | UI/client | `#EC4899` pink | Specialist | claude-sonnet-4-5 |
| designer | UI/UX | `#10B981` emerald | Specialist | claude-sonnet-4-5 |
| qa-engineer | Tests | `#EAB308` yellow | Specialist | claude-haiku-3-5 |
| db-admin | Schemas | `#14B8A6` teal | Specialist | claude-haiku-3-5 |
| devops-engineer | Infra/CI | `#EF4444` red | Specialist | claude-haiku-3-5 |
| security-engineer | Audits | `#EF4444` red | Specialist | claude-sonnet-4-5 |
| copywriter | Marketing copy | `#84CC16` lime | Specialist | claude-sonnet-4-5 |
| compliance-expert | Legal/GDPR | `#22D3EE` sky | Specialist | claude-haiku-3-5 |
| growth-expert | Metrics | `#F43F5E` rose | Specialist | claude-haiku-3-5 |

**Model assignment mantığı:**
- Strategic/orchestrator agents → **Opus** (en pahalı, en iyi)
- Critical specialists (backend, frontend, designer, copywriter, security) → **Sonnet**
- Utility/specific-skill agents (qa, db, devops, compliance, growth) → **Haiku** (hızlı/ucuz)

---

## 6. Deep Dive Panel kararları

- **2 tab** (Live + Profile) — Eski 4 tab'tan (Live/Profile/Logs/History) düşürüldü
- Logs ve History → Live tab'a merge
- Live tab: status, model, current task, token bar, recent logs, completed tasks
- Profile tab: purpose, authority, reports-to, direct reports, skills, **chain of command** (visual hierarchy)
- **Model adı her ajan için görünür** — Kortext'in tier sistemini gösterir
- Hem Orbit'ten hem Agents ekranından açılır (same panel, same data)

---

## 7. Memory kararları

| Karar | Detay |
|-------|-------|
| Tab sayısı | 3 (Decisions, Learned, Handovers) |
| Kart yapısı | Expandable — tıklayınca tam içerik açılır |
| Sample data | 6 decision (D-001..D-006), 5 lesson (L-001..L-005), 4 handover |
| Dosya linkleri | Memory cards içindeki dosya referansları **tıklanabilir** → file viewer modal açar |
| Handover akışı | from-agent → to-agent + next steps + attached files |

---

## 8. Inbox kararları

| Karar | Detay |
|-------|-------|
| Reject form | **Required reason** (5+ char) + optional revision instructions |
| Detay expand | Her kart'ta "Details" chevron → tüm bağlam açılır |
| Sample | 3 pending approval (task transition, new task open, review complete) |
| Send button state | Reason 5+ char olana kadar disabled |

**Sebep:** Reject etmek için "neden" zorunlu olsun — agent öğrensin.

---

## 9. References kararları

- Cards: blueprint.md, tech-stack.md, decisions-adr.md, dashboard.fig, brand-voice.md
- Tıklayınca **file viewer modal** açılır (full content görünür)
- Upload zone for new files (dashed border)
- Sample dosya içerikleri JS'de `FILES` const'unda saklı

---

## 10. Reports kararları

| Karar | Detay |
|-------|-------|
| 3 sample report | Daily Status, Sprint Progress, Security Audit |
| 3 mod | **view** / **edit** / **revise** — sibling div'ler display:none ile toggle |
| Status badge | Pending Review (amber) / Approved (green) / Revision requested (amber) |
| Action butonları | Approve / Request revision / Edit |
| Revise form | Required feedback (5+ char) |

---

## 11. Workflows kararları

**v1 sorun:** Lineer 7-step progress — gerçekte loops var (review → fail → back to dev)

**v2 çözüm:** Loops-aware flow diagram
- 3 done phase strip (analysis, design, planning)
- Phase 04 active (highlighted with glow)
- Decision gates (◇) — Code Review Gate, QA Gate, Release Gate
- **Fail loop-back arrows** kırmızı callout ile (e.g., `FAIL → back to 04`)
- Right detail panel: selected phase info
- Legend: completed/active/pending/decision gate/loop-back

---

## 12. Settings kararları

**6 tab** (önceki versiyondan genişletildi — 5 statik tab'tan 6 çalışan tab'a):

| Tab | İçerik |
|-----|--------|
| **General** | Project name/code/version, target platform multi-select chips, GitHub repo, blueprint.md viewer, workspace path, auto-commit + PR approval toggles |
| **Models** | 14 ajan tablosu (avatar + tier + model dropdown + cost rating $/$$/$$$$) + 4 hızlı preset (All Opus, All Sonnet, All Haiku, **Balanced (recommended)**) + günlük/aylık maliyet tahmini + token limit ayarları |
| **Hooks** | 9 lifecycle hook (PreToolUse, PostToolUse, UserPromptSubmit, SessionStart/End, TaskCreate, HandoverStart, PartyStart, BlockerDetected) toggle'larla |
| **Integrations** | 7 servis (GitHub ✓, Vercel ✓, Stripe Test, Auth0 ✓, Slack/Linear/Sentry — bağlı değil) brand renkleriyle |
| **Appearance** | Theme (Dark only, Light v0.2'de), Language (EN/TR), Display density chips |
| **Danger** | Archive (amber), Reset Memory (red), Delete Project (red, "ACME" type-to-confirm) |

**Model preset mantığı:**
- `Balanced`: orchestrator + eng-manager = Opus; managers + key specialists = Sonnet; utility specialists = Haiku

---

## 13. Global UI Shell kararları

```
TopBar (56px): Logo · Project · ⌘K Search · Live indicator · User avatar
Sidebar (64px, icon-only): 9 nav items + Settings at bottom
Main content (flex)
StatusBar (32px): Live audit feed + workflow chip
Floating terminal (bottom-right): Mock terminal panel
```

- **Sidebar collapsed default** (sadece icon) — hover'da tooltip
- **Topbar'da proje switcher YOK** — tek proje paradigması
- **Command palette (⌘K)** — search anything modal

---

## 14. Sample data: Acme CRM

**Niye Acme CRM?** Çünkü:
- B2B SaaS — yaygın bir use-case
- Kullanıcı kontekstinde (founder/PM düşünüyor olabilir)
- Tüm 14 ajanın doğal görevi var (auth, billing, dashboard, admin)

**Tech stack:** Next.js · Node · PostgreSQL · Vercel · Stripe · Auth0  
**Created:** 2026-05-14 (in sample data)  
**Current workflow:** 04-development-cycle · Step 4/7

**Backlog:**
- E-001 Authentication & Users (5 items, %40)
- E-002 Billing & Subscription (4 items, %8)
- E-003 Customer Dashboard (6 items, %25)
- E-004 Admin Panel (3 items, %0 — başlamadı)
- 8 task + 3 bug + 2 debt

---

## 15. Kritik bugfix geçmişi

(Tekrarlamamak için)

1. **`primeGrad` undefined** — SVG `<defs>` içinde tanımlanmadan referans verilmişti → +prime gradient render etmiyordu. Fix: defs'e `<radialGradient>` ekle.

2. **Backend-dev viewBox overflow** — y=35 noktası 580-height viewBox'ın çok üstündeydi → label görünmüyordu. Fix: ViewBox 920×640'a, sonra 1000×720'ye, sonra 1400×920'ye genişlet.

3. **`<circle>` inside `<defs>`** — Defs sadece template tutar, görünür element değil. Defs'ten çıkarıldı.

4. **`showScreen()` clearing inline style** — Section'a HTML inline `display:grid` koymuştuk ama `showScreen` `el.style.display = ''` ile temizliyordu → block'a düşüyordu. Fix: CSS rule `.screen.active[data-screen="orbit"] { display: grid }`.

5. **Timeline flex-row overflow** — Timeline events div parent row'u büyütüyordu. Fix: `min-height:0` + `overflow-y:auto` on events, **CSS grid** parent layout.

6. **`innerHTML =` blocked** — PreToolUse hook bunu engelliyor (XSS koruma). Solution: `window.renderHTML = (el, html) => { el.replaceChildren(); el.insertAdjacentHTML('afterbegin', html); }` — global helper.

---

## 16. Onaylanmış, ertelenmiş, reddedilmiş

### ✅ Onaylanmış (v1.0 mockup'ta var)
- Tüm 12 ekran
- Tüm 14 ajan
- 4 epic + 13 task sample
- 6 decision + 5 lesson + 4 handover
- Deep Dive panel (Orbit + Agents'tan açılır)
- Party Mode (multi-agent chat → ADR)
- Command palette (⌘K)

### ⏸️ Ertelenmiş (v1.0 sonrası)
- Complexity rozeti (framework'te field yok)
- Priority etiketi (framework'te field yok)
- Light theme
- Tüm 17 hook (şimdi 9 örnek var)
- Connectable integrations (mock, gerçek bağlanma yok)
- Mobile responsive (1280px+ optimize)

### ❌ Reddedilmiş
- Multi-project switcher (her kurulum tek proje)
- Lineer workflow progress (loops var)
- 4-tab Deep Dive (Live'a merge edildi)
- ~~Circle nodes in Orbit~~ (3 iterasyon sonra dikdörtgene geçildi)
- Mission Floor pod layout (orbit metaforu kayboluyordu)
