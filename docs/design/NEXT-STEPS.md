# Kortext UI — Next Steps

> Mockup tamamlandı. Şimdi ne var?

---

## Mevcut durum

✅ **12 ekranlı tek HTML mockup** — `kortext-ui-mockup-v2.html`
✅ **Tüm akışlar tıklanabilir** — sample data ile
✅ **Demo/sunum için hazır** — screenshot'lar `kortext/` root'unda
✅ **Karar dökümanları** — bu `app-design/` dizininde

---

## Hemen yapılabilir (mockup içinde)

### A. Görsel iyileştirmeler (eğer istersen)
- [ ] Bir ekrana ek polish (örneğin Reports'ta sparkline grafik)
- [ ] Yeni bir cross-cutting özellik (örneğin "search across all screens")
- [ ] Mobile responsive layer (şu an 1280px+)
- [ ] Light theme variant (`--bg-0` token'larını override eden body class)
- [ ] Daha fazla animasyon (örneğin Memory tab geçişlerinde fade)

### B. Sunum/demo hazırlığı
- [ ] Tüm ekranların yüksek çözünürlüklü PNG export'u (figma'ya benzer)
- [ ] Slayd seti — "Kortext UI Showcase" — her ekran 1 slide
- [ ] Demo akış video kaydı (Loom/QuickTime)
- [ ] Stakeholder pitch dökümanı

### C. Edge case sample data
- [ ] Empty state'ler (yeni kurulan proje — boş backlog, inbox)
- [ ] Çok sayıda task (20+ kart Kanban'da scroll testi)
- [ ] Blocked workflow (devops-eng 3 task'ı bloke etmiş)
- [ ] Tüm idle (gece moda, hiç ajan çalışmıyor)

---

## Backend implementasyona geçiş

Mockup → gerçek ürün için yol haritası:

### Faz 1: Foundation (1-2 hafta)
- [ ] **Veri modelleri:** Zod şemaları ile
  - `Project`, `Agent`, `Task`, `Epic`, `Decision`, `Learned`, `Handover`
  - `runtime/tasks/*.json`, `workspace/decisions.md`, vb. dosya formatları
- [ ] **State store seçimi:** Tek source of truth nerede?
  - Option A: Dosya tabanlı (.kortext/workspace/*.json)
  - Option B: SQLite local
  - Option C: Hybrid (dosya = canonical, SQLite = index)
- [ ] **HTTP API:** Express/Hono basit endpoint set
  - GET `/api/agents/:id/state`
  - POST `/api/tasks`, `/api/inbox/:id/approve`, vb.
- [ ] **Hook sistemini bağla:**
  - Mockup'taki hook toggle'lar gerçek `settings/hooks/*.json` dosyalarına yansısın

### Faz 2: Real-time (1 hafta)
- [ ] **WebSocket / SSE** — timeline ve KPI feed'leri için
- [ ] **Agent state polling/push** — Orbit ekranı 4 saniyede bir güncellensin
- [ ] **Token usage tracking** — gerçek API çağrılarından sayım

### Faz 3: Integration (2-3 hafta)
- [ ] **GitHub:** PR webhook'ları → task state geçişleri
- [ ] **Vercel:** Deploy webhook'ları → workflow advance
- [ ] **Stripe:** Test mode → backend-developer'a görev
- [ ] **Slack:** Daily report'lar Slack'e push
- [ ] **Linear (opsiyonel):** Bidirectional task sync

### Faz 4: AI orkestrasyon (en kritik)
- [ ] **Anthropic SDK entegrasyonu** — her ajan kendi sistem prompt'u + model
- [ ] **Prompt caching** — token tasarrufu için (CLAUDE.md API skill'i)
- [ ] **Multi-agent dispatch** — operation-manager → diğerlerine
- [ ] **Handover mekanizması** — agent A bitirir, B alır (state transfer)
- [ ] **Party Mode** — gerçek multi-turn multi-agent dialog
- [ ] **ADR yazımı** — Party session sonunda otomatik

### Faz 5: Polish & launch
- [ ] **Onboarding wizard** — Setup ekranı gerçekten proje init etsin
- [ ] **Error handling** — bağlantı kesilirse retry, blocked state
- [ ] **Audit log persistence** — tüm event'ler `workspace/audit.log`'a
- [ ] **Permission system** — her ajanın sadece kendi yetki alanı
- [ ] **Beta rollout** — 3-5 kullanıcıya test

---

## Bir sonraki Claude session'ı için öneriler

Eğer yeni bir session'da bu projeye dönersek, kullanıcı muhtemelen şunları isteyebilir:

### Senaryo A: "Bir ekrana daha özellik ekleyelim"
1. `DESIGN.md` → ilgili ekrana bak
2. `kortext-ui-mockup-v2.html` aç → Cmd+F ile section bul
3. Mevcut pattern'lara uy (renk, tipografi, layout)
4. **DOM yazma kuralı:** projedeki `renderHTML()` helper'ını kullan (TECH.md § 4)
5. Yeni JS fonksiyon ekle → `showScreen` içine re-render çağrısı ekle

### Senaryo B: "Şu ekran çirkin, yenisini yapalım"
1. `DECISIONS.md` → bu ekran daha önce neye karar verildi
2. **Eski iterasyonlara dönme** — DECISIONS'ta neden reddedildiklerini oku
3. Yeni paradigma denerken kullanıcıya **mockup vs final** ayrımını sor
4. Eğer büyük redesign ise: HTML'i `/tmp/screen_name_vN.html`'e yaz, sonra splice et
5. Screenshot al, kullanıcıya göster, "bu mu?" sor

### Senaryo C: "Backend'e bağlayalım"
1. `TECH.md` § 11 "Backend ile bağlanma noktaları"
2. Önce bir endpoint için end-to-end yap (Inbox approve önerilir — basit)
3. Mockup → real data path:
   - `DIVE_DATA` const'u → `fetch('/api/agents/' + id)`
   - `EPIC_DATA` const'u → `fetch('/api/epics')`
4. Backend stack önerisi: Hono + SQLite + Zod (Eray non-coder, basit kalsın)

### Senaryo D: "Yeni bir framework özelliği ekleyelim"
1. Kortext framework yapısı: `agents/`, `hooks/`, `rules/`, `workflows/`
2. UI tarafında: hangi ekrana yansıyacak? Yeni ekran mı, mevcut mu?
3. Sample data güncelle (yeni özellik için Acme CRM'de varsayımsal use case)
4. UI değişiklik yap → DECISIONS.md'ye ekle (gelecek için)

---

## Bu dokümantasyonu güncel tutma

Eğer mockup'ı değiştirirsen:

1. **Yeni karar:** `DECISIONS.md`'ye yeni section ekle (örn. "17. Yeni özellik X kararı")
2. **Yeni component:** `DESIGN.md` § 4'e ekle
3. **Yeni JS fonksiyon:** `TECH.md` § 6'ya ekle
4. **HTML kopyasını senkronize et:** `cp kortext-ui-mockup-v2.html app-design/`
5. **Bu dosyayı (NEXT-STEPS.md) güncelle:** yapılan iş "Hemen yapılabilir"den "Mevcut durum"a taşınır

---

## Açık sorular (sonraki session'da Eray'a sorulacaklar)

- **Veri saklama:** Workspace state JSON dosyalarda mı, SQLite'ta mı?
- **Auth:** Kortext'i kim kullanacak? Tek kullanıcı mı, ekip mi?
- **Hosting:** Self-hosted (Eray'ın bilgisayarı) mı, cloud (SaaS) mı?
- **Lisans:** Kortext açık kaynak mı olacak?
- **Fiyatlandırma:** Eğer ürün olarak satılacaksa — model maliyetlerini kullanıcı mı karşılayacak (BYOK), Kortext mi?
- **Türkçe UI:** Settings'te dil seçimi var — gerçekten implementasyon yapılacak mı yoksa İngilizce mi kalacak?

---

## Memory hatırlatması

`/Users/erayendes/.claude/projects/-Users-erayendes-Documents--docbase-kortext/memory/MEMORY.md` içinde:
```
- Eray kod bilmiyor
- Kortext: AI ajanların minimum insan müdahalesiyle iş yürütmesi için
```

Bu kalıcı bilgi — yeni session'da otomatik yüklenir. Eğer Kortext UI'ı genişletirken Eray'ın role değişirse (örn. "Eray artık biraz kod biliyor"), bu memory'i güncelle.
