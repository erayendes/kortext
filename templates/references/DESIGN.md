---
status: uninitialized
author: +designer
reviewer: +frontend-developer
approver: +prime
---

# Design System (Strict & Tokenized Specification)

## Core Tokens (Atomic Values)

> [!WARNING] **FE KURALI:**
> Kod içerisinde ham değer (HEX, px, rem) kullanımı yasaktır. Sadece aşağıdaki değişken isimleri kullanılacaktır.

### Color Palette & Functional Mapping

| Token Name | HEX / RGB | Usage Context |
| :--- | :--- | :--- |
| `--color-bg-main` | `[VALUE]` | Sayfa ana arka planı |
| `--color-bg-surface` | `[VALUE]` | Kartlar, modallar, section'lar |
| `--color-text-base` | `[VALUE]` | Standart metin içeriği |
| `--color-text-muted` | `[VALUE]` | Placeholder, yardımcı metinler |
| `--color-primary` | `[VALUE]` | Ana butonlar, aktif linkler |
| `--color-primary-hover` | `[VALUE]` | Hover durumu (Zorunlu) |
| `--color-border` | `[VALUE]` | Ayırıcı çizgiler ve input border |
| `--color-success` | `[VALUE]` | Başarı mesajları ve ikonları |
| `--color-error` | `[VALUE]` | Hata mesajları ve input hata durumu |

### Spacing Scale (8px Grid Rule)

> [!WARNING] **FE KURALI:**
> Margin ve Padding değerleri sadece bu skaladan seçilebilir. Ara değer (13px, 7px vb.) kullanımı yasaktır.

- `--space-unit`: `8px`
- `--space-xs`: `4px`  (0.5x)
- `--space-sm`: `8px`  (1x)
- `--space-md`: `16px` (2x)
- `--space-lg`: `24px` (3x)
- `--space-xl`: `32px` (4x)
- `--space-2xl`: `48px` (6x)

---

## Typography (The Vertical Rhythm)

> [!WARNING] **FE KURALI:**
> Font-size tek başına yeterli değildir. Line-height ve Weight değerleri her rol için sabittir.

| Role | Font-Family | Size (px) | Line-Height | Weight | Letter-Spacing |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `H1` | `[Family]` | `40px` | `1.2` | `700` | `-0.02em` |
| `H2` | `[Family]` | `32px` | `1.2` | `600` | `-0.01em` |
| `Body` | `[Family]` | `16px` | `1.5` | `400` | `normal` |
| `Small` | `[Family]` | `12px` | `1.4` | `400` | `0.01em` |
| `Label` | `[Family]` | `14px` | `1` | `500` | `0.02em` |

---

## Layout & Grid (Structural Constraints)

| Property | Value | Description |
| :--- | :--- | :--- |
| `--container-max` | `1200px` | İçeriğin merkezleneceği maksimum genişlik |
| `--gutter` | `24px` | Sütunlar arası boşluk |
| `--screen-sm` | `640px` | Mobile breakpoint |
| `--screen-md` | `768px` | Tablet breakpoint |
| `--screen-lg` | `1024px` | Desktop breakpoint |
| `--safe-area` | `16px` | Mobil cihazlar için minimum kenar boşluğu |

---

## UI Components (Strict Atoms)

### Buttons

- **Border-Radius:** `--radius-btn`: `[px]`
- **Heights:** `Small: 32px`, `Default: 44px`, `Large: 56px`
- **States (Zorunlu):**
  - *Focus:* `outline: 2px solid --color-primary`, `offset: 2px`
  - *Active:* `transform: scale(0.98)`
  - *Disabled:* `opacity: 0.5`, `cursor: not-allowed`

### Inputs

- **Border:** `1px solid --color-border`
- **Focus State:** `border-color: --color-primary`, `box-shadow: [Value]`
- **Border-Radius:** `--radius-input`: `[px]`

### Effects & Elevation

- `--shadow-sm`: `[CSS Box Shadow Value]`
- `--shadow-md`: `[CSS Box Shadow Value]`
- `--transition-base`: `all 0.2s ease-in-out`

---

## Technical Implementation Directives (Red Lines)

1. **No Magic Numbers:** Tasarımda tanımlı olmayan her değer reddedilecektir.
2. **Icon Mapping:** Sadece `[İkon Seti Adı]` kütüphanesi kullanılacaktır. İkon boyutları `16/24/32px` dışında olamaz.
3. **Variable Injection:** Designer bu dosyayı onayladığında, +frontend-developer tüm değerleri `CSS Variables` veya `Tailwind Config` dosyasına aktaracaktır.
4. **Consistency:** Tüm "shadow", "blur" ve "transition" değerleri bu dosyada belirtilen CSS kodları dışında yazılamaz.
5. **Zero Tolerance for Hardcoding:** CSS dosyalarında HEX kodu tespiti kritik hata (Blocker) sayılacaktır.
