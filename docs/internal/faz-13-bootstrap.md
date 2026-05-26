# Kortext v3.1 — Faz 13 (Workflow Content Rewrite) Bootstrap

> Bu dosya **yeni Claude Code oturumu** için Faz 13'ün giriş bilgisidir.
> Eray, aşağıdaki "Copy-paste prompt"u yeni oturuma yapıştırır; Claude bağlamı alıp plan + uygulama başlatır.

---

## Copy-paste prompt (yeni oturumda ilk mesaj)

```
Kortext v3.1 Faz 13 — workflow content rewrite turu başlıyor.

Önce şu 4 dosyayı sırayla oku, sonra başla:

1. docs/internal/HANDOVER-v3.md (özellikle "Faz 12 — v3.1 architecture refactor (TAMAMLANDI)" + "Faz 13 — workflow content rewrite (SIRADA)" bölümleri)
2. docs/internal/v3.1-architecture-proposal.md (özellikle Bölüm 5 frontmatter standartları + Bölüm 7 selective read + Bölüm 11 yeni kavramlar)
3. docs/internal/v3.1-todo.md ("Workflow content rewrite (Faz 13)" bölümü — 11 madde checklist)
4. docs/internal/faz-13-bootstrap.md (bu dosya — scope + workflow inventory + senaryo placeholder)

Bağlam:
- v3.1 mimari refactoru (Faz 11.4 + 12.1-12.9) PR https://github.com/erayendes/kortext/pull/1 ile yapıldı, 360/360 test yeşil.
- Faz 13 = workflow .md'lerinin İÇERİĞİNİ yeni mimariye (path: .kortext/, frontmatter standartları, persona handle FK, selective read, per-file rapor disipline'i, prompt cache stable-prefix) uyumlu hale getirmek.
- Senaryolar Eray'dan gelir — agent içeriği Eray'ın senaryo girdisiyle yeniden yazar.

Hazırsan "Bağlamı okudum, Faz 13 başlangıç planını veriyorum" diyerek başla. Plan onaylanınca implement.
```

---

## Faz 13 scope

**Hedef:** `workflows/*.md` ve gerekirse `agents/*.md`, `rules/*.md` içeriklerini Faz 12'nin yeni mimarisi ile uyumlu hale getirmek. Mimari iskelet hazır (Faz 12); şimdi workflow definitions'ın bu iskelete oturması gerekiyor.

### Neden gerekli?

Faz 12.8 (workflow/persona SQL index + FK validation) sayesinde engine boot'ta `index-sync` tüm `workflow_steps`'i `personas` tablosuyla foreign key kontrol ediyor. Bilinmeyen `+ajan` placeholder fatal throw atıyor. Yani bu workflow dosyaları temizlenmeden `kortext serve` boot edemiyor (gerçek üretim akışı, mock dışı).

### Yapılacak temizlik (v3.1-todo'dan)

11 madde, sırayla:

- [ ] **`+ajan` placeholder kaçaklarını bul ve düzelt** — gerçek persona handle'larına çevir. 14 valid handle: `+prime`, `+product-manager`, `+engineering-manager`, `+backend-developer`, `+frontend-developer`, `+db-admin`, `+devops-engineer`, `+qa-engineer`, `+security-engineer`, `+compliance-expert`, `+designer`, `+copywriter`, `+growth-expert`, `+operation-manager`, `+delivery-manager`. (`+prime` synthetic — agents/ klasöründe değil; index-sync ekliyor.)
- [ ] **`scripts/kortext-*.py` referanslarını sök** (~36 yer, en yoğun `04-development-cycle.md`'de). Bunların yerine engine'in kendi TS modülleri / MCP tool çağrıları / REST endpoint'leri yazılmalı.
- [ ] **`hooks/git-pre-commit.sh` referanslarını sök** — Kortext engine içi `secret-scanner` zaten worker-pool'un safety katmanında.
- [ ] **`settings/INTEGRATION-MAP.md` referanslarını sök** — Engine'in kendisi mapping yapıyor (Faz 12.8 `workflow_steps.inputs/outputs` JSON kolonu).
- [ ] **`workspace/memory/context/[agent]-active.md` referanslarını sök** — Engine state SQL `contexts` tablosunda.
- [ ] **`workspace/memory/backlog/*.md` referanslarını "SQL backlog_items" diline çevir** — Backlog item açma artık engine `add_backlog_item` MCP tool veya `POST /api/backlog` üzerinden.
- [ ] **`workspace/` path referanslarını `.kortext/`'e güncelle** — Workflow .md'lerde "workflow dir'inden bir üst" konvansiyonu varsa parser zaten `../workspace/` → `../.kortext/` normalize ediyor; ama text içinde dokümante edilmiş path varsa elle düzeltilmeli.
- [ ] **Per-file rapor disipline:** workflow "raporu yaz" derken "yeni rapor dosyası aç" diline çevir. Engine `markdown-sync.writeReport()` filename'i kendisi üretiyor — workflow sadece scope + slug + body veriyor.
- [ ] **Senaryo formatına uyarlama (prime/sistem/+persona):** `docs/internal/setup-onboarding-scenario.md` taslağındaki disipline göre. Eray bu disipline net karar verecek; örnek senaryo o dosyada.
- [ ] **Selective read pattern**: workflow step'lerde büyük dosya (>30KB) referansı varsa, "önce TOC oku, sonra ilgili bölümü selective oku" talimatı ekle. Pattern (spec §7):
  ```
  1. Read(file, offset=0, limit=30)         ← sadece TOC
  2. Grep("^## <Bölüm Başlığı>", file)      ← satır numarası bul
  3. Read(file, offset=N, limit=M)          ← sadece o bölümü oku
  ```
- [ ] **Handover entry-level frontmatter disipline**: workflow'larda handover yazma adımı varsa, entry-level frontmatter (status/author/updated_at — approver yok) örneği ile dokümante et.

---

## Workflow inventory (12 dosya)

```bash
ls workflows/
# 00-kortext-setup.md
# 01a-analysis-pipeline.md
# 01b-onboarding-pipeline.md
# 02-planning-pipeline.md
# 02b-spike-workflow.md
# 03-environment-setup.md
# 04-development-cycle.md
# 05-test-cycle.md
# 06-deployment-cycle.md
# 07-rollback-pipeline.md
# 08-hotfix-pipeline.md
# 09-maintenance-cycle.md
```

> Bu dosyanın ilk taslağında inventory yanlıştı (`00-blueprint-creation`,
> `01b-blueprint-update`, `03-pre-development`, vb. — uydurma isimler).
> Gerçek liste yukarıda; Faz 13 rewrite turunda doğrulandı.

Her workflow için sırayla:
1. Mevcut content'i oku (full file)
2. Scope dışı çıkanlara işaret et
3. Path/persona/script referanslarını grep ile bul
4. Yeni mimari'ye göre rewrite et
5. Engine boot'ta `index-sync` validation passes mı kontrol et
6. İlgili step için integration test gerekirse ekle

---

## Çalışma stratejisi

### Tek tek mi, paralel mi?

Faz 12'de 4 paralel ajan başarılı oldu ama content rewrite'da risk farklı:
- **Tek dosya = tek context** disipline'ı daha iyi (workflow tutarlılığı)
- Eray senaryolarına bağlı sıra olabilir (örn. önce 01a-analysis-pipeline temizlenir, sonra 04-development-cycle)

**Öneri:** ilk 2-3 workflow tek-tek Eray'la birlikte yapılır (kalibrasyon). Sonra disipline oturduğunda 2-3 ajan paralel.

### Senaryo girdisi nereden?

Eray:
- `docs/internal/setup-onboarding-scenario.md` taslağında "prime / sistem / +persona" dialog formu olabilir (oku)
- Veya Eray sözlü/textle yeni senaryo verebilir (örn. "01a-analysis-pipeline şöyle akmalı: blueprint okunur, +product-manager analiz yazar, +engineering-manager review eder, +prime onay verir, çıktı `.kortext/reports/analysis-reports_<slug>_<ts>.md`")

### Doğrulama

Her workflow rewrite'tan sonra:
```bash
npm test                        # 360/360 hâlâ yeşil
npm run typecheck               # 0 hata
npx tsx -e "import { syncRegistriesToDb } from './server/engine/index-sync.ts'; syncRegistriesToDb({ ... })"
# index-sync fatal throw etmemeli (FK validation pass)
```

İdeal: yeni `tests/workflow-content.test.ts` — her workflow için en az parse + FK validation smoke.

---

## YAPILMAYACAKLAR

- ❌ Mimari değişikliği (Faz 12 zaten kapattı, path/SQL/frontmatter sabit)
- ❌ Yeni persona ekleme (14 + synthetic +prime sabit)
- ❌ Yeni workflow ekleme (12 mevcut yeter; v3.2'de düşünülür)
- ❌ Migration script (kullanıcı veri taşıma)
- ❌ Override mekanizması
- ❌ v3.1.x follow-up UI işleri (Reports SQL revamp / Memory archive dropdown / POST /api/backlog test / orchestrator outputIndexer wiring) — bunlar Faz 13 sonrası ayrı PR'a

---

## Bitince ne olur?

1. Tüm 12 workflow temiz
2. `kortext serve` boot eder, hata atmaz
3. Boş bir test projesinde `kortext init` + onboarding wizard + Claude executor ile **gerçek** pipeline akışı: blueprint → analysis → references doluyor → reports üretiliyor → handover yazılıyor
4. UAT yeşil
5. PR aç (yeni branch `feat/v3.1-workflow-content`), main'e merge
6. `package.json` 3.1.0 bump (veya 3.2.0 — version stratejisini Eray seçer)
7. Tag + npm publish

---

## Referans

- [v3.1-architecture-proposal.md §11](v3.1-architecture-proposal.md) — Bölüm 11 "Eklenen kavramlar" (per-file rapor + selective read + handover rotation patterns)
- [v3.1-todo.md "Workflow content rewrite (Faz 13)"](v3.1-todo.md) — checklist madde sayım kaynağı
- [setup-onboarding-scenario.md](setup-onboarding-scenario.md) — senaryo format taslağı (mevcut hâli + Eray ekleme yapacak)
- [HANDOVER-v3.md "Faz 12 — TAMAMLANDI"](HANDOVER-v3.md) — Faz 12 sonu state + design decisions #59-64
