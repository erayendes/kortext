# Planning Pipeline

> **Yalnız istekle koşar:** kuyruğa `planning` isteği düşünce (panelde "Kopeng'e aktar")
> ya da +prime açıkça isteyince. Analiz belgeleri onaylanmadan başlama — adımların
> `inputs:` listesi bağımlılık kuralına tabidir (AGENTS.md §2.3).
>
> **Bu dosyada:** Onaylı analiz, kanonik backlog'a (`backlog.yaml`) ve insan/ajan iş
> listesine (`TODO.md`) dönüştürülür. Persona/model ataması YOK — atama yalnız
> `ai` | `prime`. Görev takibi Kortext'in dışındadır (dosya ya da Kopeng).

## Backlog

1. **+engineering-manager:** Kanonik backlog'u üret: `.kortext/foundation/backlog.yaml`.
   Dosya **sadece geçerli YAML** olmalı (markdown/prose/code-fence YOK). Şema — bu şema
   **dondurulmuş dışa-aktarım sözleşmesidir** (Kopeng bu formata uyar), alan ekleme/çıkarma:

   ```yaml
   project: ACME            # kısa proje kodu (id öneki)
   versions:
     - id: v0.1
       goal: "Çekirdek akış çalışır"
   epics:
     - id: ACME-E01
       title: "Kimlik ve hesap"
       version: v0.1        # her epic bir versiyona bağlı
       description: "…"
   tasks:
     - id: ACME-T001
       title: "E-posta ile kayıt"
       epic: ACME-E01       # her task bir epic'e bağlı
       description: "Ne yapılacak + kabul ölçütü tek paragraf"
       assignee: ai         # yalnız ai | prime
       blocked_by: []       # task id listesi; yoksa boş liste (alanı asla atlama)
   ```

   Disiplin:
   - **Kapsam tavanı:** PRD/BRD'de item sınırı ya da "MVP/küçük" notu varsa aşma;
     şüphede daha az, daha büyük item. Bir özellik = bir task; frontend/backend/test
     diye BÖLME.
   - **ID konvansiyonu:** `<CODE>-E01`, `<CODE>-T001` — slug/kebab-case id YASAK.
   - **Az versiyon:** MVP için 1–3 versiyon; v0.x'ten v1.0'a mantıksal sıra.
   - **+prime ön-gereksinimleri (ZORUNLU):** STACK/SECURITY/LEGAL/API belgelerini tara;
     insan aksiyonu gerektiren her ihtiyacı (hesap açma, API key, domain, cihaz, bütçe
     onayı) `assignee: prime` task'ı olarak üret ve ona bağımlı task'ların
     `blocked_by`'ına ekle.
   - **Bağımlılıklar:** gerçek sıralama zorunluluklarını `blocked_by` ile kur;
     dangling id bırakma.
   - inputs: `.kortext/foundation/PRD.md`, `.kortext/foundation/TRD.md`, `.kortext/TEST.md`, `.kortext/STACK.md`, `.kortext/SECURITY.md`, `.kortext/LEGAL.md`, `.kortext/API.md`
   - outputs: `.kortext/foundation/backlog.yaml`

2. **+operation-manager:** `backlog.yaml`'i baştan sona denetle ve DÜZELTİLMİŞ tam dosyayı
   yeniden yaz (patch değil): şema alanları eksiksiz mi (`version`, `epic`, `assignee`,
   `blocked_by` en az `[]`), id'ler konvansiyona uyuyor mu, `blocked_by` referansları
   gerçek id'lere mi işaret ediyor, versiyon sayısı kapsamla orantılı mı, `prime`
   ön-gereksinimleri var mı. Bulduğun sorunları düzelt; düzeltilemeyeni TODO.md'nin
   "Açık riskler" bölümüne not düşeceksin (sonraki adım).
   - inputs: `.kortext/foundation/backlog.yaml`
   - outputs: `.kortext/foundation/backlog.yaml`

## TODO

3. **+operation-manager:** Konsolide iş listesini üret: `.kortext/TODO.md`.
   Frontmatter: `status: draft`, `author: +operation-manager`, `approver: +prime`.
   İçerik: versiyon → epic → task hiyerarşisinde checkbox listesi (`- [ ] ACME-T001 — başlık`),
   bağımlılık sırasına dizilmiş; `assignee: prime` task'ları **"+prime'a düşenler"** başlığı
   altında ayrıca listele; en sonda **"Açık riskler"** bölümü (denetimden kalanlar; yoksa "yok").
   Bu dosya plan gate'idir: +prime panelden onaylayınca (`status: approved`) plan yürürlüğe girer.
   - inputs: `.kortext/foundation/backlog.yaml`
   - outputs: `.kortext/TODO.md`
   - approver: +prime
