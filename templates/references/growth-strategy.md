---
status: uninitialized
author: +growth-expert
reviewer: +product-manager
approver: +prime
---

# Growth & Analytic Strategy

## Analytics Goals & Metrics

- **Kuzey Yıldızı Metriği (North Star):** [Temel başarı ölçütü, örn: Aktif İşlem Yapan Kullanıcı]
- **Birincil Hedefler:** [Örn: %10 dönüşüm oranı, Günlük 5K MAU]

## Tracking Setup & Tools

- **Analitik Araçları:** [Örn: Google Analytics 4, Mixpanel, Amplitude]
- **Tag Yönetimi:** [Örn: Google Tag Manager (GTM)]
- **Hata Takibi:** [Örn: Sentry, Datadog]

## Key Events to Track (Event Taxonomy)

Tüm olaylar (events) aşağıdaki örnek gibi isimlendirme kurallarına (Örn: `Object_Action`) uymalıdır.

- `user_signed_up`: Kullanıcı başarılı kayıt olduğunda (**Parameters:** method, tier)
- `purchase_completed`: Kullanıcı ödeme yaptığında (**Parameters:** amount, currency)
- `[event_name]`: [Tetiklenme durumu ve parametreleri]

## SEO & ASO Strategy

- **On-Page SEO:** [H1 etiketleri, meta description kuralları, schema.org yapısı]
- **URL Structure:** [Örn: /kategori/urun-adi (Kebab-case, SEO friendly)]
- **Sitemap & Robots.txt:** [Oluşturulma ve endeksleme politikası]

## User Acquisition & Funnel

- [A/B Test planları, funnel aşamaları (Acquisition, Activation, Retention...)]

## Epics & Tasks

- Backlog item'lar SQL'de tutulur (`backlog_items`). Growth ile ilgili task/epic'ler bu dosyadan değil, Board ekranından "+ New Item" ile eklenir.
