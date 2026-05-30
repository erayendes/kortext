# Kortext — Handover

> Yeni Claude Code oturumu için bootstrap pusulası. Açar açmaz şu prompt'u yaz:
> **"HANDOVER.md'yi oku, devam edelim."**

---

## 1. Şu an (2026-05-30)

**Branch:** `feat/v3.1-workflow-rewrites` (workflow lifecycle redesign turu). `main` HEAD `6dc2fb6` (Faz 13) — bu branch onun üzerine workflow rewrite'larını taşıyor.

**Açık PR:** [#4](https://github.com/erayendes/kortext/pull/4) — workflow rewrite'ları, Eray review/merge bekliyor. (Bu branch'teki sonraki commit'ler de aynı PR'a akıyor.)

| Test | Lint | Typecheck | Build |
|---|---|---|---|
| 382/382 ✅ | 0 hata · 4 pre-existing warning | 0 hata | temiz |

**npm registry:** `kortext@3.0.0` broken (EADDRINUSE silent fail bug). v3.1.0 release (devasa sürüm: Faz 11-13 + CLI redesign) lokal tgz UAT geçtikten sonra yapılacak.

## 2. Geçmiş özet

Faz 13 tamamlandı: engine output-resolver, callout → approver-based gate, `.kortext/foundation/` kategorisi, 13 reference ALL-CAPS rename, 12 workflow rewrite (AI-odaklı imperative ton), `docs/ → development/` konsolidasyon. Detaylar [DECISIONS.md Bölüm 1](./DECISIONS.md).

## 3. Aktif iş — Development + Test lifecycle redesign

Spec: [DECISIONS.md Bölüm 5](./DECISIONS.md) (design level, Eray onayladı). Süreç §5.10: **önce tüm workflow dizini, sonra motor** — markdown ucuz, motor kodu tasarım donunca yazılır. Bitmiş workflow dizini + Bölüm 5 = motorun donmuş spec'i.

**Karar özeti:** kolonlar `to_do → in_progress → test → review → done` (`merge` kolonu YOK). 5 planning-seçimli gate; `test`'tekiler PARALEL, join motorun. Sahip (assignee=developer) sabit, "sıra kimde" kolon+bayraktan türetilir. Deployment = ortam merdiveni (item→dev, epic→staging, version→preprod, onay→prod). spike otonom+her-zaman-gate. maintenance silindi. rollback+hotfix→incident.

**Workflow turu TAMAMLANDI** — 9 workflow (rakamsız), 382/382 test + typecheck yeşil, tüm DAG'lar elle+motorla doğrulandı.

| Workflow | Durum |
|---|---|
| `development-cycle` | ✅ implement → `test`'e taşı, orada biter |
| `test-cycle` | ✅ 5 gate paralel + UAT fan-in; gate-run kaydı (rapor yazmaz); code-review SECURITY okumaz |
| `planning-pipeline` | ✅ gate seçimi (`code_review`+`uat`, `security_check→security_control`) |
| `deployment-cycle` | ✅ ortam merdiveni (epic→staging 5 paralel rapor, version→preprod, onay→main+prod); red→bug |
| `incident-pipeline` | ✅ rollback+hotfix birleşik (triaj→dal→ortak kapanış) |
| `spike-pipeline` | ✅ otonom tetik + her-zaman prime gate + sade rapor |
| `environment-setup` | ✅ ACCESS "Ortamlar" bölümü (§5.6/§5.11) |
| `new/existing-project-analysis` | ✅ tutarlı (foundation üretici, dokunulmadı) |
| ~~`maintenance-cycle`~~ | ✅ SİLİNDİ (§5.12 — çıktısı planning/backlog'a eriyor) |
| Motor/şema epic (§5.9) | ⏳ SIRADAKİ — workflow dizini donmuş spec |

**Disipline:** workflow markdown'ları ev-stilinde (normal cümle, `## Faz`+`1. **+persona:**`), parser'a dokunma; `inputs:` tam path (`.kortext/references/X.md`), prose'da çıplak rozet (`STACK`); foundation OKUMA (analiz hariç). Motor implikasyonları §5.9'a biriktir.

## 4. Bekleyen — content review turu

`development/` cleanup'ı bitince Kortext'in **çekirdek akış dosyalarının** içeriği gözden geçirilecek (Faz 13'te baştan yazıldı ama kalibrasyon lazım):

1. `templates/AGENTS.md` — kullanıcının ilk gördüğü AI bootstrap
2. `agents/*.md` — 14 persona
3. `rules/*.md` — 6 rule (behavior, branching, commands, emergency, mcp, models)
4. `workflows/*.md` — 12 workflow (00 → 09)
5. `templates/{foundation,references,reports,memory,backlogs}/*.md` — kullanıcı projesine kopyalanan iskelet
6. **`agents/` ve `workflows/` artık `_codebase` tarafında düzenlenir** (eski `_docbase` sync mekanizması kaldırıldı; tek kaynak burası).

Bilinen risk noktaları (Faz 13 hızlı yazımdan):
- `existing-project-analysis.md` — pattern apply (~30 sn yazıldı), kalibre gerek
- `02b-spike-workflow.md` — dinamik persona oversimplification
- `development-cycle.md` + `test-cycle.md` — lifecycle redesign aktif turu, bkz. §3 (DECISIONS Bölüm 5 spec). Motor/şema desteği §5.9'da listeli, en sona bırakıldı
- `07-rollback-pipeline.md` — workflow gate yok kararı (incident-driven), sorgulanabilir
- `09-maintenance-cycle.md` — engine bookkeeping step #2 yeni semantik, test edilmedi

## 5. Bekleyen — v3.1 CLI/onboarding redesign (devasa sürüm parçası)

[DECISIONS.md Bölüm 0](./DECISIONS.md)'da yön belirlendi: multi-project daemon, postinstall otomatik onboard, native folder picker, 9 komutluk yeni CLI (`start/stop/pause/list/remove/purge/update/doctor/help`), `remove` ve `purge` ayrı komut. Implementation [TODO.md](./TODO.md)'deki sıralı 11 adımlı kuyrukta. v3.0 `init/serve` modeli implementation tamamlanana kadar mevcut kalacak; v3.1.0 release ile tek atışta clean break.

## 6. Açık konular

Detaylı liste [TODO.md](./TODO.md)'de. Kritik üçü:
- Manuel UAT (Eray makinesinde clean `kortext-uat/` üzerinde tgz + init + serve + analysis çalıştır)
- v3.0.1 borç: `app.listen()` EADDRINUSE silent-fail handler
- v3.1 CLI redesign implementation (DECISIONS Bölüm 0, TODO sıralı kuyruk)

## 7. Linkler

- Mimari: [ARCHITECTURE.md](./ARCHITECTURE.md) (gotcha'lar §16'da)
- Kararlar: [DECISIONS.md](./DECISIONS.md) (Bölüm 0 = CLI redesign, Bölüm 1 = Faz 13, Bölüm 2 = v3.1 refactor, Bölüm 5 = Development + Test Lifecycle redesign)
- Tasarım: [DESIGN.md](./DESIGN.md)
- UAT rehberi: [UAT-GUIDE.md](./UAT-GUIDE.md)
- Açık iş listesi: [TODO.md](./TODO.md)
- Claude için davranış: [../CLAUDE.md](../CLAUDE.md) (dosya haritası dahil)
