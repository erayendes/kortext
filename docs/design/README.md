# Kortext UI — App Design

> Kortext'in görsel kontrol katmanı tasarımı. Tek interaktif HTML mockup + tüm kararlar/gerekçeler.

---

## 🗂️ Bu dizinde ne var?

| Dosya | İçerik | Ne zaman okumalı? |
|-------|--------|------------------|
| **[README.md](./README.md)** | Bu dosya. Genel bakış + navigasyon. | İlk önce. |
| **[DECISIONS.md](./DECISIONS.md)** | Yapılan tüm kararlar + **gerekçeleri**. İteratif geçmiş dahil. | Yeni özellik eklerken/değiştirirken — eskiyi neden böyle yaptığını anla. |
| **[DESIGN.md](./DESIGN.md)** | Görsel tasarım sistemi (renk, tipografi, component'ler) + ekran-bazlı layout açıklamaları. | Görsel iş yaparken. |
| **[TECH.md](./TECH.md)** | Stack, dosya yapısı, nasıl çalıştırılır, kritik kod pattern'ları, güvenlik kuralları. | Kodu okurken/yazarken. |
| **[NEXT-STEPS.md](./NEXT-STEPS.md)** | Mockup tamamlandı — sırada ne var. Backend implementasyon roadmap'i + spec hooks. | Mockup'tan ileri gitmek için. |
| **[kortext-ui-mockup-v2.html](./kortext-ui-mockup-v2.html)** | **Asıl ürün.** Tek dosya HTML mockup. | Çalıştırmak/incelemek için. |

---

## 🚀 Hızlı başlangıç

```bash
cd /Users/erayendes/Documents/_docbase/kortext
npx serve . -l 8092
# Tarayıcıda aç:
open http://localhost:8092/kortext-ui-mockup-v2.html
```

Veya doğrudan dosyayı tarayıcıya sürükle — `file://` modunda da çalışır.

---

## 🎯 Proje Bağlamı (Bir cümle)

**Kortext**, kod bilmeyen kullanıcıların (PM, founder, ürün sahibi) **14 uzmanlaşmış AI ajanını** terminal/markdown bilmeden orkestraştırabileceği bir multi-agent framework. Bu HTML mockup, framework'ün **görsel kontrol katmanını** tanımlar.

**Hedef kitle:** Eray (kod bilmeyen geliştirici) + ileride Kortext kullanan tüm non-coder PM'ler.

**Çıktının kullanım amacı:**
- Demo / slayd sunum
- Backend implementasyonu için tasarım referansı
- Stakeholder'lara "Kortext nasıl görünecek" gösterimi

---

## 🧭 Bir Sonraki Session İçin (Bu Claude'un Notu)

Eğer yeni bir session'da bu projeye dönüyorsan:

1. **Önce kullanıcının uyarılarını oku:**
   - **Eray kod bilmez** — implementasyon detaylarını çok teknik anlatma
   - **Türkçe konuş** — kullanıcı Türkçe yazıyor, sen de Türkçe cevap ver
   - **`innerHTML =` kullanma** — PreToolUse hook engelliyor. `window.renderHTML(el, html)` veya `replaceChildren + insertAdjacentHTML` kullan

2. **Sırayla oku:** `DECISIONS.md` → `DESIGN.md` → `TECH.md`

3. **Mockup'ı tarayıcıda aç ve gez** — tüm ekranları (Landing → Setup → Orbit → Backlog → Task → Agents → Memory → Inbox → References → Reports → Workflows → Settings).

4. **Önceki iterasyonları unutma** — Orbit ekranı **4 kez** tasarlandı. Eğer "bu çirkin" duyduğunda v1/v2/v3'e geri dönme — v4'te bulduğumuz "dikdörtgen kart + radyal yerleşim" doğru paradigma.

5. **Kullanıcı tipik akışı:**
   - "Şu ekrana bak" → ekran adını söyler
   - "Şunu değiştirelim" → spesifik istek
   - "Çok kötü oldu, yeniden yap" → büyük redesign
   - "Şu da oldu" → onay

---

## 📋 12 Ekran (Tamamı çalışır)

| # | Ekran | Hash | Ana özellik |
|---|-------|------|------------|
| 1 | Landing | `#landing` | Hero + 3 feature + CTA |
| 2 | Setup | `#setup` | Project init (name/code/platform/blueprint) |
| 3 | Orbit | `#orbit` | Dikdörtgen kart constellation + Timeline sidebar |
| 4 | Backlog | `#backlog` | 6-kolon Kanban + Epic detail modal |
| 5 | Task Detail | `#task` | Single task drill-in (AC, blocker, audit trail) |
| 6 | Agents | `#agents` | 14-ajan grid + Deep Dive panel |
| 7 | Memory | `#memory` | 3 tab (Decisions/Learned/Handovers) |
| 8 | Inbox | `#inbox` | Approval requests + reject form |
| 9 | References | `#references` | Doc/asset cards + file viewer modal |
| 10 | Reports | `#reports` | View/Edit/Revise mode + approve flow |
| 11 | Workflows | `#workflows` | Loops-aware flow diagram |
| 12 | Settings | `#settings` | 6 tab (General/Models/Hooks/Integrations/Appearance/Danger) |

---

## ⚠️ Bilinmesi gereken

- **Tek HTML dosyası** — başka asset/build/dependency yok. CDN'den Tailwind + Lucide + Google Fonts geliyor.
- **Static mockup** — tıklamalar çalışır, durum değişiklikleri DOM-only (kayıt yok).
- **Sample data:** "Acme CRM" — B2B SaaS, Next.js stack, 4 Epic, 13 task/bug/debt.
- **`launch.json`** root'ta var: `npx serve . -l 8092` ile servis ediyor.

---

## 🔄 Geliştirme tarihi (özet)

| Tarih | Olay |
|-------|------|
| ~2026-05-14 | İlk sürüm `kortext-ui-mockup.html` (deprecated) |
| ~2026-05-15→19 | v2 geliştirme — `kortext-ui-mockup-v2.html` üzerinde 12 ekran |
| 2026-05-19 | Orbit ekranı 4 iterasyon sonrası dikdörtgen kart paradigmasında bulundu |
| 2026-05-19 | Settings ekranı 6 tab ile tamamlandı |
| 2026-05-19 | `app-design/` dizini ile dokümantasyon |
