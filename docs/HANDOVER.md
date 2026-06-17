# Kortext — Handover

> Yeni Claude Code oturumu için bootstrap pusulası. Açar açmaz şu prompt'u yaz:
> **"HANDOVER.md'yi oku, devam edelim."**
>
> Bu dosya = **pusula** (son 2-3 devir + açık işler + linkler). Tüm tarihçe [DECISIONS.md](./DECISIONS.md)'de, açık iş listesi [TODO.md](./TODO.md)'de.

---

## ⭐ Şu an (2026-06-17) — v6 dashboard migrasyonu + tasarım-sistemi hizalaması MERGE'LENDİ + push'landı

Bu oturum GUI/tasarım odaklıydı. Tüm v6 dashboard işi + tasarım-sistemi hizalaması tek commit'te **`a6c0ce6`** ile `main`'e fast-forward + **`origin/main`'e push** edildi (Eray açık onayı). **1313 test yeşil**, typecheck temiz. Detaylar: [DECISIONS.md](./DECISIONS.md) Bölüm 17.

- **DESIGN.md kanonik oldu:** eski mor/dark-first spec yerine **yeni otoritatif `docs/DESIGN.md`** (cool-neutral, light-first, themeable; §0–§8). Kod buna hizalandı:
  - **Butonlar** → kanonik set (`primary/secondary/ghost/danger/success/sm/icon`); legacy `btn-pri`/`btn-line`/`btn-approve`/mükerrer `.btn` silindi (dark `#fff` bug'ı çözüldü).
  - **İkonlar** → §6 tam eşleme app geneli (folder nav, item-type/detay glyph'leri, `github→GitMerge`, `sentry→Radio`, `cli→SquareTerminal`, `lock→LockKeyhole`, dosya satırları→FileText, child→ListTree, ask-ai→BotMessageSquare).
  - **Toggle off-state** ters çevrildi (light=koyu knob+beyaz halka / dark=tersi — Eray tercihi; DESIGN.md §5.5 güncel).
  - **Density** varsayılanı `comfortable` (--d-scale 1.2).
  - **Persona renkleri** → §7 roster'ı `--a-*` token'larıyla (16 persona; `+orchestrator`=operation-manager indigo); footer ajan ikonu nötr.
- **v6 ekranlar gerçek veriye bağlı:** Dashboard·Board·Memory·Foundation·References·Reports·Project info·Integrations·Environments. Onboarding gate status-driven (`blueprint.status==='approved'`). Yeni: Environments per-env (public/secret), LLM models engine ekranı, Integrations yeniden yapı (store-only), Onboarding Initialize+Setup, project-danger + orphan-sweep.
- **Doküman bakımı (bu oturum):** TODO.md sadeleştirildi (279→148 satır, bitmiş post-mortem'ler çıkarıldı). DECISIONS.md düzeltildi (mükerrer "Bölüm 7"→16, supersede notları, eksik Bölüm 17 eklendi). 8 atıl local branch silindi.

**SIRADAKİ:**
- **(Eray, operasyonel) Tam-zincir UAT** — #10k/#10L/#10M kod fix'leri merge'li ama CANLI tam-zincir doğrulanmadı: temiz UAT'ta codex/antigravity ile build'i sonuna kadar koştur → planning epic>0 (görünür), implementation kod üretir, motor commit+merge → `development`'ta app dosyaları gerçekten var, gate'ler geçer, item done sahte değil.
- **(kod) TODO öncelikleri:** model profilini gerçek `--model`'e bağla · build-start (planning sonrası development-cycle tetikleme) · Hooks/Scripts/Integrations operasyonel bağlama · Onboarding Setup'ı canlı akışa bağla · doküman temizliği (PERSONA-ICONS + eski wireframe'ler).

**Rebuild (Eray çalıştırır, UAT için):**
```bash
cd /Users/erayendes/Documents/_codebase/kortext
npm install -g ./kortext-3.1.0.tgz
kortext stop not; kortext purge not --yes
```

---

## ⭐ Önceki (2026-06-12 #10M kod) — Üretilen kod artık development'a MERGE OLUYOR (boş-merge bug'ı kapandı) · ✅ a6c0ce6'da merge'li

Ajan worktree'ye yazıyor ama `git commit` etmiyordu → gate çalışma ağacını okur (pass), merge branch-HEAD'i taşır (commit yok → boş merge) → sahte "done", `development` boş. **Karar: motor commit etsin.** `commitWorktreeChanges` (`worktree.ts`, `git add -A`+commit, kimliksiz/hook'lu çalışır) `runItem` başarı dalında no-op guard'dan ÖNCE çağrılır; guard `worktreeHasMeaningfulCommit`'e (`base...HEAD`) bağlandı. Regresyon: `WritesButNeverCommitsExecutor` e2e. (Tam karar: DECISIONS §17.3.)

## ⭐ Önceki (2026-06-11 #10L kod) — Codex implementation artık KOD YAZIYOR (canlı kanıtlı) · ✅ a6c0ce6'da merge'li

codex implementation dosya okuyup `exit 0` dönüyordu, yazmıyordu (executor-bağımlı; kök=PROMPT, sandbox/cwd değil). **Fix:** `ExecutorContext.itemContext` (hangi item uygulanacak prompt'a girer) + codex/gemini prompt'una `--- Mandate ---` (dosya ÜRET, salt-okuma=fail). No-op guard `worktreeHasMeaningfulChanges`'e (en az 1 app/kod uzantısı) sıkıştı; version-floor v0.1. Canlı: codex 58sn'de index.html+css+js+test yazdı. (Tam karar: DECISIONS §17.2.)

---

## Sabitler (her oturum)

- **Eray:** non-coder, Türkçe konuşur, kod+commit+yorum İngilizce, GUI-first, somut artefakt ister (screenshot/dosya yolu/çalışan önizleme).
- **Mimari/UX kararları:** `AskUserQuestion` ile **sade dille** (jargon değil, öneri başa). Büyük kararları Eray onaylar.
- **Push kuralı:** `origin/main`'e Eray **açıkça "push"/"merge" demeden** push YOK. Lokal commit serbest.
- **Önizleme tuzakları (kayıtlı):** `tsx watch` server dosyası düzenlenince restart olur → düşerse `preview_start`. `preview_eval` reload/animasyonda flaky → reload AYRI çağrıda, kısa senkron eval tercih et. `preview_screenshot` 1-2 kare geride olabilir → ölçü/durum için `getComputedStyle`/DOM teyidi (screenshot ikincil).

## Linkler

- Mimari: [ARCHITECTURE.md](./ARCHITECTURE.md) · Kararlar: [DECISIONS.md](./DECISIONS.md) · Tasarım: [DESIGN.md](./DESIGN.md) · Açık iş: [TODO.md](./TODO.md) · UAT: [UAT-GUIDE.md](./UAT-GUIDE.md) · Davranış+dosya haritası: [../CLAUDE.md](../CLAUDE.md)
