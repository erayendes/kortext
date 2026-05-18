# Development Cycle (`!start development`)

Bu akış, seçilen backlog item'ının uygulanmasını ve `Review` aşamasına kadar ilerlemesini yönetir.

## Girdi ve Çıkış

- **Başlangıç koşulu:** Düz backlog içinde assignee'si belirlenmiş ve bağımlılıkları çözümlenmiş bir item bulunmalıdır.
- **Girdi:** İlgili backlog item dosyası, onaylı referanslar ve mevcut handover/context kayıtları.
- **Çıkış:** Uygulanmış değişiklik, `Test`/`Review` geçiş kayıtları ve güncel handover.
- **Sonraki akış:** Test için `05-test-cycle.md`; onay sonrası deployment ihtiyacına göre `06-deployment-cycle.md`.

## Otomasyon Çağrıları

> [!TIP] Bu tablo workflow adımlarının hangi script/hook'a bağlandığını gösterir. Tek-kaynak referans: `../settings/INTEGRATION-MAP.md`.

| Adım | Tetikleyici Persona | Script / Hook | Beklenen Çıktı |
|---|---|---|---|
| Pick & Plan | Assignee ajan | `scripts/kortext-item-start.py <item> --agent <persona> --summary "..."` | Item `In Progress`, `workspace/memory/context/<agent>-active.md`, otomatik git commit |
| Implementation (PR açma) | Assignee ajan | `scripts/kortext-item-transition.py <item> --to Test` | Status `Test`, otomatik git commit |
| PR commit | (otomatik) | `hooks/git-pre-commit.sh` zinciri (secret-scanner → lint → size → backlog-sync → handover → snapshot) | Commit accept/reject |
| Verification (fail) | Gate sahibi ajan | `scripts/kortext-item-transition.py <item> --to "In Progress"` | Status `In Progress`, otomatik git commit |
| Verification (pass) | Son gate ajanı | `scripts/kortext-item-transition.py <item> --to Review` | Status `Review`, otomatik git commit |
| Final Review (request changes) | Item approver | `scripts/kortext-item-transition.py <item> --to "In Progress"` | Status `In Progress`, otomatik git commit |
| Final Review (approve) | Item approver | `!approve` komutu (manuel) | +prime / approver onayı |
| Deployment & Closing | +devops-engineer | `scripts/kortext-handover.py` → `scripts/kortext-item-check.py` → `scripts/kortext-item-transition.py --to Done` → `scripts/kortext-backlog-sync.py` | Handover, gate kontrol, `Done` geçişi, dashboard sync, git commit zinciri |

> [!INFO] 
> - Süreç başladığında ajanlar backlog item ID'leri üzerinden ilerler.
> - Her ajan göreve başlarken `../workspace/memory/context/[agent-name]-active.md` dosyasını oluşturur veya günceller; görev bitince kendi aktif görev dosyasını siler.
> - Karşılaşılan sorunların çözümleri ilgili ajan tarafından `../workspace/memory/learned.md` dosyasına işlenir.
> - Süreçte `../rules/branching.md` kuralları uygulanır.
> - Assignee ajan item dosyasının durumunu güncellemekten sorumludur.
> - Crossroads: Geliştirme sırasında birden fazla çözüm yolu varsa:
> 	- Seçenekler listelenir, öneri belirtilir
> 	- +prime'a sunulur
> 	- +prime karar vermeden inisiyatif alınmaz
> - +prime yalnızca kendisine atanmış kontrol/onay işi olduğunda, Epic tamamlandığında veya büyük iş/kavşak/checkpoint durumunda bilgilendirilir.
> - Ajanların kendi aralarındaki normal geliştirme, doğrulama ve düzeltme devrinde +prime'a bildirim verilmez.
> - Checkpoint (kritik dönüm noktalarında): Önemli ve test edilebilir dönüm noktalarında (örn: "Login backend tamamlandı")
> 	- Büyük işse veya +prime onayı gerekiyorsa +prime'a kısa durum özeti verilir.
> 	- "devam" veya "onay" komutu beklenir.
> 	- **İstisna:** Ardışık küçük backend görevlerinde (UI değişikliği içermeyen) onay istenmez.
> 	- **UI değişikliği varsa:** Kod derinleşmeden önce tasarım yapısı açıklanır ve +prime onayı alınır.

## Backlog Item Tipleri

- **Epic:** `E` prefix'i ile takip edilir ve ortak iş hedefini temsil eder. Epic detayları `epic-dashboard.md` içinde tutulur.
- **Task:** `T` prefix'i ile takip edilir. Yeni geliştirme veya planlı uygulama işidir.
- **Bug:** `B` prefix'i ile takip edilir. Mevcut davranışın yanlış çalışmasıdır.
- **Debt:** `D` prefix'i ile takip edilir. Teknik borç, refactor, mimari iyileştirme, test açığı veya operasyonel borçtur.

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

## Item Akışları

### Aşama (Status) Tanımları

| Aşama | Açıklama |
|---|---|
| **To Do** | Sahibi belli ama sırası gelmemiş ya da blokeri çözülmemiş item'ların aşamasıdır. |
| **In Progress** | Aktif olarak yürütülen item'ların aşamasıdır. Tamamlanınca Test'e taşınır. |
| **Test** | Code review ve item dosyasındaki Review Gates kontrollerinin yürütüldüğü aşamadır. Tüm kontroller bitince Review'a taşınır. |
| **Review** | +prime ya da yetkili ajanın nihai uygunluk değerlendirmesi yaptığı aşamadır. |
| **Done** | Tüm doğrulama süreçlerinden geçmiş, approver tarafından onaylanmış item'ların aşamasıdır. |

### Epic Workflow 

To Do (Hazırlık) → In Progress (Geliştirme) → Done (Tamamlandı)
- **Geliştirme:** Epic'e bağlı ilk Task veya Bug `In Progress` olduğunda Epic `epic-dashboard.md` içinde `In Progress` yapılır. Epic için ayrı klasör veya branch açılmaz; çalışma düz backlog item dosyaları ve item branch'leri üzerinden yürür.
- **Tamamlandı:** Epic'e bağlı tüm Task ve Bug item'ları `Done` olduğunda Epic `Done` yapılır. Süreç bitiminde `../workspace/reports/status-reports.md` güncellenir.

### Task Workflow

To Do (Bekleme/Planlama) → In Progress (Uygulama) → Test (Doğrulama) → Review (Final Review) → Done (Kapanış)
- **Bekleme:** Item backlog içerisinden seçilip rafine edilmiş olarak çalışılmayı bekler (To Do).
- **Uygulama:** Item atanan ajan (Assignee) işi üzerine alır ve kodlama/tasarım sürecini gerçekleştirir (In Progress).
- **Doğrulama:** Tamamlanan iş code review ve item dosyasındaki Review Gates kontrollerinden geçer. Hata varsa item `In Progress` olarak assignee ajana geri döner.
- **Onay:** Doğrulama adımlarından başarıyla geçen iş Approver tarafına onay için sunulur (Review).
- **Kapanış:** Onay (approve) alan iş `development` branch'ine merge edilir (Done).

### Bug Workflow

To Do (Tespit) → In Progress (Çözüm) → Test (Doğrulama) → Review → Done
- **Tespit & Raporlama:** Bug tespit edildiğinde tespit eden ajan veya +engineering-manager `../workspace/memory/backlog/BXX-[bug-name].md` item dosyasını oluşturur ve bug'ı `epic-dashboard.md` içinde ilgili Epic satırıyla ilişkilendirir.
- **Atama:** +engineering-manager ilgili Bug'ı çözecek doğru ajana atar.
- **Çözüm:** İlgili ajan hatayı kodda çözer (In Progress).
- **Doğrulama:** Kod, testi yapan kişiye geri döner (Test).
- **Kapanış:** Doğrulanırsa Bug kapatılır (Done).

### Debt Workflow

To Do (Borç ekleme) → In Progress (Borç ödeme) → Test (Doğrulama) → Review → Done
- **Borç ekleme:** Teknik borç tespit edildiğinde tespit eden ajan veya +engineering-manager `../workspace/memory/backlog/DXX-[debt-name].md` item dosyasını oluşturur ve borcu `debt-dashboard.md` içinde listeler.
- **Atama:** +engineering-manager ilgili borcu ödeyecek doğru ajana atar.
- **Çözüm:** İlgili ajan borcu öder (In Progress).
- **Doğrulama:** Tamamlanan iş code review ve item dosyasındaki Review Gates kontrollerinden geçer. Hata varsa item `In Progress` olarak assignee ajana geri döner.
- **Kapanış:** Onay (approve) alan iş `development` branch'ine merge edilir (Done).

## Pick & Plan (İşi Alma)

**Sorumlu:** Ajan (Assignee)
1. `../workspace/memory/backlog/version-dashboard.md`, `../workspace/memory/backlog/epic-dashboard.md` ve `../workspace/memory/backlog/debt-dashboard.md` dosyalarından kendisine atanmış `To Do` item'ı bulur.
2. İlgili `TXX-[task-name].md`, `BXX-[bug-name].md` veya `DXX-[debt-name].md` item dosyasını açar.
3. Item dosyasındaki `Dependencies` bölümünü kontrol eder. `Blocked By` alanında tamamlanmamış item varsa işe başlamaz.
4. `../scripts/kortext-item-start.py` aracıyla item statüsünü `In Progress` yapar ve `../workspace/memory/context/[agent-name]-active.md` dosyasını oluşturur veya günceller.

> [!Example]
> [+ajan] | [item-id] | In Progress | [DD.MM.YY-HH:MM]
> [Item adı] — Implementation başlıyor
   
> [!TIP] Handoff: Yok — bu adım kendi içinde tamamlanır, ajan doğrudan **Implementation**'a geçer.

## Implementation (Kodlama)

**Sorumlu:** Ajan (Assignee)
1. `../rules/branching.md` kuralına göre `feature/` branch'i açar.

> [!TIP] Branching kuralına göre:
> ```bash
> git pull origin development
> git checkout -b feature/[item-id]
> ```
> Branch ismi küçük harf, kebab-case ve item ID içermelidir. Örn: `feature/t01-login-form`

2. `../workspace/references/` altındaki onaylı referanslara sadık kalarak işi uygular.
3. Gerekli unit testleri yazar ve yerelde çalıştırır.
4. Codebase'e commit atar. Commit mesajları `../workspace/references/dictionary.md` standartlarına uymalıdır.
5. PR açar ve `../scripts/kortext-item-transition.py` aracıyla item statüsünü `Test` aşamasına taşır.
> [!TIP] Handoff: PR açıldığında item dosyası `Test` yapılır ve ilgili doğrulama ajanlarına context aktarılır.

## Verification (Doğrulama & Test)

Bu aşamanın uygulama detayı `05-test-cycle.md` içinde tanımlanır. `04-development-cycle.md` yalnızca lifecycle geçişini tarif eder.

1. PR açıldığında item dosyası `Test` statüsünde olmalıdır.
2. Doğrulama süreci `05-test-cycle.md` standardına göre yürütülür.
3. Test cycle başarısız olursa `../scripts/kortext-item-transition.py` aracıyla item `In Progress` statüsüne geri döner ve assignee ajana atanır.
4. Test cycle başarılı olursa `../scripts/kortext-item-transition.py` aracıyla item `Review` statüsüne taşınır.

> [!TIP]
> Eğer item kritik bir özellikse veya +prime onayı gerektiriyorsa (UI onayı gibi), +prime'a atanır ve bildirim verilir.
> Doğrulama detayları, gate sonuçları ve raporlama kuralları için tek kaynak `05-test-cycle.md` dosyasıdır.

## Final Review (Son Kontrol)

**Sorumlu:** Item approver
1. Item dosyasındaki Acceptance Criteria, Review Gates sonuçları, PR ve test çıktıları incelenir.
2. Hata varsa `Request Changes` verilir; item `In Progress` olarak assignee ajana geri döner.
3. Item approver +prime ise kontrol işi +prime'a bildirilir ve onay beklenir.
4. Hata yoksa item onaylanır ve +devops-engineer'a atanır.

## Deployment & Closing (Kapanış)

**Sorumlu:** +devops-engineer
1. Onay verildiğinde PR `development` branch'ine merge edilir.
2. CI/CD pipeline çalışır ve kod Staging ortamına çıkar.
3. `../scripts/kortext-handover.py` aracıyla `../workspace/memory/handover.md` dosyasına yeni devir kaydı eklenir. Handover tamamlanmadan item `Done` yapılamaz.
4. `../scripts/kortext-item-check.py` aracıyla acceptance criteria, review gates, handover ve context kapanışı kontrol edilir.
5. `../scripts/kortext-item-transition.py` aracıyla item `Done` yapılır.
6. `../scripts/kortext-backlog-sync.py` aracıyla dashboard drift kontrol edilir.
7. `../workspace/memory/backlog/version-dashboard.md`, `../workspace/memory/backlog/epic-dashboard.md` veya `../workspace/memory/backlog/debt-dashboard.md` ilgili item statüsüne göre güncellenir.

> [!TIP] Dosyanın en üstüne aşağıdaki alanlar doldurularak yeni bir kayıt eklenir:
> - **Completed:** Ne yapıldı?
> - **Changed Files:** Değiştirilen dosyalar ve ne değiştiği
> - **Watch-outs & Decisions:** Bilinen kırılgan nokta veya workaround varsa
> - **Last Commit:** Son commit hash ve mesajı
> - **Next Steps:** Sıradaki ajan ne yapacak? (yoksa "Yok")
   
8. `../workspace/memory/context/[agent-name]-active.md` dosyasını siler. Başka ajanların aktif görev dosyalarına dokunmaz.

## Bildirim

Duruma göre yalnızca ilgili bildirimi gönder.

> [!NOTE] PRIME KONTROLÜ BEKLENİYOR
> +prime,
> `../workspace/memory/backlog/[TXX|BXX|DXX]-[item-name].md` için Final Review sana atandı.
> Acceptance Criteria, Review Gates sonuçları, PR ve test çıktıları hazır.
> Doğruysa onayını bekliyorum.

> [!NOTE] EPIC TAMAMLANDI
> +prime,
> `[epic-id]` tamamlandı.
> `../workspace/reports/status-reports.md` güncellendi.

> [!NOTE] CHECKPOINT
> +prime,
> `../workspace/memory/backlog/[TXX|BXX|DXX]-[item-name].md` için kritik dönüm noktasına gelindi.
> [kısa durum özeti]
> Devam için onayını bekliyorum.
