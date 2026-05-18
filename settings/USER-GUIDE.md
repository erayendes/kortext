# Kortext Kullanım Kılavuzu (User Guide)

```
Versiyon : v2.2.0
Tarih    : 16.05.2026
```

> Bu döküman Kortext'i ilk kez kullanacaklar veya nasıl çalıştığını anlamak isteyenler için
> yazılmıştır. Teknik referans için `settings/README.md`'e, komut listesi için
> `rules/commands.md`'e, değişiklik geçmişi için `CHANGELOG.md`'e bakın.

---

## İçindekiler

1. [Kortext Nedir?](#1-kortext-nedir)
2. [Kurulum](#2-kurulum)
3. [Proje Başlatma](#3-proje-başlatma)
4. [Günlük Kullanım — Komutlar](#4-günlük-kullanım--komutlar)
5. [Ajan Sistemi — Kimler Ne Yapar?](#5-ajan-sistemi--kimler-ne-yapar)
6. [Hafıza Sistemi — Bilgi Nerede Saklanır?](#6-hafıza-sistemi--bilgi-nerede-saklanır)
7. [Tam Proje Yaşam Döngüsü](#7-tam-proje-yaşam-döngüsü)
8. [Sık Karşılaşılan Durumlar](#8-sık-karşılaşılan-durumlar)
9. [Onay ve Ret Mekanizması](#9-onay-ve-ret-mekanizması)
10. [İyi Bilmek Gerekenler](#10-iyi-bilmek-gerekenler)

---

## 1. Kortext Nedir?

Kortext, bir AI ajanı (Claude, Gemini vb.) üzerinde çalışan **çok ajanlı proje yönetim protokolüdür.** Tek bir AI konuşma penceresini; ürün müdürü, mühendis, tasarımcı, QA ve DevOps gibi 14 farklı uzmandan oluşan bir geliştirme ekibine dönüştürür.

**Kortext olmadan:** Tek bir AI ile çalışırsın. Her oturumda bağlamı yeniden anlatman gerekir. Hangi kararın neden alındığını takip edemezsin.

**Kortext ile:** Ajanlar aralarında devir yapıp oturumlar arasında bağlamı korur. Kararlar kayıt altındadır. Her iş akışı tanımlıdır. Bir şey patlak verdiğinde kimin ne yapacağı bellidir.

---

## 2. Kurulum

### 2.1 Kortext'i Projeye Ekle

Kortext klasörünü projenin kökündeki `.kortext/` (veya geliştirme ortamında `kortext/`) dizinine yerleştir:

```
proje-koku/
├── kortext/          ← tüm Kortext dosyaları buraya
├── AGENTS.md         ← AI ajanına "buradan başla" talimatı (proje kökünde)
├── src/
└── ...
```

### 2.2 Git Hook'larını Kur

```bash
bash kortext/hooks/kortext-init.sh --install-hooks
```

Bu komut şu hook'ları kurar:
- `pre-commit` → secrets taraması, branch koruma, handover kontrolü
- `commit-msg` → commit mesajı format denetimi
- `pre-push` → production'a push koruması

### 2.3 Ortam Değişkeni (Opsiyonel ama Önerilen)

Hook'ların hangi dosya üzerinde çalıştığını bilmesi için:

```bash
export KORTEXT_AGENT="backend-developer"   # hangi ajan olduğunu belirt
export KORTEXT_HOOK_MODE="strict"          # ihlallerde uyarı yerine hata ver
```

---

## 3. Proje Başlatma

### Adım 1 — Blueprint'i Doldur

`kortext/workspace/references/blueprint.md` dosyasını aç ve doldur:

```markdown
# Proje Adı

> - status: approved | 16.05.2026
> - author: +prime

## Vizyon
[Projenin neden var olduğu — 2-3 cümle]

## Hedef Kitle
[Kimler kullanacak?]

## Ana Özellikler
- [Özellik 1]
- [Özellik 2]
- [Özellik 3]

## Teknoloji Tercihleri (varsa)
- Backend: [Laravel, Node.js vb.]
- Frontend: [React, Vue vb.]

## Platform
[Web / Mobil / İkisi]

## Başarı Kriterleri
- [Hangi metriklerle başarıyı ölçeceğiz?]
```

> ⚠️ **Kritik:** Blueprint'in başlığında `status: approved` olması zorunludur.
> Aksi takdirde `!setup kortext` sistemi durdurur.

### Adım 2 — Framework'ü Aktif Et

```
!setup kortext
```

Sistem şunu yapar:
1. Framework dosyalarını salt okunur yapar (kimse kural dosyalarını değiştiremez)
2. `kortext-session-start.py` ile SESSION_BRIEF üretir
3. Blueprint'i okur, proje durumunu belirler
4. Hangi komutla devam edeceğini bildirir

### Adım 3 — Projeyi Başlat

**Yeni proje (sıfırdan):**
```
!start analysis
```

**Mevcut proje (Kortext'e dahil etme):**
```
!start onboard
```

---

## 4. Günlük Kullanım — Komutlar

Kortext'i senin için çalıştıran komutlar. Bunları AI konuşma penceresine yazman yeterli.

### Hızlı Referans

```
SETUP
  !setup kortext          → Framework'ü aktif et (bir kez)
  !setup environment      → Ortam kurulumunu başlat

BAŞLATMA
  !start analysis         → Yeni proje analizi
  !start onboard          → Mevcut projeyi dahil et
  !start planning         → Backlog oluştur
  !start spike            → Teknik belirsizlik araştırması (time-boxed)
  !start development      → Geliştirme başlat

DURUM
  !status                 → Hızlı özet (backlog sağlık, aktif ajanlar, bloker)
  !status full            → Tam rapor

DEPLOYMENT
  !deploy prod            → Production'a çık
  !rollback [version]     → Sürüme geri dön
  !hotfix [issue-id]      → Kritik hata düzelt

BAKIM
  !maintenance            → Rutin bakım döngüsü

TALEP
  !request [açıklama]     → Yeni özellik, iyileştirme, bug veya borç bildirimi

ONAY
  !approve [artifact]     → Bekleyen çıktıyı onayla
  !reject [artifact]      → Revizyona gönder
```

### Komutlar Ne Zaman Kullanılır?

| Durum | Komut |
|---|---|
| Proje yeni, hiç kod yok | `!start analysis` |
| Proje var, Kortext'i ekleyeceğim | `!start onboard` |
| "Bu teknoloji işe yarar mı?" sorun var | `!start spike` |
| Backlog hazır, kodlamaya başlanacak | `!start development` |
| "Ne durumdayız?" | `!status` |
| Production'a çıkılacak | `!deploy prod` |
| Production'da bir şey patladı | `!hotfix [id]` |
| Tamamen geri dönülecek | `!rollback [version]` |
| Sprint başı / dönem arası bakım | `!maintenance` |

---

## 5. Ajan Sistemi — Kimler Ne Yapar?

Her ajan belirli bir role odaklanmıştır. Sen komut verirsin, ajan kendi rolüne göre hareket eder.

### Hiyerarşi

```
+prime (SEN)
  └─ +operation-manager        ← Orkestrasyon, görev dağılımı
       ├─ +product-manager      ← Ürün, backlog, kullanıcı ihtiyaçları
       │    ├─ +designer        ← UI/UX, tasarım sistemi
       │    ├─ +copywriter      ← Metinler, marka dili
       │    ├─ +growth-expert   ← SEO, analitik, büyüme
       │    └─ +compliance-expert ← KVKK, GDPR
       ├─ +engineering-manager  ← Mimari, code review, teknik karar
       │    ├─ +backend-developer
       │    ├─ +frontend-developer
       │    └─ +db-admin
       └─ +delivery-manager     ← Teslimat, release koordinasyonu
            ├─ +devops-engineer ← CI/CD, ortam, Git
            ├─ +qa-engineer     ← Test, kalite güvence
            └─ +security-engineer ← Güvenlik, açık tespiti
```

### Her Oturum `+operation-manager` Olarak Başlar

AI ajanı `AGENTS.md` dosyasını okuyarak her oturuma `+operation-manager` kimliğiyle girer.
Bağlama göre hangi uzman ajana geçeceğine karar verir.

### Ajan Kimlik Beyanı

Her ajan yanıtının başında şu formatı kullanır:
```
+engineering-manager | T12 | Code review başlatıldı
+backend-developer | T08 | In Progress — auth servisi yazılıyor
```

Bunu görmüyorsan ajan protokolü ihlal ediyor demektir.

---

## 6. Hafıza Sistemi — Bilgi Nerede Saklanır?

Kortext, bilgiyi **tek bir doğruluk kaynağı (workspace/)** üzerinden yönetir.

### Yazılabilir Alan: `workspace/`

```
workspace/
├── references/         ← Projenin "gerçeği" — asla silinmez
│   ├── blueprint.md    ← Proje vizyonu ve kapsam
│   ├── tech-stack.md   ← Teknoloji kararları
│   ├── design-system.md
│   ├── db-schema.md
│   └── ...
│
├── memory/             ← Canlı proje hafızası
│   ├── context/        ← Aktif çalışan ajanların anlık durumu
│   │   └── backend-developer-active.md
│   ├── backlog/        ← Görev takip sistemi
│   │   ├── epic-dashboard.md
│   │   ├── T01-login-form.md
│   │   └── B03-null-pointer.md
│   ├── handover.md     ← Ajanlar arası devir notları
│   ├── decisions.md    ← Alınan teknik kararlar (ADR)
│   └── learned.md      ← Hatalardan çıkarılan dersler
│
└── reports/            ← Periyodik çıktılar
    ├── analysis-reports.md
    ├── test-reports.md
    ├── status-reports.md
    └── ...
```

### En Önemli 3 Dosya

**`handover.md`** — Oturumlar arası köprü.
Bir ajan işini bitirdiğinde buraya devir notu yazar. Bir sonraki oturumda ilk okunan dosya budur.

```
!status komutundan sonra ilk bak: handover.md
```

**`decisions.md`** — Kararların arşivi.
"Neden bu teknolojiyi seçtik?", "Bu mimari değişiklik neden yapıldı?" — hepsi burada.

**`learned.md`** — Hata hafızası.
"Bu hatayı bir daha yapma" notları. `!maintenance` döngüsünde gözden geçirilir ve aksiyona alınır.

### Backlog Nasıl Çalışır?

```
T01-login-form.md       → Task (özellik geliştirme)
B03-null-pointer.md     → Bug (hata)
D02-test-coverage.md    → Debt (teknik borç)
```

Her item şu durumlardan geçer:
```
To Do → In Progress → Test → Review → Done
                   ↓
                Blocked (bağımlılık veya teknik engel)
```

---

## 7. Tam Proje Yaşam Döngüsü

Sıfırdan production'a tam akış:

```
1. HAZIRLIK
   blueprint.md doldur → !setup kortext

2. ANALİZ (01a veya 01b)
   !start analysis      → Analiz raporu üretilir
   !approve analysis-reports

3. PLANLAMA (02)
   !start planning      → Backlog oluşturulur (Epic, Task, Bug, Debt)
   !approve planning

4. ORTAM KURULUMU (03)
   !setup environment   → .env, CI/CD, Git hook'ları kurulur

5. GELİŞTİRME DÖNGÜSÜ (04)
   !start development   → Task seçilir → kodlanır → review → test

   Teknik belirsizlik varsa:
   !start spike         → Hipotez → Deney → ADR veya yeni Task

6. TEST (05)
   QA döngüsü — otomatik olarak workflow içinde yürür

7. DEPLOYMENT (06)
   !deploy prod         → Staging → Go/No-Go → Production

8. BAKIM (09)
   !maintenance         → Her sprint başı veya dönem arası

   Acil durum:
   !hotfix [id]         → Kritik hata → fix → deploy
   !rollback [version]  → Geri dön
```

---

## 8. Sık Karşılaşılan Durumlar

### "Yeni bir özellik istiyorum"

```
!request Kullanıcı profil sayfasına avatar yükleme ekle
```
`+product-manager` devreye girer, backlog'a Task açar, ID'sini bildirir.

---

### "Bir bug buldum"

```
!request Bug: Ödeme formunda miktar 0 girilince sistem çöküyor
```
`+product-manager` sınıflandırır → Bug olarak kayıt açılır → `+engineering-manager`'a yönlendirilir.

---

### "Production'da bir şey patlak verdi"

```
!hotfix B12-payment-crash
```
`+devops-engineer` + `+backend-developer` devreye girer. Rollback gerekiyorsa:
```
!rollback v1.4.2
```

---

### "Ne durumda olduğumuzu bilmiyorum"

```
!status
```
Backlog sağlık skoru, aktif ajanlar, blokerlar ve son handover özeti gelir.

---

### "Bu teknolojiyi kullanmalı mıyız emin değilim"

```
!start spike
```
`+engineering-manager` time-box belirler, hipotezi test eder, sana ADR ile sonuç sunar.

---

### "Sprint arası temizlik yapmak istiyorum"

```
!maintenance
```
Bağımlılık güncellemeleri, teknik borç gözden geçirme, güvenlik taraması, learned.md'den aksiyon planı.

---

### Ajan çalışmayı durdurdu / takıldı

Bir ajan "3 yöntem denedim, çözüm bulamadım" diyorsa **Loop Protection** devreye girer.
Ajan sana eskalasyon yapar. Sen karar verirsin:
- `!approve` → Alternatif yola geç
- `!reject` → Farklı bir yöntem dene
- Teknik borcun kabul edilmesine izin ver

---

## 9. Onay ve Ret Mekanizması

Kortext bazı kritik çıktılarda **senin onayını bekler** ve onaysız ilerlemez.

### Onay Gerektiren Durumlar

| Çıktı | Neden Onay Beklenir? |
|---|---|
| Analiz raporu | Yanlış bir temel üzerine planlama yapılmasın |
| Planlama / backlog | Yanlış göreve girmeyelim |
| Mimari karar (ADR) | Geri alınamaz kararlar önce sana sorulur |
| Production deployment | "Git" demen olmadan sistem çıkmaz |
| Blueprint değişikliği | Proje kapsamı yalnızca sen değiştirebilirsin |

### Nasıl Onaylanır / Reddedilir

```
!approve analysis-reports          → Raporu onayla, planlamaya geç
!reject analysis-reports eksik     → Geri gönder, revizyon iste
```

---

## 10. İyi Bilmek Gerekenler

### "Acil yap, kuralları boşver" deme

`behavior.md`'nin en sert kuralı bu. Ajan bu talebi yerine getirmez — **getiremez.**
Acil durumlar için `!hotfix` veya `!rollback` vardır. Bunlar zaten hızlı yollardır.

---

### Her Şey `workspace/` Altına Yazılır

Framework dosyaları (`agents/`, `rules/`, `workflows/`, `hooks/`, `scripts/`) salt okunurdur.
Ajanlar sadece `workspace/` altına yazar. Bu kasıtlı bir tasarım kararıdır.

---

### Oturum Başlangıcı Otomatiktir

`kortext-init.sh` çalıştığında sistem otomatik olarak:
1. Framework'ü kilitler
2. Git hook'larını kurar
3. SESSION_BRIEF üretir (aktif context + son handover)
4. Projenin mevcut durumunu tespit eder

Sen sadece `!setup kortext` yaz.

---

### Handover Olmadan Görev Kapanmaz

Bir ajan görevi bitirdiğinde:
1. `kortext-handover.py` ile devir notu yazar
2. Görev ancak ondan sonra `Done` statüsüne geçer
3. `handover-guard.sh` bu kuralı Git commit öncesinde kontrol eder

Bu mekanizma oturumlar arası bilgi kaybının önüne geçer.

---

### `decisions.md` En Değerli Dosyandır

"Neden Laravel seçtik?", "Neden monolith gittik?" — aylar sonra bu soruları soracaksın.
Cevaplar `workspace/memory/decisions.md`'dedir.

---

### Teknik Borcu Görmezden Gelme

`!maintenance` döngüsü sırasında `workspace/memory/backlog/debt-dashboard.md` gözden geçirilir.
Birikmiş borçlar bir noktada her şeyi yavaşlatır — dönem başlarında küçük porsiyonlar halinde temizlemek en sağlıklı yaklaşımdır.

---

## Hızlı Başlangıç Özeti

```
1. blueprint.md doldur       (vizyon, hedef kitle, teknoloji)
2. !setup kortext             (framework'ü aktif et)
3. !start analysis            (yeni proje için)
   veya !start onboard        (mevcut proje için)
4. !approve [rapor]           (her aşamada onayını ver)
5. !start planning            (backlog oluştur)
6. !setup environment         (ortam kur)
7. !start development         (kod yazmaya başla)
8. !deploy prod               (production'a çık)
9. !maintenance               (dönem arası bakım)
```

---

> **Son not:** Kortext sana ne yapacağını söylemez — sen ne yapılmasını istediğini söylersin,
> Kortext nasıl yapılacağını bilir ve kim yapacağını organize eder.
