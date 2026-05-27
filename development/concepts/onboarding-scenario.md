# Kortext — Uçtan Uca Senaryo

> Aktör formatı taslağı. Workflow .md içeriklerini bu disipline çekmeden önce prime onayı için scratch belge.
> Format: `prime:` (kullanıcı aksiyonu) / `sistem:` (engine davranışı) / `+persona:` (ajan aksiyonu).

---

## Adım 1 — Kurulum

**prime:** Bilgisayarında projesi için yeni bir klasör oluşturur (örn. `acme-crm`). Terminal'i açar ve `cd acme-crm` ile o klasöre girer.

**prime:** `npm install -g kortext` yazar.

**sistem:** Kortext bilgisayara global olarak kurulur. Artık her klasörden `kortext` komutu çağrılabilir.

**prime:** `kortext init` yazar.

**sistem:** Proje klasörünün içine çalışma iskeletini açar:

- `agents/` — ajan tanımları
- `workflows/` — iş akışları
- `rules/` — davranış kuralları
- `workspace/` — boş çalışma alanı (referanslar, raporlar, hafıza, backlog)
- `AGENTS.md` — ajan kataloğu
- `.kortext/` — sistemin iç defteri (veritabanı, log)

Hazır.

**prime:** `kortext serve` yazar.

**sistem:** Sunucu kalkar, tarayıcı kendiliğinden dashboard'u açar.

---

## Adım 2 — Proje başlatma

**sistem:** Dashboard onboarding ekranıyla açılır. Henüz proje yok.

**prime:** Proje adını yazar (örn. `Acme CRM`).

**prime:** Proje kodunu yazar (örn. `ACME`).

**prime:** Proje tipini seçer: **yeni proje** veya **mevcut proje**.

**prime:** Hedef platformu işaretler (Web / iOS / Android — birden fazla olabilir).

**prime:** Hangi AI'ın çalışacağını seçer: **Mock** (deneme), **Claude** veya **AGY**.

**prime:** Blueprint dosyasını (`blueprint.md`) sürükle-bırak yapar.

**prime:** **Initialize project** butonuna basar.

**sistem:** Blueprint kabul edildi, proje ayarları kaydedildi. Projenin tipine göre uygun akışı başlatır:

- Yeni proje → **Analiz akışı** (Adım 3a)
- Mevcut proje → **Keşif akışı** (Adım 3b)

Dashboard "1 active" pillini gösterir.

---

## Adım 3a — Analiz (yeni proje)

**sistem:** `01a-analysis-pipeline` başladı.

**+operation-manager:** Workflow'u okur. Hangi ajanların paralel çalışabileceğini belirler. Görevleri dağıtır.

**+product-manager:** Blueprint'i okur. Kullanıcı ihtiyaçlarını ve ürün gereksinimlerini `workspace/reports/product-requirements.md`'ye yazar.

**+designer:** Görsel dili, paleti ve tasarım sistemini `workspace/references/design-system.md`'ye yazar.

**+copywriter:** Ürünün ses tonunu, terminoloji kılavuzunu ve metin stratejisini `workspace/references/copy-guidelines.md`'ye yazar.

**+growth-expert:** Büyüme, SEO/ASO ve ölçümleme stratejisini `workspace/references/growth-strategy.md`'ye yazar.

**+compliance-expert:** KVKK/GDPR ve sektörel uyum gereksinimlerini `workspace/references/legal-strategy.md`'ye yazar.

**+engineering-manager:** Teknik yığını, mimari kararları ve kodlama standartlarını `workspace/references/tech-stack.md`'ye yazar.

**+db-admin:** Veri modelini ve veritabanı şemasını `workspace/references/db-schema.md`'ye yazar.

**+security-engineer:** Güvenlik kurallarını, risk haritasını ve önerilen kontrolleri `workspace/references/security-rules.md`'ye yazar.

**+qa-engineer:** Test stratejisini ve kabul kriterleri çerçevesini `workspace/references/test-strategy.md`'ye yazar.

**+operation-manager:** Tüm çıktıları derler. Özet ve "ne hazır, ne eksik" tablosunu `workspace/reports/analysis-reports.md`'ye yazar. Prime'a onaya sunar.

**sistem:** Dashboard sağ üst zilinde onay sorusu beliriyor: *"Analiz raporunu onaylıyor musun?"*

**prime:** Raporu okur. **Approve** der.

**sistem:** Planlama akışı (Adım 4) tetiklenir.

---

## Adım 3b — Keşif (mevcut proje)

**sistem:** `01b-onboarding-pipeline` başladı.

**+operation-manager:** Workflow'u okur. Keşif ajanlarını paralel dağıtır.

**+engineering-manager:** Mevcut kod tabanını tarar. Kullanılan dilleri, framework'leri ve mimari kararları `workspace/references/tech-stack.md`'ye yazar. Tespit edilen teknik borçları listeler.

**+db-admin:** Mevcut veritabanı şemasını çıkarır, `workspace/references/db-schema.md`'ye yazar. Şema risklerini işaretler.

**+security-engineer:** Bağımlılıkları, açık portları ve mevcut güvenlik kontrollerini tarar. Bulguları `workspace/references/security-rules.md`'ye yazar.

**+qa-engineer:** Mevcut test kapsamını ölçer. Eksik kalan kritik test alanlarını `workspace/references/test-strategy.md`'ye yazar.

**+designer:** Mevcut UI'yi inceler. Tasarım sistemi var mı, yok mu — bulguyu `workspace/references/design-system.md`'ye yazar.

**+product-manager:** Prime'ın blueprint'te yazdığı kısa vadeli hedefi mevcut sistemin durumuyla karşılaştırır. Boşlukları `workspace/reports/product-requirements.md`'ye yazar.

**+operation-manager:** Tüm bulguları derler. Mevcut durumun "sağlık panosunu" `workspace/reports/analysis-reports.md`'ye yazar. Prime'a onaya sunar.

**sistem:** Onay sorusu zilde belirir.

**prime:** Raporu okur. **Approve** der.

**sistem:** Planlama akışı (Adım 4) tetiklenir.

---

## Adım 4 — Planlama

**sistem:** `02-planning-pipeline` başladı.

**+operation-manager:** Workflow'u okur. Planlama ajanlarını dağıtır.

**+engineering-manager:** Analiz raporundan epic'leri çıkarır (örn. *Authentication*, *Billing*, *Dashboard*, *Admin*). Her epic'in altına task ve gerekirse debt item'ları açar. Backlog'a yazar.

**+qa-engineer:** Her item'a kalite ve test gate'lerini ekler (acceptance criteria, test türü, kapsam).

**+security-engineer:** Güvenlik açısından gate gerektiren item'lara güvenlik kontrol kaydı ekler.

**+designer:** UI içeren item'lara design review gate'i ekler.

**+engineering-manager:** Item'lar arasındaki bağımlılıkları ve önceliği belirler. Hangisi diğerini bekliyor, hangisi öncelikli — bunu işaretler.

**+engineering-manager + +operation-manager:** Her item'a assignee ajanı ve kullanacağı AI modelini atar (örn. *backend task → +backend-developer + Claude*).

**+operation-manager:** Dashboard board view'ı konsolide eder. *"Planlama tamam — N item, M epic, ortam kurulumu gerekiyor mu?"* sorusunu prime'a sunar.

**sistem:** Onay sorusu zilde belirir.

**prime:** Board'u inceler. **Approve** der.

**sistem:** Ortam kurulumu gerekiyorsa Adım 5 tetiklenir, gerekmiyorsa doğrudan Adım 6 (geliştirme) başlar.

> Not — Bir item planlanırken teknik belirsizlik çıkarsa: `02b-spike-workflow` tetiklenir. İlgili ajan time-boxed bir araştırma yapar, sonucu `workspace/memory/decisions.md`'ye karar kaydı (ADR) olarak yazar, sonra normal akışa dönülür.

---

## Adım 5 — Ortam kurulumu

**sistem:** `03-environment-setup` başladı.

**+devops-engineer:** `tech-stack.md`, `security-rules.md` ve `db-schema.md` dosyalarını okur. Projenin ihtiyaç duyacağı tüm harici servisleri tespit eder (örn. PostgreSQL, Stripe, Auth0, e-posta sağlayıcı).

**+devops-engineer:** Her servis için açık yapılandırma bilgilerini (URL, public key, ortam adı) `workspace/references/access.md`'ye yazar. Gizli anahtarların listesini ve sade açıklamalarını `.env.example` dosyasına yazar — gerçek değerler **boş** bırakılır.

**+devops-engineer:** Prime'a sorar: *"Şu anahtarların gerçek değerlerini girer misin?"*

**sistem:** Onay sorusu zilde belirir.

**prime:** `.env` dosyasını açar. Her anahtarın yanına gerçek değerini yapıştırır. Kaydeder. Dashboard'da **Done** der.

**+devops-engineer:** Smoke test koşar (DB bağlanıyor mu, harici servisler cevap veriyor mu). Sonucu `workspace/reports/delivery-reports.md`'nin ortam bölümüne yazar.

**+devops-engineer:** Prime'a *"Ortam hazır"* bildirimi gönderir.

**sistem:** Geliştirme döngüsü (Adım 6) tetiklenir.

---

## Adım 6 — Geliştirme döngüsü (bir item için)

**sistem:** `04-development-cycle` başladı. Backlog'tan sıradaki müsait item alınır (örn. *T-001 — Login form*).

**+operation-manager:** Item'ı assignee'sine teslim eder. Item statüsünü **In Progress** yapar.

**Assignee ajan (örn. +backend-developer):** Item'ı, ilgili referansları ve önceki handover notlarını okur. Kod yazmaya başlar. Yazdıkça commit'ler.

**Assignee ajan:** İş bitince değişiklikleri pull request olarak açar. Item statüsünü **Test** yapar.

**sistem:** Test döngüsü (Adım 7) tetiklenir.

---

## Adım 7 — Test döngüsü

**sistem:** `05-test-cycle` başladı.

**+engineering-manager:** Kodu inceler (code review). Mantık, mimari uyum, standartlara uyum. Sonucu `workspace/reports/test-reports.md`'ye yazar.

  - **Fail:** Item statüsü **In Progress**'e döner, assignee'ye geri verilir. Adım 6 tekrar.
  - **Pass:** Sıradaki gate'e geçilir.

**+qa-engineer:** Test senaryolarını çalıştırır (unit, integration, E2E). Sonucu `test-reports.md`'ye yazar.

  - **Fail:** Item **In Progress**'e döner.
  - **Pass:** Sıradaki gate.

**+security-engineer:** Güvenlik kontrolünü yapar (zafiyet tarama, secret leak, izin kontrolü). Sonucu `test-reports.md`'ye yazar.

  - **Fail:** Item **In Progress**'e döner.
  - **Pass:** Sıradaki gate.

**+designer:** UI içeriyorsa görsel inceleme yapar (tasarım sistemine uyum, responsive davranış, erişilebilirlik). Sonucu `test-reports.md`'ye yazar.

  - **Fail:** Item **In Progress**'e döner.
  - **Pass:** Tüm gate'ler tamam.

**Son gate ajanı:** Item statüsünü **Review**'a alır. Prime'a final onay sorusu gönderir.

**sistem:** Onay sorusu zilde belirir.

**prime:** Item'ı inceler. **Approve** der.

**sistem:** Item statüsü **Done** olur. Backlog güncellenir. Bir sonraki müsait item için Adım 6 baştan başlar.

> Not — Backlog'da müsait item kalmadığında ve bir release kapsamı tamamlandığında: prime *"Bu sürümü yayınla"* derse Adım 8 (deploy) tetiklenir.

---

## Adım 8 — Deploy

**sistem:** `06-deployment-cycle` başladı.

**+delivery-manager:** Release kapsamındaki tüm item'ların **Done** olduğunu, test raporlarının temiz olduğunu ve güvenlik gate'lerinin geçtiğini kontrol eder. *"Sürüm yayına hazır mı?"* sorusunu prime'a gönderir.

**sistem:** Onay sorusu zilde belirir.

**prime:** Sürüm notunu okur. **Go** der.

**+devops-engineer:** Pre-deployment kontrol koşar (build temiz mi, migration uyumlu mu, secret'lar yerinde mi).

**+devops-engineer:** Önce staging'e deploy eder.

**+qa-engineer:** Staging'de smoke test çalıştırır. Sonucu `test-reports.md`'ye yazar.

  - **Fail:** Sistem durur. Prime'a **DEPLOYMENT DURDU** bildirimi gönderilir.
  - **Pass:** Production'a geçilir.

**+devops-engineer:** Production'a deploy eder. Sürüm etiketini (`v1.2.0`) yazar. Release notes hazırlar.

**+devops-engineer:** Post-deploy izleme yapar (hata oranı, response time, kritik akışlar). Sonucu `workspace/reports/delivery-reports.md` ve `release-notes.md`'ye yazar.

**sistem:** Deploy tamam. Dashboard'da *"v1.2.0 canlıda"* bildirimi.

---

## Adım 9 — Rollback (production sonrası kritik hata)

**sistem:** Post-deploy izleme bir eşiği aştı (örn. 5xx oranı %5 üstünde, p95 latency 2x).

**+devops-engineer:** Rollback kararını başlatır. Prime'a *"Rollback başlatılıyor"* bildirimi gönderir.

**+operation-manager:** Kriz koordinasyonunu üstlenir. İlgili ajanları durdurur. Açık başka deploy varsa askıya alır.

**+devops-engineer:** Son kararlı sürüme döner. Smoke test koşar.

**+qa-engineer:** Sistemin döndüğünü doğrular.

**+devops-engineer:** Hatayı tetikleyen item için backlog'da bir Bug açar. Yaşananları `workspace/memory/learned.md`'ye yazar. Sürümü *"blocked release"* olarak kaydeder.

**sistem:** Rollback tamam. Sorun sürüyorsa Adım 10 (hotfix), kalıcı düzeltme gerekiyorsa Adım 6 (yeni development cycle).

---

## Adım 10 — Hotfix (rollback uygun değilse)

**sistem:** Hata kanıtı var, ama rollback riskli (örn. DB migration ile geldi, geri alınırsa veri kaybı olur).

**+operation-manager:** Hotfix kararını verir. İlgili ajanı acil göreve alır.

**Assignee ajan:** Sadece sorunu çözen minimal düzeltmeyi yazar. Başka değişiklik yapmaz.

**+qa-engineer:** Hotfix'i hızlandırılmış test'ten geçirir.

**+security-engineer:** Güvenlik gate'ini koşar.

**+devops-engineer:** Patch sürüm olarak deploy eder (`v1.2.1`).

**+devops-engineer:** Yaşananları `learned.md`'ye yazar. Delivery raporunu günceller.

**sistem:** Hotfix tamam. Normal akışa dönülür.

---

## Adım 11 — Bakım

**prime:** Sprint başında veya gerektiğinde dashboard'dan **Maintenance** komutunu tetikler.

**sistem:** `09-maintenance-cycle` başladı.

**+devops-engineer:** Bağımlılıkları kontrol eder. Major/minor güncellemeleri, güvenlik yamalarını listeler.

**+security-engineer:** Açık güvenlik bildirimlerini ve CVE'leri tarar.

**+backend-developer & +frontend-developer:** Güncelleme kararlarına göre bağımlılıkları yükseltir, breaking change varsa adapt eder.

**+qa-engineer:** Regression test paketini çalıştırır.

**+operation-manager:** Aktif `workspace/memory/learned.md` notlarını gözden geçirir, hâlâ geçerli olanları işler. Teknik borç listesini temizler.

**+operation-manager:** `workspace/reports/status-reports.md`'ye bakım özeti yazar. Aksiyon gereken item'lar için backlog'a Task açar.

**sistem:** Bakım tamam. Aksiyon item'ları varsa Adım 6'ya gider.

---
