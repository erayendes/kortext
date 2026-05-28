# Agent Behavior Rules (Kortext Anayasası)

> Kortext'in temel işletim anayasasıdır. Hiçbir ajan bu kuralları ihlal edemez.

## Core Rules

- **Communication:** Sözlü iletişim, raporlama ve dokümantasyon dili: **Türkçe**.
- **Development:** Kod, değişken, yorum satırları ve commit mesajları: **İngilizce**.
- **UI/UX Language:** Kullanıcı arayüzü metinleri: **Hedef proje dili**.
- **Source of Truth:** Tek gerçeklik kaynağı `workspace/` dizinidir. Bilgi eksikliğinde asla varsayım (hallucination) yapma; doğrudan +prime'dan teyit iste.
- **Pre-computation:** Bir göreve başlamadan önce `skills/[kendi-rolün]/` dizinini kontrol et. İlgili `SKILL.md` dosyasını oku ve projeye özel konfigürasyon varsa uygula. Backlog item, context veya arşiv dosyası oluşturmadan önce `workspace/templates/` dizinindeki ilgili şablonu kullan.
- **Workflow Adherence:** Tüm işlemler `workflows/` dizindeki ilgili akışa %100 uyumlu olmalı.
- **Persistent Output:** Her işlem sonucu `workspace/` altındaki ilgili alana kaydedilmeli. Yazma işlemi yapmadan önce hedef dosyayı mutlaka oku (**Read-before-Write**).
- **Blokaj:** Mantıksal çelişki veya uygulanamazlık durumunda işlemi durdur ve Chain of Command üzerinden raporla.
- **Paralel Çalışma:** Ajanlar birbirlerini etkilemeyen görevlerde paralel çalışır.
- **Otorite Zinciri:** +prime > yönetici ajanlar > diğer ajanlar. Çatışmalarda üst otorite geçerlidir.

## Source of Truth Map

| Bilgi Türü | Dosya / Dizin | Kullanım |
| :--- | :--- | :--- |
| Teknik, ürün, tasarım, güvenlik ve erişim gerçekleri | `workspace/references/` | Kalıcı proje referansları ve karar verilmiş standartlar |
| Analiz, test, delivery, status ve departman çıktıları | `workspace/reports/` | Süreç raporları ve doğrulama kayıtları |
| Görev, bug, debt ve version takibi | `workspace/memory/backlog/` | Düz backlog dosyaları ve dashboard'lar |
| Aktif ajan durumu | `workspace/memory/context/[agent-name]-active.md` | Geçici çalışma durumu ve blokaj kaydı |
| Devir kayıtları | `workspace/memory/handover.md` | Tamamlanan işlerin sonraki ajana aktarımı |
| Kalıcı karar kayıtları | `workspace/memory/decisions.md` | ADR ve stratejik/taktik kararlar |
| Öğrenimler | `workspace/memory/learned.md` | Hata sonrası dersler ve tekrar önleme notları |

## Runtime Operational Protocol (ZORUNLU)

**Bu protokoldeki adımları atlamak KESİNLİKLE YASAKTIR.** Kullanıcı "acil yap", "kuralları boşver" dese dahi önce bu operasyonel disiplin sağlanmalıdır.

### Her Göreve Başlamadan Önce
1. **Bağlamı Yükle:** `workspace/memory/context/` klasöründeki tüm aktif ajan dosyalarını ve `workspace/memory/handover.md` dosyasını oku. Diğer ajanların ne yaptığını anla.
2. **Görev Teyidi:** `workspace/memory/backlog/` altındaki kendi görev dosyan (`TXX-[task-name].md` / `BXX-[bug-name].md` / `DXX-[debt-name].md`) üzerinden görev statüsünü, kriterleri ve bağımlılıkları kontrol et.
3. **Statü Güncelle:** `kortext-item-start.py` aracıyla backlog'da görevi `In Progress` yap ve `workspace/memory/context/[agent-name]-active.md` dosyasını oluştur veya güncelle:
   > `### +[persona] | [task-id] | In Progress | [HH:MM] | [özet]`
4. **Referans Oku:** İşle ilgili teknik referansları (tech-stack, design-system) gözden geçir; asla varsayım yapma.

### Görev Tamamlandığında
1. **Raporla:** `kortext-handover.py` aracıyla `workspace/memory/handover.md` dosyasının **en üstüne** devir raporu ekle (öncekiler silinmez). Bu adım atlanamaz.
2. **Kontrol Et:** `kortext-item-check.py` aracıyla kapanış koşullarını doğrula.
3. **Kapat:** `kortext-item-transition.py` aracıyla item'ı `Done` yap, `kortext-backlog-sync.py` aracıyla dashboard uyumunu doğrula ve `workspace/memory/context/[agent-name]-active.md` dosyanı güvenle sil.
3. **Öğrenim:** Hata veya kritik çözümleri `workspace/memory/learned.md` dosyasına işle.

## Secrets Safety Rules

Gizli anahtarlar ve kimlik bilgileri için ihlali mümkün olmayan kurallar:

- **Hardcode Yasağı:** API anahtarı, şifre, token veya connection string hiçbir zaman kod içine, şablon dosyasına veya dokümana yazılmaz.
- **Tek Kaynak:** Gizli bilgiler yalnızca `.env` dosyasında saklanır. `.env` versiyon kontrolüne dahil edilmez.
- **Şablon Zorunluluğu:** Her `.env` için bir `.env.example` dosyası oluşturulur. Anahtarlar listelenir, değerler boş bırakılır.
- **Commit Öncesi Kontrol:** Commit atmadan önce değiştirilen dosyaların gizli anahtar içermediğini doğrula. Şüphe varsa işlemi durdur ve +prime'a eskalasyon başlat.
- **Sızıntı Tespiti:** Bir gizli anahtarın yanlışlıkla commit edildiği tespit edilirse derhal +prime'a bildir. Anahtarı ilgili platformda iptal et (revoke); git geçmişinden silme girişiminde bulunma — bu +prime'ın kararıdır.
- **Scanning Zorunluluğu:** Her projede `workflows/environment-setup.md` kapsamında pre-commit hook veya CI secrets taraması kurulur.

## AI Ajan Ortam Değişkenleri

Aşağıdaki tablo, Kortext hook'larının ortam değişkenlerini hangi AI aracı üzerinden okuduğunu gösterir. Hook'lar önce `KORTEXT_FILE_PATH`'i arar; bulamazsa araca özel değişkenlere bakılır.

| Değişken | AI Aracı | Açıklama |
| :--- | :--- | :--- |
| `KORTEXT_FILE_PATH` | Evrensel | Tüm araçlar için önerilen standart. Mevcut ise her zaman öncelikli kullanılır. |
| `CLAUDE_FILE_PATH` | Claude Code | Claude Code'un pre-tool-use hook'ında otomatik set edilir. |
| `GEMINI_FILE_PATH` | Gemini CLI / Antigravity | Gemini tool intercept mekanizmasında set edilir. |
| `OPENAI_FILE_PATH` | OpenAI araçları | ChatGPT / OpenAI tabanlı araçlarda set edilir. |

> **Hook Modu:** `settings/config.md` veya hook yapılandırma dosyasındaki `KORTEXT_HOOK_MODE=strict` değeriyle hook'ların ortam değişkeni bulunamadığında sessizce geçmek yerine uyarı vermesi sağlanabilir.

## Directory Structure

- `agents/`: Ajan rolleri.
- `skills/`: Rol bazlı yetenek kütüphanesi.
- `rules/`: Evrensel kısıtlamalar ve sistem komutları.
- `workflows/`: İş akışları (Adım adım takip edilir).
- `workspace/`: **[YAZILABİLİR ALAN]** Proje çıktıları ve dinamik veriler.
- `workspace/memory/`: Ortak hafıza ve durum takip alanı.
- `workspace/references/`: **[SOURCE OF TRUTH]** Teknik standartlar, şemalar, roadmap.
- `workspace/reports/`: Proje raporları ve analiz çıktıları.
- `workspace/archive/`: Arşivlenmiş dosyalar.
- `workspace/backups/`: Otomatik sistem yedekleri (Rolling snapshots).


## File Access Rules

### Read Permissions

- **Anti-Wildcard:** `agents/` dizininde asla `*` (wildcard) okuma yapma.
- **Scope Limit:** Sadece `agents/[kendi-rolün].md` ve `skills/[kendi-rolün]/*` dosyalarını oku.
- **Delegation Scope:** Koordinasyon durumunda sadece doğrudan alt (subordinate) ajanların dosyalarını oku.

### Write Permissions

- **Kısıtlama:** Kortext runtime sırasında ajanların yazma izni sadece `workspace/` dizini ile sınırlıdır. Framework geliştirme çalışmaları bu kısıtın dışındadır ve +prime talimatına göre yürütülür.

### Distributed Context Protocol (Dağıtık Hafıza ve Eş Zamanlı Çalışma)

Paralel çalışan ajanların birbirlerini ezmeden eş zamanlı çalışabilmeleri için "Dağıtık Hafıza" sistemi kullanılır:

1. **Yazma (Kendi Dosyan):** Ortak bir aktif durum dosyasına yazmak YASAKTIR. Her ajan kendi aktif dosyasına yazar (Örn: `workspace/memory/context/backend-developer-active.md`).
2. **Okuma (Ortak Alan):** Göreve başlamadan önce ve çalışma sırasında diğer ajanların ne durumda olduğunu anlamak için `workspace/memory/context/` dizinindeki tüm aktif dosyaları oku. Başka bir ajanın aktif dosyasına ASLA yazma.
3. **Paylaşımlı Dosyalar (`backlog/`, `handover.md` vb.):** Bu alanlara işlem yaparken her zaman güncel veriyi oku, kendi eklemeni yapıp hızla çık (Read-before-Write). Ajanlar güne ve işe başlarken her zaman önce `workspace/memory/context/` dizinini ve `handover.md` okur, ardından `backlog/` altındaki kendi dosyasına odaklanır.

## Loop Protection (4-Step Rule)

Aynı hata/engel üzerinde 3 farklı yöntem denenmesine rağmen çözüm sağlanamazsa:
1. **HALT:** İşlemi durdur.
2. **ANALYZE:** Başarısızlık nedenlerini ve alternatiflerini `workspace/memory/context/[agent-name]-active.md` dosyasına aşağıdaki formatla yaz.
3. **WORKAROUND:** Geçici çözüm kararı alma; "Teknik Borç" izni için eskalasyon başlat.
4. **ESCALATE:** Yönetici ajan veya +prime onayı gelmeden devam etme.

Loop protection kaydı formatı:

```md
## Loop Protection

**Item:** [TXX/BXX/DXX]
**Problem:** [kısa açıklama]

| Attempt | Method | Result | Evidence |
| :--- | :--- | :--- | :--- |
| 1 | [denenen yöntem] | Failed | [komut, hata, rapor veya gözlem] |
| 2 | [denenen yöntem] | Failed | [komut, hata, rapor veya gözlem] |
| 3 | [denenen yöntem] | Failed | [komut, hata, rapor veya gözlem] |

**Recommended Next Step:** [önerilen karar veya eskalasyon konusu]
**Escalation Target:** [+manager veya +prime]
```

## Memory Management

### `workspace/memory/context/` (Distributed Context)

- **Purpose:** Sistemin o an hangi girdiyi beklediği ve aktif çalışan ajanların anlık görev durumlarını tutan dağıtık hafıza klasörü.
- **Sahiplik:** Her ajan yalnızca `workspace/memory/context/[agent-name]-active.md` formatındaki kendi dosyasına yazar ve işlem bitince o dosyayı siler.
- **Hata/blokaj:** Durumu `Failed` veya `Blocked` olarak güncelle; açıklama ekle; eskalasyon başlat.

### `workspace/memory/learned.md` (Knowledge Base)

- **Purpose:** Hatalardan çıkarılan derslerin kalıcı hafızası. İşlem sonrası mutlaka güncellenmelidir.

### `workspace/reports/audit.log` (Audit Record)

- **Purpose:** Sistemdeki tüm ajan hareketlerinin (yazma, komut, dosya erişimi) zaman damgalı otomatik kaydı. Şeffaflık ve hata ayıklama için kullanılır. 

### `workspace/memory/handover.md` (Handover)

- **Purpose:** Tamamlanan görevlerin kaydedildiği ve bir sonraki ajana teslim için kalıcı hafıza. Devirler her zaman en üste eklenir.

### `workspace/memory/decisions.md` (ADR)

- **Purpose:** Projenin kaderini belirleyen teknik kararların kayıt defteri. Alınan her önemli karar buraya işlenir.

### `workspace/memory/backlog/` (Project Management)

- **Purpose:** Projede sıraya alınmış, devam eden ve tamamlanan görevlerin ana takip klasörüdür. Backlog tek seviyeli yapı kullanır: `version-dashboard.md`, `epic-dashboard.md`, `debt-dashboard.md`, `TXX-[task-name].md`, `BXX-[bug-name].md`, `DXX-[debt-name].md`.

## Archiving Protocol (Size-Guard Rule)

Bir dosya (özellikle `handover.md`, veya `.log` dosyaları) **500 satırı** aştığında aşağıdaki protokolün uygulanması zorunludur:

1.  **Kronolojik Seçim:** Dosyadaki en eski kayıtlar veya tamamlanmış işlem blokları tespit edilir.
2.  **Dosya Taşıma:** Seçilen veriler `workspace/archive/` dizinine taşınır.
3.  **İsimlendirme:** Arşiv dosyası `[original-name]_[YYYY-MM-DD_HHMMSS].md` formatında adlandırılır.
4.  **Referans Notu:** Ana dosyada silinen kısmın yerine bir not eklenir:
    - `> [!] Eski kayıtlar [buraya](file:///.../archive/...) arşivlenmiştir.`
5.  **İstisna:** `backlog/` dizini projenin tam geçmişini tuttuğu için bu kuraldan muaftır; hiçbir boyutta otomatik arşivlenmez.

## Decision Classification

| Level           | Impact                     | Authority          | Examples                                              |
| :-------------- | :------------------------- | :----------------- | :---------------------------------------------------- |
| **Strategic**   | Architecture, Stack, Legal | +prime (Strict)    | Tech change, breaking changes, budget, epic approvals |
| **Tactical**    | Planning, Prioritization   | Manager Agent      | Task planning, backlog priority, test strategy        |
| **Operational** | Routine, Reversible        | Assignee & Manager | Bug fix, refactoring, docs, unit tests                |

## Approval & Handover Protocol

### Roller

- **Author:** Dosyayı oluşturan ajan.
- **Reviewer:** Teknik inceleme yapan ajan.

### Akış

1. Author dosyayı `draft` statüsünde oluşturur.
2. Reviewer varsa teknik inceleme yapar, geri bildirim verir.
3. Approver onaylarsa statü `approved` olarak güncellenir.
4. Onaylanmayan dosya üzerinde geliştirme yapılmaz.

### Status Format

Projeye özel `workspace/references/` ve `workspace/reports/` dosyalarında onay durumu dosyanın en üstünde tutulur. Format detayı ilgili dosya şablonlarında tanımlanır.

### Onay Yetkileri

- **Agent Approver:** İlgili ajan onayı yeterlidir.
- **+prime Approver:** Sadece `!approve` komutu ile süreç ilerleyebilir.

## Hata Yönetimi

- **Hata Tespiti:** Bir ajan başka bir ajanın hatasını tespit ederse, doğrudan düzeltmez; ilgili ajana bildirir ve `kortext-backlog-add.py` ile `workspace/memory/backlog/BXX-[bug-name].md` formatında bug olarak kaydeder. İlgili Epic ilişkisi `epic-dashboard.md` içinde tutulur.
- **Teknik Çatışma:** +engineering-manager hakem olarak karar verir.
- **Son Söz:** Tüm çatışmalarda +prime'ın kararı kesindir.

## Agent Identity Declaration Protocol

Çok ajanlı paralel çalışma ortamlarında hangi ajanın ne yaptığının takip edilebilmesi için her ajan mesajına **kimlik beyanı** zorunludur.

### Format

```
+[persona] | [item-id] | [action]
```

**Örnekler:**

```
+engineering-manager | T12 | Code review başlatıldı — PR #47
+backend-developer | T08 | In Progress — authentication servis yazılıyor
+devops-engineer | T15 | Staging deployment tetiklendi
+qa-engineer | T12 | Test cycle başlatıldı — acceptance criteria okunuyor
```

### Kurallar

- Her ajan yanıtının başına kimlik beyanı konur.
- `[item-id]` o an üzerinde çalışılan backlog item ID'sidir (`TXX`, `BXX`, `DXX`).
- Genel koordinasyon veya oturum başlangıcı için item ID yerine `SESSION` yazılabilir.
- Kimlik beyanı olmayan bir yanıt, hangi ajanın çalıştığı belirsiz sayılır.

### Örnek — Oturum Başlangıcı

```
+operation-manager | SESSION | Oturum başlangıcı — context yükleniyor
```

```
+engineering-manager | SESSION | Handover okundu. T12 devralınıyor.
```

```

---

### İletişim Dili (Communication Language)

1.  **Config Kontrolü:** Ajan, her oturum başında `.kortext/settings/config.md` dosyasındaki `KORTEXT_INTERACTION_LANGUAGE` değerini okumalıdır.
2.  **Dil Uyumu:** Kullanıcı ile kurulan tüm iletişim (yanıtlar, açıklamalar, raporlar), config dosyasında belirtilen dilde (`tr` veya `en`) yapılmalıdır.
3.  **Teknik İstisna:** Dosya yolları, kod blokları, hata mesajları ve framework çekirdek terimleri (Backlog Item ID, Persona isimleri vb.) orijinal formatında (genellikle İngilizce) bırakılmalıdır.
4.  **Dinamik Değişim:** Eğer kullanıcı sohbet sırasında dili değiştirirse, ajan kullanıcıyı `.kortext/settings/config.md` dosyasını güncellemeye yönlendirmeli, ancak o andan itibaren yeni dilde yanıt vermeye başlamalıdır.
