# Kortext v3 — Renk Paleti (Vibrant Purple + Enterprise)

> **Karar tarihi:** 2026-05-21
> **Önceki palet:** Neural indigo `#6366F1` + cyan signal — DECISIONS.md § 2
> **Yeni yön:** Vibrant purple/magenta/pink + professional/enterprise karakter
> **Referans estetik:** Linear, Stripe Dashboard, Notion — vibrant ama disiplinli, oyuncak değil

---

## 1. Felsefe

| Boyut | Karar |
|---|---|
| **Vibrant** | Accent renkler doygun ve göz çekici — purple-500, pink-500, magenta |
| **Enterprise** | Layout disiplinli, glow minimal, animasyon az, hiyerarşi net |
| **Dark** | Default tema koyu — purple-tinted black background |
| **+prime özel** | Amber **kalır** (cortex/sun metaforu, semantic warning ile aynı renk) |

> **Anahtar prensip:** Renk vibrant olur ama _kullanımı_ disiplinli. Her ekranda 1-2 primary accent + semantic renkler. "Karnaval" değil, "control panel".

---

## 2. Background Katmanları (Purple-Tinted Black)

```css
--bg-0:   #0A0814   /* deepest — main canvas, deep violet-black */
--bg-1:   #14101F   /* panels, sidebar */
--bg-2:   #1E1830   /* cards, elevated surfaces */
--bg-3:   #2A2240   /* hover states */
--bg-overlay: rgba(10, 8, 20, 0.75)  /* modal backdrop */
```

Saf siyah değil — çok hafif purple tint var. Karşılaştırma:
- Eski: `#0A0A0B` (neutral black)
- Yeni: `#0A0814` (subtle purple bias)

Bu, accent renklerin "ortama oturmasını" sağlar.

---

## 3. Text Hiyerarşisi

```css
--tx-1:        #FAFAFC   /* headlines, primary content */
--tx-2:        #B5B0C2   /* body, labels — slight purple bias */
--tx-3:        #6B6577   /* captions, muted */
--tx-disabled: #3F3B4F
```

---

## 4. Accent (Primary Brand)

### 4.1 Purple — primary action, brand identity
```css
--accent:        #A855F7   /* purple-500, vibrant */
--accent-soft:   #C084FC   /* purple-400, hover */
--accent-deep:   #7C3AED   /* violet-600, pressed/active */
--accent-glow:   rgba(168, 85, 247, 0.25)
```

### 4.2 Magenta/Pink — signal, live data, secondary accent
```css
--signal:        #EC4899   /* pink-500, live data, pulse */
--signal-soft:   #F472B6   /* pink-400 */
--signal-glow:   rgba(236, 72, 153, 0.20)
```

**Kullanım kuralı:**
- Purple = navigation, primary CTAs, brand elements, completed-positive
- Pink = live indicators, active data flow, "şu an oluyor" işaretler
- İkisi aynı element üstünde **kullanılmaz** — birinden biri tercih edilir

---

## 5. Semantic Renkler (Değişmedi)

```css
--success:  #10B981   /* working green */
--warning:  #F59E0B   /* +prime amber, blocked-soft */
--danger:   #EF4444   /* critical, failed */
--info:     #3B82F6   /* blue, neutral info */
```

> `--warning` aynı kaldı çünkü **+prime amber** kararı korunuyor (cortex/sun metaforu).

---

## 6. Backlog State Badges (Güncellenmiş)

| State | Background | Text | Border |
|---|---|---|---|
| **Epic** | `rgba(168, 85, 247, .15)` | `#C084FC` | `rgba(168, 85, 247, .30)` |
| **To Do** | `#2A2240` | `#B5B0C2` neutral | `rgba(255,255,255,.06)` |
| **In Progress** | `rgba(236, 72, 153, .14)` | `#F472B6` pink | `rgba(236, 72, 153, .25)` |
| **Test** | `rgba(59, 130, 246, .14)` | `#60A5FA` info-blue | `rgba(59, 130, 246, .25)` |
| **Review** | `rgba(245, 158, 11, .14)` | `#FBBF24` amber | `rgba(245, 158, 11, .25)` |
| **Done** | `rgba(16, 185, 129, .14)` | `#34D399` green | `rgba(16, 185, 129, .25)` |
| **Blocked** | `rgba(239, 68, 68, .14)` | `#F87171` red | `rgba(239, 68, 68, .25)` |

> "In Progress" rengi indigo'dan pink'e geçti — yeni "live signal" rolüne uygun.

---

## 7. Borders & Glows

```css
--border-subtle:   rgba(255, 255, 255, 0.05)
--border-default:  rgba(255, 255, 255, 0.10)
--border-accent:   rgba(168, 85, 247, 0.30)
--border-strong:   rgba(255, 255, 255, 0.18)

--glow-accent:     0 0 24px rgba(168, 85, 247, 0.20)
--glow-signal:     0 0 16px rgba(236, 72, 153, 0.18)
--glow-success:    0 0 12px rgba(16, 185, 129, 0.15)
```

**Disiplin kuralı:** Glow hover'da var, default'ta yok. "Sürekli ışıltı" hissinden kaçınmalıyız (cyberpunk değil enterprise).

---

## 8. Persona Renkleri (Güncellenmiş)

| Persona | Eski renk | Yeni renk | Mantık |
|---|---|---|---|
| operation-manager | `#06B6D4` cyan | `#A855F7` purple | Yeni primary accent — orchestrator brand'i taşır |
| product-manager | `#3B82F6` blue | `#3B82F6` blue | Korunur |
| engineering-manager | `#8B5CF6` purple | `#7C3AED` violet-deep | Purple ailesinin "manager" tonu |
| delivery-manager | `#F97316` orange | `#F97316` orange | Korunur |
| backend-developer | `#6366F1` indigo | `#6366F1` indigo | Korunur — purple ailesine yakın |
| frontend-developer | `#EC4899` pink | `#EC4899` pink | Korunur — yeni signal rengi ile uyumlu |
| designer | `#10B981` emerald | `#10B981` emerald | Korunur |
| qa-engineer | `#EAB308` yellow | `#EAB308` yellow | Korunur |
| db-admin | `#14B8A6` teal | `#14B8A6` teal | Korunur |
| devops-engineer | `#EF4444` red | `#EF4444` red | Korunur |
| security-engineer | `#EF4444` red | `#DC2626` red-deep | devops'tan ayrışsın diye tonu derinleştirildi |
| copywriter | `#84CC16` lime | `#84CC16` lime | Korunur |
| compliance-expert | `#22D3EE` sky | `#22D3EE` sky | Korunur |
| growth-expert | `#F43F5E` rose | `#F43F5E` rose | Korunur |

> 14 persona ailesinde **purple, pink, indigo** baskın — yeni paletin kalbi orada. Diğer renkler "specialist çeşitliliği".

---

## 9. Kullanım Kuralları (Enterprise Disiplini)

### 9.1 Her ekranda en fazla
- **1 primary accent** (purple) — navigation, CTA
- **1 secondary accent** (pink) — live signal, "şu an"
- **1-2 semantic** — duruma göre (success/warning/danger)
- Geri kalanı **neutral + text hiyerarşisi**

### 9.2 Sakınılacaklar
- Gradient backgroundlar (sadece +prime hero card ve özel rozetlerde)
- Sürekli glow (sadece hover)
- "Rainbow" panel (3+ renk yan yana parlak)
- Animasyonlu accent border (sadece live data için micro-pulse)

### 9.3 Mission Control Hissini Koruyacak Şeyler
- Dark background
- Live data indicator (pink pulse)
- Status dot animasyonları (subtle)
- Mono font (JetBrains Mono) ID'ler ve timestamp'ler için
- Dot grid background (özel ekranlarda — Orbit)

---

## 10. Karşılaştırma — Eski vs Yeni

| Boyut | Eski (v2 indigo+cyan) | Yeni (v3 purple+pink) |
|---|---|---|
| **Karakter** | Cool / intelligent | Vibrant / professional |
| **Reference brand** | Anthropic, Linear pre-purple | Linear, Stripe Dashboard, Notion |
| **Background bias** | Neutral black | Purple-tinted black |
| **Primary accent** | Indigo `#6366F1` | Purple `#A855F7` |
| **Live signal** | Cyan `#06B6D4` | Pink `#EC4899` |
| **Persona rangelin baskın ailesi** | İndigo + cyan + yedişer çeşit | Purple + pink + indigo + çeşit |

---

## 11. Sıradaki Adımlar

1. Bu paleti `kortext-ui-mockup-v2.html`'in CSS variable'larında değiştir → görsel doğrulama
2. Ekran-bazlı feedback al (Eray + browser preview)
3. Faz 6'da React'e port ederken Tailwind config'e bu paleti yaz:
   ```ts
   // tailwind.config.ts
   colors: {
     accent: { 500: '#A855F7', 400: '#C084FC', 600: '#7C3AED' },
     signal: { 500: '#EC4899', 400: '#F472B6' },
     // ...
   }
   ```
