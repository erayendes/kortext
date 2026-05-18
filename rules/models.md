# Model Konfigürasyonu

Bu dosya, personanın görev türüne göre hangi model profilini kullanacağını merkezi olarak tanımlar. Persona dosyalarında doğrudan model adı yazılmaz; persona dosyaları yalnızca görev kategorisini belirtir.

## Görev Kategorileri

| Kategori | Kullanım Alanı | Varsayılan Profil | Fallback Profil |
| :--- | :--- | :--- | :--- |
| `deep-research` | Araştırma, analiz, mimari tasarım, strateji, karmaşık kod üretimi, güvenlik değerlendirmesi | `high-reasoning` | `standard-reasoning` |
| `routine` | Format düzenleme, standart güncelleme, raporlama, basit denetim, düşük riskli rutin işler | `fast-reasoning` | `standard-reasoning` |

## Model Profilleri

| Profil | Beklenen Özellik | Kullanım |
| :--- | :--- | :--- |
| `high-reasoning` | En güçlü muhakeme, uzun bağlam, karmaşık analiz | Kritik teknik kararlar ve çok adımlı üretim işleri |
| `standard-reasoning` | Dengeli muhakeme ve hız | Fallback veya orta karmaşıklıktaki işler |
| `fast-reasoning` | Hızlı cevap, düşük maliyet | Rutin raporlama ve basit kontrol işleri |

## Rol → Kategori Ataması

| Persona | Varsayılan Kategori | Not |
| :--- | :--- | :--- |
| `+operation-manager` | `routine` | Orkestrasyon, durum takibi, raporlama |
| `+product-manager` | `deep-research` | Ürün gereksinimi, kapsam ve önceliklendirme |
| `+engineering-manager` | `deep-research` | Mimari, teknik karar, code review |
| `+delivery-manager` | `routine` | Release koordinasyonu ve teslimat raporları |
| `+backend-developer` | `deep-research` | Backend uygulama ve servis mantığı |
| `+frontend-developer` | `deep-research` | UI uygulama ve frontend mimarisi |
| `+db-admin` | `deep-research` | Veri modeli, migration, performans |
| `+devops-engineer` | `routine` | CI/CD, ortam, deployment operasyonları |
| `+qa-engineer` | `routine` | Test yürütme, doğrulama, raporlama |
| `+security-engineer` | `deep-research` | Güvenlik analizi, risk ve zafiyet değerlendirmesi |
| `+designer` | `deep-research` | Tasarım sistemi, UX/UI değerlendirmesi |
| `+copywriter` | `deep-research` | İçerik stratejisi, marka dili, mikro metin |
| `+growth-expert` | `deep-research` | SEO/GEO, analitik, büyüme stratejisi |
| `+compliance-expert` | `deep-research` | KVKK/GDPR ve yasal değerlendirme |

## Sağlayıcı Seçimi

Gerçek model ID'leri sağlayıcıya ve kurulu ortama göre değişebilir. Bu nedenle model ID'leri persona dosyalarına yazılmaz.

## Resmi Model Kaynakları

Model seçimi veya model güncellemesi yapılmadan önce sağlayıcının resmi model dokümantasyonu kontrol edilir.

| Sağlayıcı | Resmi Kaynak |
| :--- | :--- |
| Anthropic / Claude | https://docs.anthropic.com/en/docs/about-claude/models/overview |
| Google / Gemini | https://ai.google.dev/gemini-api/docs/models |
| OpenAI | https://developers.openai.com/api/docs/models |

## Güncellik Kuralı

- +prime "en güncel", "latest" veya belirli bir sağlayıcıdaki yeni model ailesini isterse ajan resmi model dokümanını kontrol etmeden model önermemelidir.
- Varsayılan tercih +prime aksi yönde belirtmedikçe en güncel uygun modeldir.
- Production kullanımında model ID sabitlenmesi gerekiyorsa ilgili snapshot/stable ID `workspace/references/access.md` veya `workspace/references/tech-stack.md` içinde ayrıca belgelenir.
- Bir sağlayıcının "latest" alias'ı ile sabit snapshot ID'si farklı amaçlara hizmet ediyorsa bu fark raporda açıkça belirtilir.

Model seçimi yapılırken:

1. Önce görevin kategorisi belirlenir.
2. Resmi model kaynağı kontrol edilir.
3. Kategoriye karşılık gelen varsayılan profil seçilir.
4. Mevcut ortamda bu profile karşılık gelen en güncel uygun model kullanılır.
5. Model erişilemezse fallback profil kullanılır.
6. Fallback kullanımı `workspace/reports/status-reports.md` veya ilgili görev raporuna not edilir.

## Fallback Politikası

- Fallback modeli aynı görevi tamamlamak için yeterliyse işlem devam eder.
- Fallback kalite riski oluşturuyorsa görev `Blocked` yapılır ve +operation-manager'a eskale edilir.
- `deep-research` görevlerinde fallback kullanıldıysa sonuç kalitesi özellikle belirtilir.
- API/LLM kesintilerinde retry ve fallback sırası `rules/emergency.md` içindeki Self-Healing Protocol'e göre yürütülür.

## Persona Dosyalarında Kullanım

Persona dosyalarının `instructions` bölümünde her görev adımında model adı yerine kategori referansı kullanılır:

```markdown
### 1. Araştırma Protokolü
**Kategori:** `deep-research`

### 2. Rutin Güncelleme
**Kategori:** `routine`
```

## Güncelleme Politikası

- Model profili veya kategori değişikliklerinde yalnızca bu dosya güncellenir.
- Gerçek sağlayıcı/model ID eşleşmeleri proje ortamına göre `workspace/references/tech-stack.md` veya `workspace/references/access.md` içinde belgelenir.
- Model değişikliği önerisi +operation-manager tarafından yapılır.
- Stratejik model değişikliği +prime onayı gerektirir.
