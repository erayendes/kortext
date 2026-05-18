# Kortext Framework Changelog

Tüm önemli değişiklikler bu dosyada belgelenir.
Format: [Keep a Changelog](https://keepachangelog.com/en/1.0.0/) | [Semantic Versioning](https://semver.org)

---

## [2.2.3] — 2026-05-18

### Fixed

- **`scripts/kortext-cli.py`** — `kortext init` artık `.kortext/` ve `AGENTS.md`'yi `git add` ile otomatik olarak git'e ekliyor. Başka bir makinede `git clone` sonrası tüm framework dosyaları hazır, yeniden `init` gerekmez.

---

## [2.2.2] — 2026-05-18

### Changed

- **`scripts/kortext-cli.py`** — `kortext init` artık `proje/.kortext/` altına tüm framework dosyalarını kopyalıyor: `agents/`, `hooks/`, `scripts/`, `workflows/`, `rules/`, `settings/`, `skills/`, `workspace/`. Önceki sürümde sadece `workspace/` kopyalanıyordu; framework dosyaları npm global'de kalıyordu.
- **`hooks/kortext-lib.sh`** — `kortext/` ve `.kortext/` çift mod desteği kaldırıldı. Canonical dizin artık sadece `.kortext/`. `kortext_find_root` yalnızca `.kortext/hooks` arıyor.

---

## [2.2.1] — 2026-05-18

### Fixed

- **`scripts/kortext-cli.py`** — `kortext init` artık `workspace/` ve `AGENTS.md`'yi proje dizinine kopyalıyor. Önceki sürümde bu dosyalar npm global kurulumunda kalıyordu; iki farklı proje aynı `workspace/`'i paylaşıyordu.
- **`hooks/kortext-lib.sh`** — `KORTEXT_WORKSPACE_DIR` artık `$PWD/workspace/` varsa önce onu kullanıyor; yoksa framework'ün kendi `workspace/`'ine düşüyor.

---

## [2.3.0] — 2026-05-16

### Added

- **`workspace/templates/`** — Şablon merkezi oluşturuldu. Tüm kopyalanabilir şablonlar
  (`TXX-[task-name].md`, `BXX-[bug-name].md`, `DXX-[debt-name].md`, `[agent-name]-active.md`,
  `[original-name]_[YYYY-MM-DD_HHMMSS].md`) bu dizine taşındı. `AGENTS.md`'deki mevcut kural
  (`workspace/templates/ altındaki dosyalar çalışma durumu sayılmaz`) artık uygulamaya alındı.

### Changed

- **`rules/behavior.md`** — Pre-computation kuralına `workspace/templates/` referansı eklendi.
  Ajanlar artık backlog item, context veya arşiv dosyası oluştururken şablon merkezi üzerinden yönlendirilecek.
- **`scripts/kortext-consistency-check.py`** — `required_paths` güncellendi:
  `workspace/memory/context/[agent-name]-active.md` kaldırıldı, `workspace/templates/` ve
  dört şablon dosyası eklendi.
- **`scripts/kortext-session-start.py`** — Context dizini taramasında `[` ile başlayan
  şablon dosyaları artık aktif ajan olarak sayılmıyor (false-positive önlemi).
- **`workspace/archive/`** — Şablon dosyası isimlendirmesi `behavior.md` formatıyla hizalandı:
  `[original-name]_[YYYY-MM-DD_HHMMSS].md`. Eski format (`[file-name]-v[X]-[YYYY-MM-DD].md`)
  deprecated olarak işaretlendi.

### Fixed

- **`hooks/kortext-init.sh`** — Mevcut proje tespitinde hatalı komut önerisi düzeltildi:
  `!onboard` → `!start onboard`.
- **`hooks/kortext-init.sh`** — Var olmayan `$KORTEXT_DIR/VERSION` fallback yolu kaldırıldı;
  sürüm artık yalnızca `settings/VERSION` dosyasından okunuyor.
- **`settings/USER-GUIDE.md`** — Bölüm 6'daki item akış sırası düzeltildi:
  `Review → Test` → `Test → Review`.

### Deprecated

- **`scripts/kortext-backlog-done.py`** — Item kapatma işlemi için artık
  `kortext-item-transition.py --status Done` kullanılmalıdır. Bu script ilerleyen sürümlerde kaldırılacaktır.

---

## [2.2.0] — 2026-05-16


### Added — Yeni Scriptler

- **`scripts/kortext-session-start.py`** — Oturum başlangıç özeti (SESSION_BRIEF).
  Her oturum açılışında `kortext-init.sh` tarafından otomatik çağrılır. Aktif context dosyalarını,
  son handover kaydını ve 24 saatten eski (stale) In Progress itemları özetler.

- **`scripts/kortext-context-check.py`** — Context bütünlük kontrolü.
  Stale aktif dosyaları, backlog ile context uyuşmazlıklarını, handover güncelliğini ve
  duplicate context dosyalarını tespit eder. `!status` ile tetiklenebilir.

- **`scripts/kortext-backlog-health.py`** — Backlog sağlık skoru.
  Backlog item'larını durumlarına göre gruplar (başlanabilir, In Progress, bloklu, stale, review)
  ve 0–100 arası görsel skor üretir. `!status` ve `!maintenance` ile tetiklenebilir.

- **`scripts/kortext-lock.py`** — Paylaşımlı dosya kilidi yöneticisi.
  `acquire / release / status / list` komutları ile `handover.md`, `epic-dashboard.md` gibi
  paylaşımlı dosyalara eş zamanlı yazma çakışmasını önler. 5 dakikalık stale lock koruması vardır.

### Added — Yeni Workflow'lar

- **`workflows/02b-spike-workflow.md`** — Spike araştırma döngüsü.
  `!start spike` komutuyla tetiklenir. Time-boxed hipotez → deney → ADR veya Task çıktısı akışı.
  Sprint kapsamını değiştirmez.

- **`workflows/09-maintenance-cycle.md`** — Rutin bakım döngüsü.
  `!maintenance` komutuyla tetiklenir. 5 kategori: bağımlılık güncelleme, teknik borç,
  `learned.md` gözden geçirme, sistem sağlık kontrolü, güvenlik taraması.

### Added — Belgeler

- **`USER-GUIDE.md`** — Pratik kullanım kılavuzu. Kurulumdan production'a 10 bölüm.

### Changed — Mevcut Dosya Güncellemeleri

- **`rules/commands.md`** — `!start spike`, `!maintenance`, `!status`, `!status full` komutları eklendi; yeni script referansları Yorumlama Kuralları bölümüne eklendi.
- **`rules/emergency.md`** — Git Komut Hataları ve CI/CD Pipeline Hataları protokolleri eklendi.
- **`rules/behavior.md`** — Agent Identity Declaration Protocol eklendi (`+persona | item-id | action` zorunlu format).
- **`workspace/memory/handover.md`** — `Status` ve `Kritik Bağlam` alanları şablona eklendi.
- **`scripts/kortext-handover.py`** — `--status` ve `--context` zorunlu argümanları eklendi.
- **`hooks/kortext-init.sh`** — Adım 1.7: `kortext-session-start.py` otomatik çağrısı eklendi.
- **`hooks/auto-locker.sh`** — `kortext-lock.py` entegrasyonu; python3 yoksa shell fallback.
- **`scripts/kortext-consistency-check.py`** — Yeni script ve workflow'lar doğrulama listesine eklendi.
- **`settings/README.md`** — v2.2.0, yeni workflow'lar ve `/scripts/` referans tablosu eklendi.
- **`settings/VERSION`** — `2.1.0` → `2.2.0`

---

## [2.1.0] — 2026-05-15

### Değişiklikler
- **Çekirdek Model Sabitleme** — Workflow, rule, workspace ve agent katmanları tek canonical modele hizalandı.
- **Distributed Context Netleştirme** — Eski aktif bağlam referansları kaldırıldı; aktif çalışma belleği için `workspace/memory/context/` standardı sabitlendi.
- **Düz Backlog Standardı** — Backlog mimarisi `version-dashboard.md`, `epic-dashboard.md`, `debt-dashboard.md` ve düz item dosyaları üzerinden tekleştirildi.
- **Backlog Otomasyonları** — `kortext-backlog-add.py`, `kortext-backlog-done.py` ve `kortext-bulk-plan.py` düz backlog modeline göre yeniden yazıldı.
- **Tutarlılık Denetimi** — `kortext-consistency-check.py` ile eski model referanslarını ve gerekli çekirdek yolları kontrol eden doğrulama aracı eklendi.
- **Komut Katmanı Ayrıştırması** — `commands.md`, workflow destekli giriş noktalarına indirildi; `skills/` yönetimi komut referansından ayrıldı.
- **Lifecycle Yardımcıları** — `kortext-item-start.py`, `kortext-handover.py` ve `kortext-item-check.py` ile item başlatma, handover üretimi ve kapanış ön kontrolü otomatikleştirildi.
- **Durum ve Drift Kontrolü** — `kortext-item-transition.py` ile izinli item geçişleri tekleştirildi; `kortext-backlog-sync.py` ile dashboard/item drift'i doğrulanabilir hale getirildi.
- **Lifecycle Guard Hook'ları** — `backlog-sync-guard.sh` dashboard drift'ini, `handover-guard.sh` ise handover olmadan `Done` item commit edilmesini engelleyecek şekilde pre-commit akışına bağlandı.

---

## [2.0.1] — 2026-05-12


### Düzeltmeler
- **Git Hook Adaptörleri** — `git-pre-commit.sh` ve `git-pre-push.sh` eklendi; Git'in gerçek hook çağrıları staged dosyalar üzerinde secret, lint ve size kontrollerine bağlandı.
- **Canonical Path Uyumu** — Hook'lar `.kortext/` varsayımı yerine mevcut `kortext/` dizinini otomatik tespit edecek ortak path katmanına bağlandı.
- **Hook Kurulumu** — `kortext-init.sh --install-hooks` komutu `pre-commit`, `commit-msg` ve `pre-push` symlink'lerini güncel dizin yapısına göre kuracak hale getirildi.
- **Hook Testleri** — `hook-system-test.sh` ile workspace yazma izni, Git hook kurulumu ve staged secret bloklama davranışı doğrulanabilir hale getirildi.

---

## [2.0.0] — 2026-04-23

### Yeni Eklenenler
- **Dağıtık Backlog Mimarisi** — Monolitik `backlog.md` yerine düz backlog klasör yapısına geçildi: dashboard dosyaları ile `TXX/BXX/DXX` item dosyaları aynı dizinde tutulur.
- **`kortext-backlog-add.py`** — Yeni görev (Task, Bug, Debt) oluşturma otomasyonu.
- **`kortext-backlog-done.py`** — Görev kapatma ve progress bar (dashboard) otomatik hesaplama aracı.
- **`kortext-bulk-plan.py`** — JSON planından toplu backlog dizin ağacı oluşturma aracı.
- **`backlog/`** — Dağıtık görev yönetim dizini ve şablonları.

### Değişiklikler
- **Framework Refaktörü** — Tüm kurallar, ajanlar ve iş akışları (20+ dosya) yeni dağıtık backlog yapısına ve otomasyon araçlarına uyarlandı.
- **`development-cycle.md`** — Görev statü tanımları eklendi ve akış scriptlere bağlandı.
- **Hook Güncellemeleri** — `size-guard.sh`, `kortext-init.sh` ve `auto-locker.sh` yeni dizin yapısını destekleyecek şekilde güncellendi.
- **`backlog.md` Kaldırıldı** — Eski monolitik dosya silindi, veriler ilgili referans dosyalarına dağıtıldı.

---

## [1.9.0] — 2026-04-22

### Yeni Eklenenler
- **`.kortext/config`** — Merkezi konfigürasyon dosyası: `KORTEXT_SIZE_LIMIT`, `KORTEXT_LOCK_TIMEOUT`, `KORTEXT_BACKUP_KEEP`, `KORTEXT_HOOK_MODE`
- **`.kortext/VERSION`** — Framework versiyon takip dosyası
- **`kortext-init.sh`** — Codebase detection + `!onboard` yönlendirmesi; versiyon bilgisi gösterimi
- **`auto-locker.sh`** — Kilit çakışmasında 3x retry, 5 sn aralık, eskalasyon mesajı
- **`behavior.md`** — AI Ajan Ortam Değişkenleri tablosu (KORTEXT_FILE_PATH, CLAUDE_FILE_PATH vb.)
- **`branching.md`** — `bugfix/`, `release/`, `chore/` branch tipleri eklendi
- **`engineering-manager.md`** — Eksik Adım 7: Architecture Review eklendi
- **`status-reports.md`** — Agent Performance tablosu + Token & Maliyet Özeti bölümü
- **`emergency.md`** — Kullanıcı Bildirimi Protokolü (P0/P1 için şablonlar)
- **`planning-pipeline.md`** — `## 0. Pre-check` adımı: bağımlılık ve placeholder doğrulaması

### Değişiklikler
- **Distributed Context Migrasyonu:** Tüm ajan ve workflow dosyalarında tekil `context.md` yaklaşımı dağıtık `workspace/memory/context/[agent-name]-active.md` modeline taşındı.
- **Hook güçlendirme:** `auto-locker.sh`, `write-guard.sh`, `size-guard.sh`, `snapshot-guard.sh`, `secret-scanner.sh` — tüm hook'lar `.kortext/config`'den ayar okuyor + `strict`/`permissive` mod desteği
- **`secret-scanner.sh`** — 4 pattern grubu: tırnaklı atama, tırnaksız atama, servis-spesifik (sk-, AKIA, ghp_, xox), Bearer/JWT
- **`snapshot-guard.sh`** — Yedek timestamp'i `YYYY-MM-DD_HHMMSS` formatına güncellendi; config'den backup sayısı okunuyor
- **`size-guard.sh`** — Arşiv format string `YYYY-MM-DD_HHMMSS` olarak güncellendi; limit config'den okunuyor
- **`behavior.md`** — Pre-computation kuralı somutlaştırıldı; Archiving Protocol isim formatı güncellendi
- **`quality-gate.yml`** — Stack-agnostic yapıya kavuşturuldu (Node.js, Python, Go, Flutter blokları)
- **`kortext-init.sh`** — `blueprint.md` ve `tech-stack.md` için `status: approved` bayrağı kontrolü; `scripts/` için `chmod +x` eklendi
- **`analysis-pipeline.md`** — `legal-strategy.md` path tutarsızlığı düzeltildi; `legal-reports.md` ayrı test-fazı çıktısı olarak netleştirildi
- **`devops-engineer.md`** — `rules/gitflow.md` → `rules/branching.md` referans hatası düzeltildi
- **Tüm agent dosyaları** — Proje yönetimi referansları `workspace/memory/backlog/` klasörüne taşındı.
- **`test-cycle.md`, `environment-setup.md`** — H1 başlık eklendi
- **`onboarding-pipeline.md`** — Bozuk Markdown son bölümü temizlendi

### Düzeltmeler
- `scripts/lock_kortext.sh` için `chmod +x` adımı `kortext-init.sh`'a eklendi
- `auto-locker.sh` lock dosyası silme satırında yorum temizliği

---

## [1.8.1] — 2026-04-17

İlk stabil sürüm. Temel ajan rolleri, workflow'lar, hook sistemi ve distributed memory protokolü.
