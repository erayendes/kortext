# Kortext — UAT Oturum Promptu

> Yeni bir Claude Code oturumu açıp **sadece UAT** yapmak için: ya bu dosyanın altındaki bloğu kopyala-yapıştır, ya da oturuma sadece **"şunu oku ve uygula: development/UAT-SESSION-PROMPT.md"** yaz (oturum dosyayı kendi okur).

---

Bu oturum **sadece Kortext UAT'ı** içindir — kod geliştirme değil, ürünü gerçek koşullarda test etme + gözlem + küçük düzeltme.

**Önce oku:** `development/UAT-GUIDE.md` (en üstteki "⭐ TAM & GERÇEK UAT" bölümü), `development/HANDOVER.md` (son durum), `development/DECISIONS.md` Bölüm 7 (bu sürümde ne yapıldı). Bunları okuyup bana tek paragraf "neredeyiz" özeti ver, sonra UAT'a hazırlan.

**Ben (Eray):** non-coder, Türkçe konuşurum, GUI-first. Terminal sadece sistem kontrolü için. Bana sade dille anlat (jargon değil), somut göster (ekran/dosya yolu/durum). Mimari kararları AskUserQuestion ile öneri-başta sor.

**Rolün (UAT kolaylaştırıcı):**
1. Paketlenmiş kurulumu hazırla (build + pack + global install) — her zaman **en güncel build**.
2. Daemon'u başlat, ben tarayıcıda gezerim; sen yan masadan **logları/DB durumunu** izle (`/api/...`, daemon.log, `kortext list`).
3. **Ne olduğunu bana açıkla** — "şu an X ajanı Y üretiyor" gibi; ekranda anlamadığım şeyi netleştir.
4. **UAT bulgularını topla** (UX kusuru, kafa karışıklığı, bug) → kaydet; küçük/net olanları (metin, etiket, görünür davranış) onayımla hemen düzelt; büyük olanları TODO'ya yaz, sormadan büyük refactor yapma.
5. UAT sonunda **temizlik** yap (aşağıda).

**Akış (gerçek claude ajanıyla, ben +prime):** `kortext start` (proje yok) → sihirbaz tarayıcıda açılır → onboarding (proje bilgisi + BRD + **proje dizinini sihirbazda seç** = boş bir klasör) → Kortext klasörü iskeleler + **git'i otomatik kurar** + gerçek daemon'u doğurur + tarayıcı oraya geçer → analiz (12 adım sıralı, +prime kapıları) → planning (Board: kodlu id'ler `<KOD>-NNN`/`<KOD>-E0N` + bağımlılıklar + `blocked` durumları) → "Auto" ile build (bloksuz item'lar paralel kodlanır, 6 eşzamanlı; blocker bitince bağımlı açılır; review+UAT bana gelir) → epic→staging-onay → version→preprod-onay → gerçek `development→main` merge+tag.

**Kurulum (yorumsuz — zsh'de `#` komuta argüman olur):**
```
cd /Users/erayendes/Documents/_codebase/kortext
npm run build
npm pack
npm install -g ./kortext-3.1.0.tgz
kortext --version
```
`kortext --version` → `3.1.0` olmalı.

**Test projesi başlat** (tek komut — sihirbaz dizini sorar, git'i otomatik kurar):
```
KORTEXT_DRIVE_ENABLED=1 KORTEXT_CLAUDE_BIN=$(which claude) kortext start
```
Sihirbaz `:3199`'da açılır → onboarding'i doldur, **proje dizinini sihirbazda seç** (boş bir klasör; örn. `/Users/erayendes/Documents/_codebase/milowda-pass`) → Başlat. Kortext o klasörü iskeleler, **git'i otomatik kurar** (init + commit + `development`), gerçek projeyi `:3200`'de doğurur, tarayıcı oraya geçer; analiz kendiliğinden başlar. **Elle `kortext init` / `git` YOK** — eski akış buydu, artık gerekmiyor.

**Bilinen tuzaklar / gotcha'lar:**
- Komut bloklarında **inline `# yorum` yok** (zsh `interactivecomments` kapalı → `npm pack #` "Invalid tag name" verir).
- `--executor=claude` için `KORTEXT_CLAUDE_BIN=$(which claude)` **şart** (sihirbazdaki "binary path" alanına da yazılabilir). Bu env sihirbazdan doğan gerçek daemon'a da geçer.
- Build fazı git ister; sihirbaz projeyi oluştururken git'i **otomatik** kurar (init + commit + `development`). Mevcut git repo'lu klasör seçersen sadece `development` dalı garanti edilir, dosyalarına dokunulmaz. Elle git komutu YOK.
- `kortext start` önce sihirbazı `:3199`'da açar; onboarding bitince gerçek proje `:3200`'e (sıradaki boş porta) geçer ve tarayıcı oraya yönlenir. Açmazsa `open http://localhost:3199` (sihirbaz) / handoff sonrası `:3200`.
- Gerçek claude **yavaş** (adım başına dakikalar) + maliyetli. **İlk UAT'ı KÜÇÜK fikirle** yap (5-8 özellik). Bir adım çok uzun "running" kalırsa (bilinen hung-claude follow-up'ı) o koşuyu durdur/retry.
- **Kendi Claude Code oturumunu (beni/ajanı) öldürme** — `pkill claude` YASAK. Ajan süreçlerini sadece `lsof +D <proje-dizini>` ile hedefli kapat.
- Deploy'lar (staging/preprod/prod-push) **mock**; gerçek olan tek şey son `development→main` merge+tag.

**Açık UX tartışmaları (UAT'ta netleşecek):**
- Dashboard şeffaflığı: "Active work" satırı adımın ne ürettiğini göstermeli (şu an `new-project-analysis 1/12 + persona` kriptik).
- Analiz neden tek-tek koşuyor (bağımlılık zinciri — sıralı) vs build neden paralel (bağımsız item'lar, 6 eşzamanlı) — kullanıcıya bunu görünür kıl.

**Temizlik (UAT bitince / sıfırlamak için):**
```
kortext stop
kortext purge <proje-slug> --yes
lsof -ti:3199 | xargs kill
```
- `kortext stop` sadece **kayıtlı** projeleri durdurur. Sihirbaz daemon'u (`:3199`) kayıtsızdır ama artık **handoff sonrası kendini kapatır** ("bellboy" self-shutdown, ~2sn) → normalde `:3199` kendiliğinden boşalır. Üstteki `lsof -ti:3199 | xargs kill` yalnız emniyet kemeri (örn. onboarding'i yarıda bırakıp hiç submit etmediysen).
- Ardından test klasörünün içini boşalt (gerekirse `rm -rf <dizin> && mkdir <dizin>`) ve `lsof +D <dizin>` ile kalan ajan süreci kalmadığını doğrula. `:3199` + `:3200` boş + `kortext list` temiz olmalı.

**Davranış kuralları:** `origin/main`'e ben **açıkça "push" demeden** push yok (lokal commit serbest). Büyük mimari kararları sormadan alma. Doğrulamadan "oldu" deme (curl/log/ekran göster).
