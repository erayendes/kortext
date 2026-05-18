# Onboarding Pipeline (`!start onboard`)

Bu akış mevcut bir projeyi Kortext çalışma düzenine dahil eder.

## Girdi ve Çıkış

- **Başlangıç koşulu:** Mevcut codebase erişilebilir olmalı ve +prime başlangıç özetini `../workspace/references/blueprint.md` içine yazmış olmalıdır.
- **Girdi:** Mevcut codebase, başlangıç blueprint'i ve varsa mevcut proje dokümanları.
- **Çıkış:** Mevcut sistemin referans dosyaları, teknik borç görünümü ve `../workspace/reports/analysis-reports.md`.
- **Sonraki akış:** Onay sonrası `02-planning-pipeline.md`.

> [!TIP]
> - Birbirine bağımlı olmayan keşif adımlarında ajanlar eşzamanlı (paralel) çalışır.
> - Her ajan bir adıma başlamadan önce `../workspace/memory/context/[agent-name]-active.md` dosyasını oluşturur veya günceller; adım bitince sonucu `../workspace/memory/handover.md` dosyasına kaydeder ve kendi aktif görev dosyasını siler.

**Ön koşul:** +prime, `../workspace/references/blueprint.md` dosyasına yalnızca başlangıç özetini yazar:
- Projenin ne olduğu ve mevcut durumu
- Hangi versiyonda olduğu (örn: v2.3, beta, production)
- Bilinen kritik teknik borçlar veya sorunlar
- Kısa vadeli hedef (neden Kortext'e alınıyor?)

Onboarding sırasında +prime'a sorulan tüm ek soruların yanıtları `../workspace/reports/analysis-reports.md` içinde toplanır. Bu yanıtlar planlama aşamasında backlog kararlarına girdi olur.

---

## 1. Teknik Keşif

1. **+engineering-manager:** Mevcut codebase'i okuyarak teknoloji yığınını, klasör yapısını, dosya organizasyonunu, bağımlılıkları, dil/framework versiyonlarını, isimlendirme kurallarını ve mimari kalıpları tespit eder. Amaç yeni standart dayatmak değil, projenin mevcut teknik gerçekliğini belgelemektir.
	- Inputs: Mevcut codebase, bağımlılık dosyaları, framework konfigürasyonları
	- Outputs: `../workspace/references/tech-stack.md`, `../workspace/references/file-system.md`, `../workspace/references/dictionary.md`
	- Approver: +prime
2. **+db-admin:** Mevcut migration dosyalarını, şema tanımlarını, ORM modellerini ve veritabanı bağlantı biçimini inceler. Tabloları, ilişkileri, index'leri, veri tiplerini ve veri bütünlüğü kurallarını belgeler.
	- Inputs: Mevcut migration/schema dosyaları, ORM modelleri, veritabanı konfigürasyonları
	- Outputs: `../workspace/references/db-schema.md`
	- Approver: +engineering-manager
3. **+security-engineer:** Mevcut güvenlik yapılandırmalarını inceler. Auth, yetkilendirme, middleware, env handling, CORS, rate limiting, secret yönetimi, loglama ve hassas veri kullanımı açısından açıkları veya eksik katmanları tespit eder.
	- Inputs: Mevcut codebase, `../workspace/references/tech-stack.md`
	- Outputs: `../workspace/references/security-rules.md`
	- Approver: +engineering-manager
	- Escalation: Kritik güvenlik bulguları +prime'a bildirilir.
4. **+devops-engineer:** Mevcut CI/CD pipeline'larını, deployment süreçlerini, ortam yapılandırmalarını, branch stratejisini, erişim sahipliğini ve secret yönetimini inceler. Kortext'in `../rules/branching.md` kurallarıyla uyumsuzlukları ve release risklerini raporlar.
	- Inputs: Mevcut CI/CD konfigürasyonları, deployment dosyaları, branch/release dokümantasyonu
	- Outputs: `../workspace/references/access.md`, `../workspace/reports/delivery-reports.md`
	- Approver: +delivery-manager

---

## 2. Ürün ve API Keşfi

1. **+engineering-manager:** Mevcut API endpoint'lerini, servis sınırlarını, request/response modellerini, auth mekanizmalarını ve entegrasyon noktalarını belgeler. +backend-developer teknik doğruluk açısından review yapar.
	- Inputs: Mevcut route/controller dosyaları, servis katmanı, varsa Swagger/Postman koleksiyonu
	- Outputs: `../workspace/references/api-reference.md`
	- Reviewer: +backend-developer
	- Approver: +engineering-manager
2. **+product-manager:** Mevcut özellikleri, kullanıcı akışlarını, roller/izinleri, bilinen eksiklikleri ve var olan roadmap/issue listesini inceler. Ürünün şu an ne yaptığı ile +prime'ın beklentisi arasındaki farkları görünür yapar.
	- Inputs: `../workspace/references/blueprint.md`, mevcut ürün dokümanları, issue tracker, roadmap, kullanıcı geri bildirimleri
	- Outputs: `../workspace/reports/product-requirements.md`
	- Approver: +prime
3. **+qa-engineer:** Mevcut test kapsamını, test tiplerini, CI test raporlarını ve eksik test alanlarını belgeler. Kritik kullanıcı akışları için mevcut kalite güvencesinin yeterli olup olmadığını değerlendirir.
	- Inputs: Mevcut test dosyaları, CI test raporları, `../workspace/reports/product-requirements.md`
	- Outputs: `../workspace/references/test-strategy.md`
	- Approver: +engineering-manager

---

## 3. Teknik Borç Tespiti

1. **+engineering-manager:** Keşif adımlarında tespit edilen teknik borçları, mimari sorunları, güvenlik risklerini, test açıklarını, devops/release risklerini ve iyileştirme alanlarını konsolide eder. Her borç kalemi için etki, risk, bağımlılık ve öncelik seviyesi belirler.
	- Inputs: Tüm keşif çıktıları
	- Outputs: `../workspace/reports/tech-requirements.md`
	- Reviewer: +security-engineer, +qa-engineer, +devops-engineer
	- Approver: +prime

---

## 4. Talep Toplama

Konsolidasyon başlamadan önce +prime'ın beklentileri ve açık kararları sisteme alınır.

1. **+product-manager:** +prime'a planlama kararlarını etkileyecek ek soruları yöneltir. Amaç yeni rapor üretmek değil, backlog'a girecek öncelikleri ve yarım kalan işleri netleştirmektir.
	- Sorular:
		- Teknik borçlara ek olarak backlog'a alınmasını istediğin yeni özellikler var mı?
		- Devam eden veya yarım kalmış görevler var mı? Bunlar nasıl önceliklendirilmeli?
		- Kısa vadeli hedefin nedir? Örneğin belirli bir özelliği bitirmek, bir versiyonu yayınlamak veya sistemi stabilize etmek.
	- Outputs: +prime yanıtları `../workspace/reports/analysis-reports.md` içinde `+prime Kararları ve Planlama Girdileri` başlığı altında konsolide edilir.
	- Approver: +prime

### Ara Bildirim

> [!NOTE] TALEPLER ALINDI
> +prime,
> Yanıtların `../workspace/reports/analysis-reports.md` içine `+prime Kararları ve Planlama Girdileri` başlığı altında işlendi.
> Doğruysa `!approve`, düzeltmek istersen `!reject [not]` komutunu bekliyorum.
---

## 5. Konsolidasyon ve Onay

1. **+operation-manager:** Tüm keşif çıktılarını, teknik borç listesini ve +prime yanıtlarını konsolide ederek onboarding analiz raporunu oluşturur. Rapor mevcut durum özetini, referans dosyalarını, riskleri, açık kararları, teknik borçları ve planning akışına aktarılacak başlıkları netleştirir.
	- Inputs: Tüm keşif çıktıları, `../workspace/references/blueprint.md`, `../workspace/reports/tech-requirements.md`, +prime yanıtları
	- Outputs: `../workspace/reports/analysis-reports.md`
	- Approver: +prime
---

## Bildirim

> [!NOTE] ONBOARDING TAMAMLANDI
> +prime,
> [project-name] projesi Kortext'e dahil edildi.
> `../workspace/reports/analysis-reports.md` dosyası için `!approve/reject analysis-reports` komutunu bekliyorum.
> Onaydan sonra planning akışı için `!start planning` komutunu bekleyeceğim.
