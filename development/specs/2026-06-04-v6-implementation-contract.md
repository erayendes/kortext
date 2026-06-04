# v6 hi-fi → React implementation contract

> **Amaç:** v6 hi-fi tasarımını ([development/concepts/wireframe-v6-hifi.html](../concepts/wireframe-v6-hifi.html)) gerçek React app'e taşımak. Bu doküman, paralel oturumların **çakışmadan** çalışması için tek koordinasyon kaynağıdır. Her oturum SADECE kendi dosyalarına dokunur.
> **Spec:** wireframe-v6-hifi.html (canlı: `npx serve development/concepts -l 8092` → `/wireframe-v6-hifi.html`, ≥1600px). Kararlar: DECISIONS §11 (IA) + §12 (hi-fi).
> **Kural:** `main`'e SORMADAN push YOK. Kod/commit İngilizce. Görsel sadakat için wireframe'i yan yana aç.

## Durum (2026-06-04)
- ✅ **CSS temeli hazır** (`src/index.css`): v6'nın TÜM sınıfları (`.topbar/.nav/.sidebar/.footer/.card/.col/.epic-rail/.fb-*/.set-*/.intg-*/.env-*/.am-*/.kpane/.drawer/.cmdk-*/.menu/.nt-*/.term/.toast/.uppanel`), token'lar (`--bg/--fg/--accent #5E6AD2/...`), koyu+açık tema, Geist font. **Yeni bileşenler bu sınıfları kullanır — yeni CSS yazma, varsa index.css'e ekle.**
- ✅ **Backend endpoint'leri hazır** (aşağıda). Tasarımdan bağımsız.
- ✅ Persona ikon/renk: `src/lib/persona-colors.ts` → `personaColor(handle)`, `personaIcon(handle)` (Lucide), `personaPalette(handle)`.
- ✅ API yardımcıları: `src/lib/api.ts` → `apiGet`, `apiPut`, `apiDelete`, `usePolling`, `apiPost`. Tipler: `src/lib/api-types.ts`.

## Hedef dosya düzeni
```
src/app/
  AppShell.tsx        # topbar + sidebar + footer + <Outlet/>; tema; bağlamsal sidebar swap
  Topbar.tsx          # logo · proje/versiyon dropdown · ⌘K search · bildirim/terminal ikonları
  Sidebar.tsx         # proje menüsü (Dashboard/Board/References/Memory/Reports/Project settings)
                      #  + Kortext kapsamında motor menüsü (swap)
  Footer.tsx          # ⚙Kortext · tema butonu · daemon · agents↑ · worktrees↑ · terminal
  CommandPalette.tsx  # ⌘K overlay
  Notifications.tsx   # bildirim merkezi (sağ panel/overlay)
  Terminal.tsx        # footer floating mini-CLI
  theme.ts            # light/dark toggle (html.light), localStorage
src/components/v6/
  FileBrowser.tsx     # 2-pane dosya tarayıcı (References/Memory/Reports/Kortext-Agents/Rules/Workflows)
  AnnotatableDoc.tsx  # satır-anotasyon motoru (revise | clarify modları)
  SettingsPane.tsx    # ayar sayfası kabuğu (.set-* primitifleri: row/card/switch/chip/select)
  Drawer.tsx          # sağ drawer + backdrop (item/epic detay; genel amaçlı)
src/routes/            # HER EKRAN AYRI DOSYA (temel oturum stub açar, ekran oturumu doldurur)
  dashboard.tsx · board.tsx · references.tsx · memory.tsx · reports.tsx
  settings/project-info.tsx · settings/integrations.tsx · settings/environments.tsx · settings/agent-models.tsx
  kortext/llm-auth.tsx · kortext/agents.tsx · kortext/rules.tsx · kortext/workflows.tsx
  kortext/notifications.tsx · kortext/hooks.tsx · kortext/scripts.tsx
```
> Mevcut eski route dosyaları (board.tsx/memory.tsx/reports.tsx/settings-panes.tsx/dashboard.tsx) v6'ya göre YENİDEN yazılır. Eski wiring referans için `wip(settings)` commit'inde durur.

## Route haritası (hash-history, TanStack Router)
Proje kapsamı: `/` Dashboard · `/board` · `/references` · `/memory` · `/reports` · `/settings/project` · `/settings/integrations` · `/settings/environments` · `/settings/agent-models`
Motor kapsamı (Kortext): `/kortext/llm-auth` · `/kortext/agents` · `/kortext/rules` · `/kortext/workflows` · `/kortext/notifications` · `/kortext/hooks` · `/kortext/scripts`
> Temel oturum TÜM route'ları kaydeder ve her birini bir stub bileşene bağlar. Ekran oturumları SADECE kendi route dosyasını doldurur, `router.tsx`'e DOKUNMAZ.

## Ortak bileşen API'leri (sözleşme — temel oturum bunları yazar)
```ts
// FileBrowser.tsx
type FBItem = { id: string; name: string; group?: string; author?: string|null; status?: 'approved'|'review'|'draft'|'ro'; meta?: string };
type FileBrowserProps = {
  title: string;
  items: FBItem[];                       // sol liste (gruplanabilir)
  loadBody: (id: string) => Promise<string>; // seçili dosyanın markdown gövdesi
  mode: 'revise' | 'clarify' | 'ro';     // sağ görünüm davranışı (AnnotatableDoc'a geçer)
  headerActions?: React.ReactNode;       // sağ üst (ör. References "Revise" butonu)
};

// AnnotatableDoc.tsx  (FileBrowser içinden kullanılır; markdown'ı satır satır render eder)
type AnnotatableDocProps = {
  markdown: string;
  mode: 'revise' | 'clarify' | 'ro';
  onSubmit?: (lines: number[], note: string) => Promise<void>; // revise=statü/yeni sürüm, clarify=Activity'ye düşer
};

// SettingsPane.tsx  (ayar sayfası kabuğu + alt-primitifler)
type SettingsPaneProps = { title: string; subtitle?: string; wide?: boolean; children: React.ReactNode };
// dışa açılan yardımcılar: <SetCard> <SetRow label desc right> <Switch on onToggle> <Chip on onClick> <SetSelect>

// Drawer.tsx
type DrawerProps = { open: boolean; onClose: () => void; children: React.ReactNode; width?: number };
```
> Ekran oturumu bu primitifleri `import` eder. Temel oturum merge olana kadar primitifler yoksa, ekran oturumu kendi worktree'sinde geçici minimal stub yazıp merge'de gerçeğiyle değiştirir (prompt'ta belirtilir).

## Backend endpoint'leri (hazır, gerçek veri)
- `GET /api/runs`, `/api/runs/:id` — dashboard active-work
- `GET /api/backlog`, `POST /api/backlog`, `POST /api/backlog/:id/transition`, `/api/backlog/:id/activity`, `POST /api/backlog/:id/ac` — board + drawer
- `GET /api/decisions`, `/api/handovers` — memory
- `GET /api/docs/:scope`, `/api/docs/:scope/:file` (scopes: references, memory, reports, rules, workflows, foundation) — FileBrowser
- `GET /api/personas`, `/api/personas/:handle`, `PUT /api/personas/:handle`, `/api/personas/usage` — agents
- `GET /api/workflows`, `/api/workflows/:id` — workflows (steps+gates)
- `GET/PUT /api/project-meta` — project info
- `GET/PUT /api/hooks` — hooks (6 olay: PreToolUse/PostToolUse/UserPromptSubmit/SessionStart/HandoverStart/BlockerDetected)
- `GET /api/integrations`, `PUT/DELETE /api/integrations/:id` — integrations (github/vercel/stripe/auth0/slack/telegram)
- `GET /api/env`, `PUT/DELETE /api/env/:key` — environments
- `GET /api/questions` — prime review queue · `GET /api/doctor`, `/api/health`

## Konvansiyonlar (her oturum)
1. v6 CSS sınıflarını kullan; satır-içi renk yazma (token'lar var). Geist font hazır.
2. Görsel sadakat = wireframe-v6-hifi.html ile yan yana; ölçü/renk için `getComputedStyle`/DOM teyidi (screenshot ikincil, lag yapar). Hedef genişlik 1600px.
3. Mantık varsa TDD (vitest, `tests/`), saf görsel ise canlı doğrulama. `npm run typecheck` + `npm test` yeşil olmadan "bitti" deme.
4. Lucide ikonları: marka ikonları (`github`) render olmayabilir → nötr ikon kullan (`git-branch`).
5. Worktree: `git worktree add ../kortext-<ad> -b v6/<ad> main` (temel merge olduktan sonra). Bitince Eray'a "merge hazır" de; SORMADAN main'e push/merge YOK.
6. Gerçek veri kullan (yukarıdaki endpoint'ler); wireframe'deki sahte JS verisini kopyalama.

## Oturum bölümü (çakışmasız dosya sahipliği)
| Oturum | Sahip olduğu dosyalar | Bağımlılık |
|---|---|---|
| **S1 Temel** | `src/app/*`, `src/components/v6/*`, `src/router.tsx`, tüm `src/routes/*` STUB | — (önce biter+merge) |
| **S2 Dashboard** | `src/routes/dashboard.tsx` | S1 |
| **S3 Board+Drawer** | `src/routes/board.tsx`, `src/components/v6/Drawer.tsx` içeriği item/epic | S1 |
| **S4 FileBrowser ekranları** | `src/routes/references.tsx`, `memory.tsx`, `reports.tsx` | S1 (FileBrowser/AnnotatableDoc) |
| **S5 Settings** | `src/routes/settings/*`, `src/routes/kortext/*` | S1 (SettingsPane) |
| **S6 Global chrome** | `src/app/CommandPalette.tsx`, `Notifications.tsx`, `Terminal.tsx` + topbar dropdown wiring | S1 |
