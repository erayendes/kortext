# Kortext — Handover

> Yeni Claude Code oturumu için bootstrap pusulası. Açar açmaz şu prompt'u yaz:
> **"HANDOVER.md'yi oku, devam edelim."**

---

## 1. Şu an (2026-05-27)

**main HEAD:** `6dc2fb6` (Faz 13 — workflow content rewrite + foundation/ category + docs konsolidasyon + repo housekeeping)

| Test | Lint | Typecheck | Build |
|---|---|---|---|
| 382/382 ✅ | 0 hata · 4 pre-existing warning | 0 hata | temiz |

**Açık PR:** yok.

**npm registry:** `kortext@3.0.0` broken (EADDRINUSE silent fail bug). v3.1.0 release (devasa sürüm: Faz 11-13 + CLI redesign) lokal tgz UAT geçtikten sonra yapılacak.

## 2. Geçmiş özet

Faz 13 tamamlandı: engine output-resolver, callout → approver-based gate, `.kortext/foundation/` kategorisi, 13 reference ALL-CAPS rename, 12 workflow rewrite (AI-odaklı imperative ton), `docs/ → development/` konsolidasyon. Detaylar [DECISIONS.md Bölüm 1](./DECISIONS.md).

## 3. Aktif iş — development/ docs cleanup turu

Eray + Claude `development/` altındaki kanonik dokümanları tek tek temizliyor. Hedef: duplikasyonları sil, ölü linkleri düzelt, her dosyaya net bir sorumluluk ver.

| Dosya | Durum |
|---|---|
| `CLAUDE.md` | ✅ tamamlandı — dosya haritası eklendi, ölü linkler temizlendi, mimari/sample/v2-archive bölümleri taşındı |
| `development/HANDOVER.md` | 🔄 bu commit'te |
| `development/DECISIONS.md` | ⏳ bekliyor (Bölüm 0 CLI/onboarding redesign zaten eklendi) |
| `development/ARCHITECTURE.md` | ⏳ bekliyor (v2 archive + gotchas bölümleri yeni eklendi) |
| `development/DESIGN.md` | ⏳ bekliyor |
| `development/TODO.md` | ⏳ bekliyor |
| `development/UAT-GUIDE.md` | ⏳ bekliyor |

**Disipline:** her dosya için → mevcut içeriği tara → duplikasyon/ölü/yanlış-yerli olanları işaretle → öneri planı sun → Eray onaylar → uygula → bir sonrakine geç.

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
- `development-cycle.md` — yeniden tasarlandı + rename edildi (DECISIONS Bölüm 5: kolon modeli, dinamik `+assignee`/`+approver`, engine-owns-mechanics). Motor/şema desteği (lifecycle geçişleri, dinamik persona, merge hedefi, blocker temizleme, comments) implementation bekliyor
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
- Kararlar: [DECISIONS.md](./DECISIONS.md) (Bölüm 0 = CLI redesign, Bölüm 1 = Faz 13, Bölüm 2 = v3.1 refactor, Bölüm 5 = Development Lifecycle redesign)
- Tasarım: [DESIGN.md](./DESIGN.md)
- UAT rehberi: [UAT-GUIDE.md](./UAT-GUIDE.md)
- Açık iş listesi: [TODO.md](./TODO.md)
- Claude için davranış: [../CLAUDE.md](../CLAUDE.md) (dosya haritası dahil)
