---
status: uninitialized
author: +designer
approver: +prime
---

# Design System (Strict & Tokenized Specification)

## Core Tokens (Atomic Values)

> [!WARNING] **FE RULE:**
> Raw values (HEX, px, rem) are forbidden in code. Only the variable names below may be used.

### Color Palette & Functional Mapping

| Token Name | HEX / RGB | Usage Context |
| :--- | :--- | :--- |
| `--color-bg-main` | `[VALUE]` | Main page background |
| `--color-bg-surface` | `[VALUE]` | Cards, modals, sections |
| `--color-text-base` | `[VALUE]` | Standard text content |
| `--color-text-muted` | `[VALUE]` | Placeholders, helper text |
| `--color-primary` | `[VALUE]` | Primary buttons, active links |
| `--color-primary-hover` | `[VALUE]` | Hover state (required) |
| `--color-border` | `[VALUE]` | Divider lines and input borders |
| `--color-success` | `[VALUE]` | Success messages and icons |
| `--color-error` | `[VALUE]` | Error messages and input error states |

### Spacing Scale (8px Grid Rule)

> [!WARNING] **FE RULE:**
> Margin and padding values may only be picked from this scale. In-between values (13px, 7px, etc.) are forbidden.

- `--space-unit`: `8px`
- `--space-xs`: `4px`  (0.5x)
- `--space-sm`: `8px`  (1x)
- `--space-md`: `16px` (2x)
- `--space-lg`: `24px` (3x)
- `--space-xl`: `32px` (4x)
- `--space-2xl`: `48px` (6x)

---

## Typography (The Vertical Rhythm)

> [!WARNING] **FE RULE:**
> Font-size alone is not enough. Line-height and weight are fixed for each role.

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
| `--container-max` | `1200px` | Maximum width the content is centered within |
| `--gutter` | `24px` | Gap between columns |
| `--screen-sm` | `640px` | Mobile breakpoint |
| `--screen-md` | `768px` | Tablet breakpoint |
| `--screen-lg` | `1024px` | Desktop breakpoint |
| `--safe-area` | `16px` | Minimum edge margin on mobile devices |

---

## Surfaces & Components

> Two documents read this section by name: `CONTENT.md` writes copy into the components,
> `GROWTH.md` measures the surfaces. Name them concretely — an unnamed screen gets no copy
> and no event.

| Surface (screen) | Purpose | Main components |
| --- | --- | --- |
| `[Sign in]` | [what the user does here] | [Input, Button, ErrorText] |

| Component | Purpose | Copy slots it carries |
| --- | --- | --- |
| `[EmptyState]` | [when it is shown] | [title, body, action label] |

## UI Components (Strict Atoms)

### Buttons

- **Border-Radius:** `--radius-btn`: `[px]`
- **Heights:** `Small: 32px`, `Default: 44px`, `Large: 56px`
- **States (required):**
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

1. **No Magic Numbers:** Any value not defined in the design will be rejected.
2. **Icon Mapping:** Only the `[Icon Set Name]` library may be used. Icon sizes must be one of `16/24/32px`.
3. **Variable Injection:** Once the designer approves this file, +frontend-developer transfers all values into the `CSS Variables` or `Tailwind Config` file.
4. **Consistency:** All "shadow", "blur" and "transition" values must use the CSS defined in this file — no ad-hoc variants.
5. **Zero Tolerance for Hardcoding:** A HEX code found in CSS files counts as a critical error (Blocker).

## Revision Requests

- [`TARGET.md` — what must change there and why. One line per document. Leave this section empty when nothing upstream needs to change]

## Open Questions for prime

- [Anything prime must answer before this document can be relied on — leave this section empty when there is nothing]
