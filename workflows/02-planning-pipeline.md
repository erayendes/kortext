# Planning Pipeline (`!start planning`)

Bu akış, onaylı analiz çıktılarından uygulanabilir düz backlog yapısını üretir.

## Girdi ve Çıkış

- **Başlangıç koşulu:** `../workspace/reports/analysis-reports.md` onaylı olmalıdır.
- **Girdi:** Analiz raporu ve bu raporda referans verilen onaylı kaynak dosyalar.
- **Çıkış:** `../workspace/memory/backlog/` altında düz dashboard ve item dosyaları.
- **Sonraki akış:** Ortam hazır değilse `03-environment-setup.md`, hazırsa `04-development-cycle.md`.

## Otomasyon Çağrıları

> [!TIP] Bu tablo workflow adımlarının hangi script/hook'a bağlandığını gösterir. Tek-kaynak referans: `../settings/INTEGRATION-MAP.md`.

| Adım | Tetikleyici Persona | Script / Hook | Beklenen Çıktı |
|---|---|---|---|
| Görev Belirleme (toplu) | +engineering-manager | `scripts/kortext-bulk-plan.py <plan.json>` | Toplu Task/Bug/Debt item dosyaları + dashboard satırları, otomatik git commit |
| Görev Belirleme (iteratif) | +engineering-manager | `scripts/kortext-backlog-add.py --type task|bug|debt --id <id> --title "..." --epic <epic-id>` | Item dosyası + dashboard satırı, otomatik git commit |
| Spike Item Açma | +engineering-manager | `scripts/kortext-backlog-add.py --type spike --id S01 --title "..."` (workflows/02b ile birlikte) | Spike item + ADR placeholder |
| Kalite & Etiketleme | +qa-engineer, +security-engineer, +designer | (item dosyalarına `Review Gates` eklenir; manuel düzenleme) | Gate işaretleri |
| Bağımlılık & Önceliklendirme | +engineering-manager | (item dosyalarına `Blocks` / `Blocked By` eklenir; manuel düzenleme) | İlişki haritası |
| Versiyonlama | +engineering-manager | (`version-dashboard.md` güncellenir) | Version eşleme |
| Görev Atama + Model Seçimi | +engineering-manager + +operation-manager | (item dosyalarına `Assignee` + `Model` eklenir) | Atama tamam |
| Konsolidasyon | +operation-manager | `scripts/kortext-backlog-sync.py` | Dashboard drift = 0 |
| Onay | +prime | `!approve backlog` / `!reject backlog` (manuel) | Backlog kabul kaydı |

> [!TIP]
> - Birbirine bağımlı olmayan adımlarda (Örn: +security-engineer ve +qa-engineer) ajanlar eşzamanlı (paralel) olarak çalışır.
> - Input dosyaların `status: approved` olması gerekir. Değilse, ilgili `approver`'dan dosyayı incelemesi istenir.
> - Her ajan bir adıma başlamadan önce `../workspace/memory/context/[agent-name]-active.md` dosyasını oluşturur veya günceller; adım bitince sonucu `../workspace/memory/handover.md` dosyasına kaydeder ve kendi aktif görev dosyasını siler.
> - **Metodoloji:** Kanban (Sprint yok, Eforlama yok)
> - **Görev Tipleri:** Epic, Task, Bug, Debt
> - **Inputs:** `../workspace/reports/analysis-reports.md` ve bu raporda onaylı olarak referans verilen tüm `../workspace/references/` ve `../workspace/reports/` çıktıları.
> - **Outputs:** `../workspace/memory/backlog/` altında tek seviyeli dashboard ve item dosyaları

## Görev Tipleri

- **Epic:** Ortak bir iş hedefine hizmet eden görev grubu.
- **Task:** Yeni geliştirme veya planlı iş.
- **Bug:** Mevcut davranışın yanlış çalışması.
- **Debt:** Bilinen teknik borç, refactor, mimari iyileştirme, test açığı veya operasyonel borç.

## Review Gates

- **Quality control:** QA kontrolü gerektiren görevlerde kullanılır.
- **Security check:** Güvenlik incelemesi gerektiren görevlerde kullanılır.
- **Design review:** UI veya UX doğrulaması gerektiren görevlerde kullanılır.

## Backlog Dosya Yapısı

Backlog tek seviyeli dosya yapısı kullanır. Version, Epic, Task, Bug ve Debt için ayrı klasör açılmaz.

```text
../workspace/memory/backlog/
├── version-dashboard.md
├── epic-dashboard.md
├── debt-dashboard.md
├── TXX-[task-name].md
├── BXX-[bug-name].md
└── DXX-[debt-name].md
```

- `version-dashboard.md`: Versiyon hedefleri, versiyon kapsamındaki Epic'ler ve genel ilerleme.
- `epic-dashboard.md`: Epic listesi, Epic owner bilgisi, Epic altındaki Task/Bug ilişkileri ve Epic statüsü.
- `debt-dashboard.md`: Debt listesi, assignee ve statü.
- `TXX-[task-name].md`: Task detay dosyası.
- `BXX-[bug-name].md`: Bug detay dosyası.
- `DXX-[debt-name].md`: Debt detay dosyası.

## Görev Belirleme

1. **+engineering-manager:** Onaylı analiz çıktılarını tarayarak özellikleri, teknik gereksinimleri, açık riskleri ve +prime kararlarını backlog adaylarına dönüştürür.
2. Her işi atomik seviyeye böler. Atomik iş tek başına anlaşılabilir, bağımsız geliştirilebilir ve ayrı doğrulanabilir olmalıdır.
3. Her backlog adayı için görev tipini belirler:
	- **Task:** Yeni geliştirme veya planlı uygulama işi.
	- **Bug:** Mevcut davranışın yanlış çalışması.
	- **Debt:** Teknik borç, refactor, mimari iyileştirme, test açığı veya operasyonel borç.
4. Her görev için kısa açıklama, gereksinimler, beklenen çıktı ve kaynak referansını yazar.
5. İnsan müdahalesi gerektiren işler +prime'a atanır. Bu işler domain satın alma, hesap açma, API key oluşturma, fiziksel cihaz kurulumu, platform erişimi veya bütçe/onay gerektiren kararlar olabilir.

## Kalite ve Etiketleme

1. **+qa-engineer:** Tüm Task, Bug ve Debt adaylarını inceler. Her görev için davranış odaklı, test edilebilir ve madde madde yazılmış Acceptance Criteria ekler.
2. Test edilemeyecek kadar muğlak görevleri +engineering-manager'a revizyon için geri gönderir.
3. QA kontrolü gerektiren görevlere `Review Gates: Quality control` ekler.
4. **+security-engineer:** Güvenlik, auth, secret, veri işleme, erişim kontrolü veya compliance riski taşıyan görevlere `Review Gates: Security check` ekler.
5. **+designer:** UI, UX, responsive davranış, erişilebilirlik veya görsel tutarlılık gerektiren görevlere `Review Gates: Design review` ekler.

## Bağımlılık ve Önceliklendirme

### İlişkilendirme

1. **+engineering-manager:** Tüm görev adayları arasındaki teknik ve operasyonel bağımlılıkları belirler.
2. Bir görevin başlaması için başka bir görevin tamamlanması gerekiyorsa `Blocks` ve `Blocked By` alanlarını kullanır.
> [!INFO] **Bağımlılık Yönetimi Kuralı:**
> - **Task A:** `Blocks: [Task B]`
> - **Task B:** `Blocked By: [Task A]`
> - Assignee kim olursa olsun, `Blocked By` alanındaki görev tamamlanmadan bağlı görev başlamaz.

### Epic Kategorileri

1. **+engineering-manager:** Atomik görevleri ortak bir iş hedefine hizmet eden Epic başlıkları altında birleştirir.
2. Her Epic için amaç, kapsam, başarı kriteri, kapsadığı görev tipleri ve genel işleyiş yazılır.
> [!WARNING] Her görev mutlaka bir **Epic** ile ilişkilendirilir.

### Versiyonlama

1. **+engineering-manager:** Epic'lerin ve görevlerin hangi versiyona ait olduğunu belirler.
2. Epic'leri projenin karmaşıklığına göre `v0.x` aşamalarından başlayarak `v1.0` aşamasına kadar mantıksal bir sıraya dizer.
3. Her versiyon için ana hedef, başarı kriteri ve kapsadığı Epic/Debt alanları yazılır.
4. Versiyon bilgisi `version-dashboard.md` içinde tutulur; versiyonlara göre alt klasör açılmaz.
5. Teknik borçlar `debt-dashboard.md` ve `DXX-[debt-name].md` item dosyalarında Debt olarak tutulur.
> [!WARNING] Her epic mutlaka en az bir **Version** ile ilişkilendirilir.

## Görev Atama, Model ve Skill Seçimi

1. **+engineering-manager:** Her görevi yapması gereken ajana atar. Teknik görevlerde ajan seçimi görevin uzmanlık alanına, `../workspace/references/tech-stack.md` içeriğine ve gerekli Review Gates alanlarına göre yapılır.
2. Her göreve uygulanması gereken skill bilgisini ekler. Skill seçimi teknoloji yığınına, görev tipine ve ilgili ajan rolüne göre yapılır.
3. İnsan müdahalesi, erişim, bütçe veya dış platform onayı gerektiren görevler +prime'a atanır.
4. **+operation-manager:** `../rules/models.md` dosyasına göre her görevin ihtiyaç duyduğu model tercihini belirler ve task içine ekler.
5. Her Epic için owner ajanı belirler. Epic owner, Epic altındaki görevlerin ilerleme ve blokaj takibinden sorumludur.

## Konsolidasyon

1. **+operation-manager:** Tüm planning çıktılarını `../workspace/memory/backlog/` altında dashboard ve item dosyaları olarak oluşturur.
	- Reviewer: +engineering-manager
	- Approver: +prime
> [!INFO] BACKLOG YAPISI
>```
> ../workspace/memory/backlog/
>	├── version-dashboard.md
>	├── epic-dashboard.md
>	├── debt-dashboard.md
>	├── TXX-[task-name].md
>	├── BXX-[bug-name].md
>	└── DXX-[debt-name].md
>```

## Bildirim

> [!NOTE] PLANLAMA TAMAMLANDI
> +prime, 
> [project-name] planlaması tamamlandı. 
> `../workspace/memory/backlog/` için `!approve/reject backlog` komutunu bekliyorum.
> Onaydan sonra ortam kurulumu akışı için `!setup environment` komutunu bekleyeceğim.
