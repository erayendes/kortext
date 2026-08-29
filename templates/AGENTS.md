# AGENTS.md — Kortext çalışma sözleşmesi (v1.0)

> **Bu dosyayı ilk sen okursun.** Bu proje **Kortext** ile yönetiliyor: Kortext projenin
> pasif beynidir — süreci tanımlar, belgeleri ve onay durumlarını izler, istekleri kuyruğa
> alır. **İşi sen yaparsın** (hangi model/araç olursan ol). Kortext sana iş dağıtmaz,
> seni çalıştırmaz; sen bu sözleşmeye uyarsın, +prime (insan) panelden onaylar.

## 0. Bağlantı (her oturumda bir kez)

- Kortext MCP bağlıysa (`kortext` server) → **her fazın ve her adımın başında**
  `get_pending_requests(repo_path: <bu reponun mutlak yolu>)` çağır. Bekleyen istek varsa
  ÖNCE onları işle (§4), sonra kaldığın yere dön.
- Süreç tanımları projede DEĞİL, Kortext'tedir: adımları `get_workflow(name)` ile,
  yazar perspektifini `get_persona(handle)` ile çek. Genel durum: `get_project_context`.
- MCP bağlı değilse +prime'a tek satır kurulum komutunu hatırlat:
  `claude mcp add --transport http kortext http://localhost:4200/mcp`
  (varsayılan port 4200; +prime farklıysa ona göre) — bağlantı olmadan süreç yürümez.

## 1. Kaynak gerçeği (source of truth) — `.kortext/`

- **Kök** (`.kortext/*.md`) — *canlı çekirdek, her gün başvurduğun yapı taşları*:
  `ARCHITECTURE, STACK, STRUCTURE, API, DATABASE, SECURITY, DESIGN, TEST, LEGAL,
  GROWTH, CONTENT, ENVIRONMENT` + `DECISIONS.md` (karar günlüğün) + `TODO.md`
  (plan onaylandıysa iş listesi). Kod ve içerik üretirken bunlara uy.
  `status: uninitialized` dosya henüz yok sayılır — atla.
- **`foundation/`** — *donmuş başlangıç*: `BRD` (brief), `PRD`, `TRD`, `PFD`, `backlog.yaml`.
  Onaylandıktan sonra istek olmadan değiştirilmez; gerektiğinde bak.
- **`reports/`** — *insan için çıktılar*: senin yazdığın raporlar buraya düşer.
- Bilgi eksikse **varsayım yapma**: belgeye açık soru olarak yaz ve +prime'a sor.

## 2. Faz A — Analiz

1. **Brief kapısı:** `foundation/BRD.md` `status: approved` değilse DUR, +prime'a söyle.
2. Workflow'u çek: yeni ürün → `get_workflow("new-project-analysis")`;
   mevcut kod tabanı → `get_workflow("existing-project-analysis")`.
3. Adımları sırayla uygula. **Bağımlılık kuralı (çekirdek):**
   - Bir adımın `inputs:` listesindeki TÜM dosyalar `status: approved` olmadan o adımın
     çıktısını YAZMA.
   - Girdileri hazır adımları bekletme; bağımsız adımlar art arda tek oturumda yazılabilir.
4. Her çıktıyı `.kortext/`teki iskelet şablonu doldurarak üret; yazar personasının
   perspektifini `get_persona` ile al. Frontmatter: `status: draft`, `author: +persona`.
   Onay HER ZAMAN +prime'ındır — hiçbir belgeyi kendin `approved` yapma.
5. Yazacak adım kalmayınca: hangi belgelerin onay beklediğini +prime'a listele ve dur.
   Yeni oturum kaldığı yeri dosya durumlarından okur (`get_project_context` da özetler).

## 3. Faz B — Planlama (YALNIZ istekle)

Analiz bitti diye planlamaya GEÇME. Tetik: kuyruğa `planning` isteği (paneldeki
"Kopeng'e aktar") ya da +prime'ın açık talimatı. O zaman
`get_workflow("planning-pipeline")` → `foundation/backlog.yaml` (dondurulmuş şema —
workflow'un içinde) + `.kortext/TODO.md` (`status: draft`) → +prime onayına bırak.
TODO.md onaylanınca plan yürürlüktedir.

## 4. İstek kuyruğu — türler ve işleme

Her istek için; bitince `complete_request(request_id)`:

- **`revise`** — `{doc, notes[]}`: belgeyi notlara göre yeniden yaz; `status: draft`'a çek
  (onay yeniden +prime'a düşer). Bağımlı `approved` belgeler etkileniyorsa +prime'a söyle.
- **`report`** — `{report_type, template}`: istekle gelen şablonu doldur,
  `reports/<tür>-<YYYY-MM-DD>.md` olarak yaz (`status: report`, `type: <tür>`).
  Karar Özeti (`decisions`) için kaynak: `.kortext/DECISIONS.md`.
- **`planning`** — §3'ü koş.
- **`question`** — +prime'ın serbest sorusu; cevabı istekte belirtilen yere yaz.

## 5. Faz C — Geliştirme (planlama onaylandıysa)

1. **Seç:** `TODO.md`'den sıradaki işaretsiz (`- [ ]`) görevi al; liste bağımlılık
   sırasındadır, bozma. `blocked_by`'ı bitmemiş görevi atla.
2. **Yap:** işi `.kortext/` kök belgelerine uyarak tamamla.
3. **İşaretle:** bitince satırı `- [x]` yap.
4. **Kaydet:** §6.
`assignee: prime` görevler senin değil — atla, gerekiyorsa hatırlat.

## 6. Karar günlüğü — DECISIONS.md

Tek hafızan bu. Sürece yön veren her kararı (teknik/ürün/tasarım/güvenlik) **verildiği anda**
`.kortext/DECISIONS.md`'nin EN ÜSTÜNE ekle; eskiler silinmez, onay döngüsüne girmez:

```
## YYYY-MM-DD — [karar başlığı]
[Tek paragraf: gerekçe; varsa elenen alternatif ve neden.]
```

Neden önemli: sonraki oturum (ya da başka bir ajan) "neden böyle" sorusunu buradan okur;
Karar Özeti raporu buradan derlenir. Kortext güncel tutulmadığını fark ederse
istek cevaplarında sana hatırlatır. **Read-before-Write:** paylaşılan dosyaya yazmadan
önce güncel halini oku.

## 7. Davranış anayasası (öz)

- **Dil:** +prime ile iletişim +prime'ın dilinde; kod, commit, değişken, yorum İngilizce;
  ürün-içi metin hedef proje dilinde.
- **Secrets:** API anahtarı/şifre/token asla koda, belgeye, şablona yazılmaz — yalnız `.env`
  (repo dışı) + anahtar isimleri `.env.example`'da. Sızıntı fark edersen: durdur, +prime'a
  bildir, anahtarın iptalini öner; git geçmişi temizliği +prime kararıdır.
- **Tıkanma (3-deneme kuralı):** aynı engelde 3 farklı yöntem başarısızsa DUR; denemeleri
  ve önerini DECISIONS.md'ye not düş, +prime'a sor. Sessiz workaround'la ilerleme.
- **Onay çizgisi:** `approver: +prime` olan hiçbir şeyi kendin onaylama; `approved` belgeyi
  istek olmadan değiştirme.
- **Çelişki:** belgeler arası çelişki görürsen üretimi durdur, +prime'a sor; sessizce seçme.
