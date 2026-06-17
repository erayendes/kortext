# Kortext — TODO

Açık iş listesi. **Bitmiş işler buradan çıkarılır** → tarihçe [DECISIONS.md](./DECISIONS.md)'de, son durum [HANDOVER.md](./HANDOVER.md)'de. Çözülen UAT post-mortem'leri DECISIONS.md'ye taşındı.

---

## 🔴 Operasyonel doğrulama — tam-zincir UAT (Eray koşar)

> UAT #10/#10k/#10L/#10M'in **kod fix'leri tamam + merge'li** (motor epic/dependency/version floor, codex kod-üretim prompt'u, motor commit-before-merge, no-op guard). Kalan: tek temiz koşuda hepsini canlı görmek.

- [ ] **Temiz uçtan-uca UAT:** codex/antigravity ile build'i sonuna kadar koştur ve şunları CANLI doğrula:
  - planning DEVAM EDERKEN Board'da **epics > 0** + tüm task'lar bağlı, tek versiyon, dependency zinciri (#10k/#10),
  - implementation **gerçek kod üretir** (#10L),
  - motor worktree'yi **commit + merge** eder → `development`'ta app dosyaları (`index.html`, `src/`) **gerçekten var**, gate'ler geçer, item **done sahte değil** (#10M).

---

## 🟠 Model seçimi gerçek `--model`'e bağlı değil (UAT #10)

> `item.model` / `rules/models.md` profilleri **kozmetik** — hiçbir executor `--model` argümanına çevirmiyor; her CLI kendi varsayılanını kullanıyor. "fast-reasoning rutine, high-reasoning kritiğe" vaadi gerçekleşmiyor.

- [ ] `item.model` profilini gerçek `--model`'e bağla: profil → executor model-id eşlemesi (`high/standard/fast-reasoning` × {claude, codex, gemini/agy}) → step'in executor'ına `extraArgs:['--model',<id>]`.
- [ ] Global "ekonomik mod" anahtarı (`KORTEXT_MODEL_PROFILE=fast`) — tüm adımları en küçük/hızlı modele zorlar (UAT/demo için).
- [ ] Drawer'da hangi item'ın hangi **gerçek model-id** ile koştuğunu göster (şu an yalnız profil etiketi).

---

## 🤖 Çok-modelli executor — onboarding seçimi = operation-manager modeli

> Executor şu an proje genelinde tek (`project.json.executor`). Hedef: onboarding seçimi yalnız orkestratör (operation-manager) için; sonrası persona/görev bazında farklı model.

- [ ] Onboarding "AI Executor" alanını **"operation-manager modeli"** olarak çerçevele (etiket + yardım metni).
- [ ] Settings/Agents: her persona için model/executor override (yukarıdaki "Onboarding'de model/hız profili" ile birleşir).

---

## 🟠 Planning kalitesi executor-bağımlı + build-start (UAT #10)

> Motor-tarafı floor (`ensureBacklogStructure`/`ensureEpicFloor`: epic + lineer dependency + tek-versiyon garantisi) **tamam**. Kalan iki açık:

- [ ] **Talimat sertleştirme:** `planning-pipeline.md` step-1 — item-tavanı + "tek versiyon" + epic/dependency üretimini daha net zorlasın (motor floor güvence ama içerik de iyileşsin).
- [ ] **Build başlat:** planning succeeded sonrası development-cycle **otomatik tetiklenmiyor**, kullanıcının net "Başlat" yolu yok. Drive build'i otomatik tetiklesin VEYA Board'da net çalışan "Başlat/Auto" kontrolü olsun.

---

## 🟠 UI çelişkisi: "done" item hem locked·waiting hem gate pending (UAT #10)

> Done item, blocker'ı sonradan regrese olunca yeniden "🔒 locked · waiting" görünüyor; gate "pending" derken aynı gate'te token harcanmış (gate koşmuş).

- [ ] Kilit bayrağı **yalnız başlamamış (to_do)** item'a uygulansın — `done`/`review`/`test` item geri-kilitlenmesin.
- [ ] Gate rozeti gerçek `gate_runs` durumundan türesin (pass/fail/running); token harcanmışken "pending" gösterme.

---

## 🟠 Orphan daemon temizliği (UAT #10)

> Orphan-sweep komutu **tamam** (`server/cli/cmd-orphans.ts` + test). Kalan:

- [ ] **purge/stop canlı süreci de öldürsün** (atomik): kayıt silinirken kayıtlı PID/port'tan süreç de SIGTERM.
- [ ] **Daemon self-check:** gerçek daemon periyodik "registry'de kayıtlı mıyım?" baksın, değilse kendini kapatsın (şu an yalnız :3199 sihirbazı).

---

## ⭐ Sırada — GUI/backend açık işler

- [ ] **Onboarding sidebar — zengin proje kartı verisi** (2026-06-15): "Recent projects" kartları kod/platform/versiyon/ilerleme gösterecek; `/api/projects` şu an yalnız slug/name/path/port/status/url döndürüyor → `blueprint.json` meta'sından kod+platform+versiyon ekle (ilerleme % proje daemon'ı sorgulanmalı, ertelenebilir).
- [ ] **Onboarding "Setup" sekmesi — canlı akışa bağla** (2026-06-16): `SETUP_PHASES`/`SETUP_ACTIVITY` şu an `OnboardingScreen.tsx`'te **sabit** (başlıkta "preview" rozeti). Gerçek blueprint-faz durumu + `/api/runs` activity ile besle; "Review" düğmeleri dosyayı reader'da açsın; "Open dashboard" fazlar bitince route etsin.
- [ ] **Hooks — motora bağla** (2026-06-15): `GET/PUT /api/hooks` `settings/hooks.json`'a kaydediyor ama motorda tüketici yok. Orchestrator lifecycle event'lerinde enabled hook'ları uygula. Riskli (yanlış hook tüm koşuyu bozar). UI'da "saved · not wired yet" rozeti var.
- [ ] **Scripts — runner + registry** (2026-06-15): `scripts.tsx` statik (Run düğmesi no-op, toggle reload'da kaybolur). script-registry + `POST /api/scripts/:id/run`; **güvenlik:** yalnız allow-list'li script'ler. UI'da "preview · no runner yet" rozeti var.
- [ ] **Integrations operasyonel bağlama** (2026-06-15): saklama katmanı çalışıyor (token maskeli, testler yeşil) ama hiçbir ajan/git akışı okumuyor. (1) `INTEGRATION_GITHUB_TOKEN`'ı gerçek `git push`/PR'da kullan (`server/engine/git-commit.ts` şu an local commit); (2) `autoCommit` → orchestrator commit; (3) `prApproval` → merge öncesi onay kapısı.
- [ ] **İçerik kalibrasyonu** (ölçüldü, Eray onayı gerek): `rules/behavior.md` ~16KB her adımda; en büyük persona `engineering-manager.md` ~13.8KB. Kırpma davranış riski taşır → ayrı tur.
- [ ] **Concurrency knob'ları** (opsiyonel): workflow-içi `concurrency=3` + `maxConcurrentWorktrees=10` ayarlanabilir tavanlar.
- [ ] **Standalone CLI'a ingester bağla:** `kortext start` (commands.ts) `safetyGuards` almıyor → ingester yalnız backend (onboarding/drive) yolunda; CLI yolunu da besle.
- [ ] **`/api/backlog` gerçek sayfalama:** faz-1'de `?limit=500` band-aid; >500 item'lı projeler için gerçek sayfalama/sonsuz-kaydırma.
- [ ] **Transient retry — codex/gemini executor:** `spawnCliWithRetry` helper hazır; codex/gemini hâlâ `spawnCli`'ı doğrudan çağırıyor.

---

## 🖥️ UI — gerçek veriye bağlanacak parçalar

- [ ] **⌘K global arama** — palet var ama gerçek arama backend'ine bağlı değil ("SOON").
- [ ] **Terminal = komut girişi** — şu an salt-okunur run-history; gerçek komut girişi.
- [ ] **Canlı gate pass/fail** — `gate_runs` gerçek verdict + findings içeriyor ama UI tüketmiyor (`board-drawer.ts:433`); API'de expose + drawer'da göster.
- [ ] **Board "sıra kimde" rozeti** — `whoseTurn(item)` türetimi hazır (`server/orchestrator/whose-turn.ts`), tüketen UI yok.
- [ ] **Global parçaları gerçek veriye bağla** — ⌘K/bildirim/terminal kabuk-seviyesinde çalışıyor, tam veri akışı bekliyor.
- [ ] **Version selector semantiği** — proje sürümü / snapshot / release? netleştir.

---

## 🚀 Release

- [ ] **PUBLISH:** `npm publish` (Eray "push" dedikten sonra; kasıtlı manuel). Yayın sonrası global kortext eski → `kortext update`.
- [ ] **v3.1.0 release flow:** `package.json` sürüm bump, CHANGELOG `[Unreleased]`→`[3.1.0]`, `git tag v3.1.0`, npm publish.
- [ ] **Prod push (CI) substratı** — gerçek prod altyapısı gelince CI tetikleme.
- [ ] **Full planning pipeline canlı dayanıklılık** — adım-zaman aşımı / hung-executor tespiti + 9-adım uçtan uca canlı koşu.
- [ ] **Paketlenmiş manuel UAT** — temiz klasör + `npm pack` + `npm install -g ./kortext-3.X.X.tgz` + `init` + `serve`.

---

## 🧹 Doküman temizliği (2026-06-17)

> ✅ **Yapıldı:** Tüm dokümanlar `development/` → `docs/`'a taşındı (development/ kaldırıldı). `PERSONA-ICONS.md` silindi. `UAT-GUIDE.md` + `UAT-SESSION-PROMPT.md` → `docs/UAT.md` birleşti. Canlı: `docs/{DECISIONS,DESIGN,HANDOVER,TODO,UAT}.md`; güncellenecekler `docs/pending-update/`; arşiv `docs/{concepts,specs,superpowers}/`. CLAUDE.md + canlı linkler güncellendi. `.DS_Store` temizlendi + `.gitignore`'a eklendi.

- [ ] **`docs/pending-update/` içeriğini güncelle:** `ARCHITECTURE.md` (kırık `../USER-GUIDE.md` linki + güncellik), `USER-GUIDE.md` (28 May, bayat), `SETUP.md`, `PRODUCT.md` (tepedeki `## Register / product` artığı). Güncellenince `ARCHITECTURE.md`/`USER-GUIDE.md` `docs/` köküne geri alınabilir.
- [ ] **Arşiv kararı:** `docs/concepts/` eski wireframe'ler (v2/v3/v4/v5 + persona-icon-preview'lar — v6 dışı), `docs/specs/`, `docs/concepts/design_handoff_kortext/`, `docs/superpowers/` salt-arşiv; gerekirse `docs/archive/`'a toplanabilir ya da budanabilir.
- [ ] **`docs/UAT.md` iç temizlik:** birleşmeden gelen mükerrer giriş/başlıklar + eski "DECISIONS Bölüm 7" atfı (artık Bölüm 16) gözden geçirilsin.

---

## 🔩 Motor — ertelenen backend dilimleri

- [ ] **blocker-temizle (§5.9 #6)** — şema-tabanlı `blocked` status-flip modeli (UAT #9 fix'i bağımlılığı scheduler'da çözüyor; şema modeli Eray tarafından ertelendi).

---

## 📋 v3.1.x follow-up (release sonrası, blocker değil)

| Madde | Yer | Durum |
|---|---|---|
| Reports SQL UI revamp | `src/routes/reports.tsx` | `/api/docs/reports` (fs) → `/api/reports` (SQL); filter/tags/status |
| Memory archive dropdown | `src/routes/memory.tsx` | Decisions/Learned TOC; eski `handover-<ts>.md` dropdown |
| `POST /api/backlog` integration test | `tests/` | route-level test eksik |
| Footer canlı stats wiring | `src/app/Footer.tsx` | `tkn/s`, `$today`, branch chip'leri partial hardcoded |
| Inline markdown save endpoint | `server/routes/docs.ts` | PUT `/api/docs/:scope/:file` — Rules/Workflows/References "Save" |
| Decisions cards author+quote | Schema + UI | Decision schema'da `author`/`quote` yok |
| Eski `/api/docs/reports` kaldır | `server/routes/docs.ts` | UI `/api/reports`'a çevrildikten sonra |

---

## 🔬 İçerik review turu (Faz 13 kalibrasyon)

- [ ] Çekirdek akış dosyaları: `templates/AGENTS.md` · `agents/*.md` (persona) · `rules/*.md` · `workflows/*.md` · `templates/{foundation,references,reports,memory,backlogs}/*.md`.
- [ ] Bilinen risk: `existing-project-analysis.md` (hızlı yazıldı), `spike-pipeline.md` (dinamik persona oversimplification).
- [ ] **Stale `.py` komut katmanı:** `rules/commands.md` "Çağrılan Script" sütunu + agents/workflows hâlâ v2 Python script'lerine atıf yapıyor (`kortext-*.py`) — v3 TS runtime'da yoklar → komut katmanını gerçek mekanizmaya göre kalibre et.

---

## 🗓️ v3.2.0 — bilinçli ertelenmiş

- **Tasarım/UI:** mobile responsive (şu an 1280px+) · a11y aria · i18n (gerçek tr/en) · LocalStorage persistence.
- **Engine/workflow:** reviewer-as-step runtime · Settings/Agents YAZMA editor (şu an readonly) · `+prime` synthetic persona.
- **Refactor:** workflow gate hint syntax (`parallel_with_json` parser) · `learned.md` topical split (50KB+ olunca).

---

## ❓ Açık sorular (Eray ile)

- `scripts/` rename tutalım mı (yanıltıcı ad ama tek dosya, marjinal fayda).
