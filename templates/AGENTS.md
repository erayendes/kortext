# AGENTS.md — Kortext çalışma sözleşmesi (v1.0)

> **Bu dosyayı ilk sen okursun.** Bu proje **Kortext** ile yönetiliyor: Kortext projenin
> pasif beynidir — süreci tanımlar, belgeleri ve onay durumlarını izler, istekleri kuyruğa
> alır. **İşi sen yaparsın** (hangi model/araç olursan ol). Kortext sana iş dağıtmaz,
> seni çalıştırmaz; sen bu sözleşmeye uyarsın, +prime (insan) panelden onaylar.

## 0. Bağlantı (her oturumda bir kez)

- Kortext MCP bağlıysa (`kortext` server) → **her fazın ve her adımın başında**
  `get_pending_requests(repo_path: <bu reponun mutlak yolu>)` çağır. Bekleyen istek varsa
  ÖNCE onları işle (aşağıda §4), sonra kaldığın yere dön.
- MCP bağlı değilse +prime'a tek satır kurulum komutunu hatırlat:
  `claude mcp add --transport http kortext http://localhost:4200/mcp`
  (panel varsayılan portu 4200; +prime farklı port kullanıyorsa ona göre).

## 1. Kaynak gerçeği (source of truth)

- `.kortext/foundation/` — *ne yapılacak*: `BRD` (brief), `PRD`, `TRD`, `PFD`.
- `.kortext/references/` — *nasıl yapılacak*: `STACK, SECURITY, API, DATABASE, DESIGN, …`
  Kod ve içerik üretirken bunlara uy. `status: uninitialized` dosya henüz yok sayılır.
- `.kortext/workflows/` — süreç tanımları. Adımlar `inputs:` / `outputs:` / `approver:` taşır.
- `.kortext/agents/` — persona perspektifleri. Bir belgeyi hangi persona yazıyorsa
  (`author: +…`) o dosyadaki bakış açısıyla yaz.
- `.kortext/memory/` — `handover.md`, `decisions.md`, `learned.md` (aşağıda §6).
- Bilgi eksikse **varsayım yapma**: belgeye açık soru olarak yaz ve +prime onayında sorulmasını sağla.

## 2. Faz A — Analiz

1. **Brief kapısı:** `.kortext/foundation/BRD.md` frontmatter'ında `status: approved` değilse
   DUR ve +prime'a söyle: brief paneldeki onaydan geçmeli.
2. Workflow seç: yeni ürün → `new-project-analysis.md`; mevcut kod tabanı → `existing-project-analysis.md`.
3. Adımları sırayla uygula. **Bağımlılık kuralı (çekirdek):**
   - Bir adımın `inputs:` listesindeki TÜM dosyalar `status: approved` olmadan o adımın
     çıktısını YAZMA.
   - Girdileri hazır olan adımları bekletme, hemen üret; birbirinden bağımsız adımlar
     art arda tek oturumda yazılabilir.
4. Her çıktıyı ilgili şablonun üstüne değil **şablonu doldurarak** üret; frontmatter:
   `status: draft`, `author: +persona`. Onay HER ZAMAN +prime'ındır — hiçbir belgeyi
   kendin `approved` yapma.
5. Yazabileceğin adım kalmadığında: +prime'a hangi belgelerin onay beklediğini listele ve dur.
   (Onaylar panelden düşer; yeni oturumda/devamda durumları dosyadan yeniden oku.)

## 3. Faz B — Planlama (YALNIZ istekle)

Analiz bitti diye planlamaya GEÇME. Planlama yalnız iki tetikle koşar:
kuyruğa `planning` isteği düşmesi (paneldeki "Kopeng'e aktar") ya da +prime'ın açık talimatı.
O zaman `.kortext/workflows/planning-pipeline.md`'yi uygula → `backlog.yaml` + `TODO.md`
üret (`status: draft`) → +prime onayına bırak.

## 4. İstek kuyruğu — türler ve işleme

`get_pending_requests` dönen her istek için; bitince `complete_request(request_id)`:

- **`revise`** — payload: `{doc, notes[]}`. Belgeyi notlara göre yeniden yaz; frontmatter'ı
  `status: draft`'a çek (onay yeniden +prime'a düşer). O belgeye bağımlı `approved` belgeler
  etkileniyorsa +prime'a söyle.
- **`report`** — payload: `{report_type}`. Şablonu `.kortext/templates/reports/`ten al
  (`risk` → `risk-report.md`, `decisions` → `decision-summary.md`), doldur ve
  `.kortext/reports/<tür>-<YYYY-MM-DD>.md` olarak yaz (frontmatter: `status: report`, `type: <tür>`).
- **`planning`** — §3'ü koş.
- **`question`** — +prime'ın serbest sorusu; cevabını istekte belirtilen belgeye/`reports/`a yaz.

## 5. Faz C — Geliştirme (planlama onaylandıysa)

1. **Seç:** `TODO.md`'den sıradaki işaretsiz (`- [ ]`) görevi al; liste bağımlılık sırasındadır,
   sırayı bozma. `blocked_by`'ı bitmemiş görevi atla.
2. **Yap:** işi `references/`'a uyarak tamamla.
3. **İşaretle:** bitince satırı `- [x]` yap.
4. **Kaydet:** §6 hafıza disiplini.
+prime'a düşen görevler (`assignee: +prime` / `@prime`) senin değil — atla, gerekiyorsa hatırlat.

## 6. Hafıza disiplini (her fazda)

- Önemli karar → `.kortext/memory/decisions.md` (en üste ekle, silme; tek satır + gerekçe).
- Ders/tekrar-önleme → `.kortext/memory/learned.md`.
- Oturum sonu / uzun aranın öncesi → `.kortext/memory/handover.md` en üstüne:
  ne yaptım · hangi dosyalara dokundum · sıradaki ne. Yeni oturum ÖNCE handover + durumları okur.
- **Read-before-Write:** paylaşılan bir dosyaya yazmadan önce güncel halini oku.

## 7. Davranış anayasası (öz)

- **Dil:** +prime ile iletişim +prime'ın dilinde; kod, commit, değişken, yorum İngilizce;
  ürün-içi metin hedef proje dilinde.
- **Secrets:** API anahtarı/şifre/token asla koda, belgeye, şablona yazılmaz — yalnız `.env`
  (repo dışı) + anahtar isimleri `.env.example`'da. Sızıntı fark edersen: durdur, +prime'a bildir,
  anahtarın iptalini öner; git geçmişi temizliği +prime kararıdır.
- **Tıkanma (3-deneme kuralı):** aynı engelde 3 farklı yöntem başarısızsa DUR; denemeleri ve
  önerini `handover.md`'ye yaz, +prime'a sor. Sessiz workaround'la ilerleme.
- **Onay çizgisi:** `approver: +prime` olan hiçbir şeyi kendin onaylama; `approved` bir
  foundation/references belgesini istek olmadan değiştirme.
- **Çelişki:** belgeler arası çelişki görürsen üretimi durdurup +prime'a sor; sessizce birini seçme.
