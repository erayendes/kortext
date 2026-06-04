# Tasarım: Kortext'i tam çalışır hale getirme (vitrin + kontak)

> **Durum:** Eray onayı bekliyor (design level). Onaylanınca Faz A ekran-ekran uygulanır.
> **Tarih:** 2026-06-04 · **Branch:** main · **Push:** Eray "push" diyene kadar YOK.
> İlgili: [DECISIONS.md](../DECISIONS.md) · [HANDOVER.md](../HANDOVER.md) · [DESIGN.md](../DESIGN.md)

## 1. Amaç (Eray'ın isteği)

> "Tüm tasarımı artık gerçek manada Kortext'e yedir. Kortext çalışır hale gelmeli."

Bugün uygulama **~%70 gerçek bağlı**. Çekirdek akış (Onboarding → Dashboard → Board → Memory → Reports → References) gerçek veriyle çalışıyor. Geriye **boş/sahte ekranlar** (settings pane'leri) ve **hiç canlı denenmemiş otonom ajan sürücüsü** kaldı.

**Eray'ın seçimi:** "İkisi de — önce vitrin, sonra kontak."

- **Faz A — Vitrin:** Boş ekranları gerçek backend'e bağla. Her düğme bir iş yapsın.
- **Faz B — Kontak:** Anahtarı (`KORTEXT_DRIVE_ENABLED`) çevir, gerçek bir AI ajanı backlog'dan bir işi baştan sona yapsın.

## 2. Kesişen kararlar (Eray sade-dille onayladı, 2026-06-04)

| Konu | Karar | Sebep |
|------|-------|-------|
| **Integrations** | Şimdilik **sadece kaydet** — token/ayar sakla, "bağlı/değil" göster; gerçek OAuth/API çağrısı YOK | Hızlı + güvenli; ekran gerçek veriyle çalışır, kapsam patlamaz |
| **Gizli anahtarlar** | **Basit yerel dosya** — `.env` benzeri, projenin içinde, git'e gitmez | Tek kişilik yerel araç için standart ve yeterli |
| **Danger zone** | **Dashboard'dan gerçekten çalışsın** — onay diyaloglu arşivle/sıfırla/sil | Vitrin tam dolu olsun |

## 3. Faz A — Vitrin: ortak temeller

İki paylaşılan ilkel (primitive), pane'ler bunların üstüne kurulur:

1. **Proje ayar deposu (settings store):** Proje-kapsamlı, gizli-olmayan ayarlar. Mevcut proje meta deposunu (`project.json` / blueprint) genişletir; gerekirse `.kortext/settings/*.json` veya küçük bir SQLite tablosu. Hooks ve Integrations'ın gizli-olmayan kısmı burada durur.
2. **Gizli değer deposu (secret store):** Tek bir yerel `.env` benzeri dosya (gitignored). **Ortak okuma/yazma yardımcısı.** Hem Integrations token'ları hem Environment değişkenleri AYNI dosyayı kullanır. `.gitignore`'a eklenir; var olduğu doğrulanır.

> İlke: değer **gizliyse** → secret store; **gizli değilse** → settings store. Token'lar gizlidir.

## 4. Faz A — pane pane plan

Sıra: en kolay+değerliden riskliye. Her satır = ayrı LOKAL commit; mantık varsa TDD, saf görsel ise screenshot doğrulaması.

| # | Pane | Depo | Endpoint (yeni/var) | UI değişimi | Test |
|---|------|------|---------------------|-------------|------|
| **A1** | **Agents — kaydet** | persona md dosyaları (var) | `PUT /api/personas/:handle` (VAR) | `PersonaEditor`'ı PUT'a bağla; kaydet→tazele | TDD: editor→PUT çağrı sözleşmesi; canlı: düzenle→kaydet→geri oku |
| **A2** | **Project Settings — kaydet** | proje meta (blueprint/project.json) | proje meta `POST` (blueprint endpoint'ini genişlet) | Form alanlarını gerçek meta ile doldur; "Kaydet" → POST → tazele | TDD: meta yaz/oku round-trip; canlı: değiştir→yenile→kalıcı |
| **A3** | **Workflows diyagramı** | workflow registry (var) | `GET /api/workflows/:id` (VAR; gerekirse adımlar için genişlet) | Sahte "Step 1 ✓" satırları yerine gerçek workflow fazlarını çiz | TDD: registry→diyagram satırı türetimi (saf fonksiyon) |
| **A4** | **Hooks** | settings store | `GET/PUT /api/hooks` (yeni) | Açma/kapama anahtarları durumu yükler + kaydeder | TDD: hook config yaz/oku + varsayılanlar |
| **A5** | **Integrations** | settings (durum) + secret (token) | `GET/PUT /api/integrations` (yeni) | Bağlan = token gir→kaydet→"bağlı" rozeti; bağlantıyı kes = sil | TDD: integration kaydet (token secret'a, durum settings'e) + maskeleme |
| **A6** | **Environment** | secret store | `GET/PUT/DELETE /api/env` (yeni) | Değişken ekle/düzenle/sil; değerler maskeli | TDD: env yaz/oku/sil; gizli maskeleme; `.gitignore` kontrolü |
| **A7** | **Danger zone** | proje registry + DB + dosya sistemi | `POST /api/project/archive` · `/reset-memory` · `DELETE /api/project` (yeni) | Düğme → onay diyaloğu (proje adını yaz) → gerçek işlem → sonuç | TDD: her işlemin etkisi (arşiv taşır, reset memory tablolarını boşaltır, delete registry'den çıkarır); **geri dönüşsüz → ağır test** |

**Güvenlik notları (A5–A7):**
- Token'lar UI'da hep maskeli (`ghp_••••1234`); GET asla tam secret döndürmez.
- Danger zone işlemleri **çift onay** (proje adını elle yazma) ister; `DELETE` dosyaları silmeden önce arşivler veya açıkça uyarır.
- `reset-memory` sadece memory tablolarını (decisions/handovers/learned) temizler, backlog'a dokunmaz (ayrı onay).

## 5. Faz B — Kontak (ayrı brainstorm)

Bu bölüm **ayrı bir tasarım turu** gerektirir; burada sadece çerçeve:

- **Hiç canlı denenmedi.** Sürücü kodu (`driveReadyItems`, `POST /api/drive`) hazır ama `KORTEXT_DRIVE_ENABLED` varsayılan kapalı.
- **En büyük risk:** gerçek bir AI ajanı gerçek git worktree'sinde kod yazar/merge eder. Yanlış yapılandırma **repoyu kirletebilir**. → Kortext'in KENDİ reposunda DEĞİL, ayrı bir **kum havuzu (sandbox) test projesinde** denenir.
- **Akış:** küçük bir backlog item → anahtarı aç → `POST /api/drive` → ajan işi alır → kod yazar → test → onay → "bitti". Gerçek git merge commit'iyle kanıt.
- Faz A bitince Eray ile ayrı oturumda detaylandırılır (hangi ajan, hangi item, kum havuzu kurulumu, gözlem/güvenlik).

## 6. Kapsam dışı (YAGNI)

- Gerçek OAuth / canlı third-party API çağrıları (Integrations sadece-kaydet).
- Şifreli secret vault (basit yerel dosya yeterli).
- Board ertelenenleri: #9 global arama, #10 terminal komut girişi, canlı gate pass/fail — ayrı işler.
- Uygulama-geneli paused cila: gerçek font yükleme + ortak PageHeader düzeni — ayrı iş.
- Dashboard'a görsel "başlat" düğmesi + periyodik zamanlayıcı — Faz B sonrası.

## 7. Yöntem (her pane için)

1. Canlı + wireframe yan yana (screenshot).
2. Mantık varsa **TDD** (vitest, `npm test` yeşil); saf görsel ise screenshot.
3. `npm run typecheck` temiz.
4. Ayrı **LOKAL** commit (push YOK).
5. Eray'a çalışan halini göster (screenshot / kısa demo).

## 8. Başarı ölçütü

- **Faz A bitti:** 14 ekranın hiçbirinde sahte/hardcoded veri kalmadı; her settings düğmesi gerçek bir işlem yapıp kalıcı oluyor. Tüm testler + typecheck yeşil.
- **Faz B bitti (ayrı):** Kum havuzunda gerçek bir AI ajanı bir backlog item'ı insan müdahalesi olmadan "bitti"ye taşıdı, gerçek git merge commit'iyle kanıtlandı.
