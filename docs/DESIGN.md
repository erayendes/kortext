# kortext — Design System (`DESIGN.md`)

> **How to use this file:** Give it to an AI together with the request you want built.
> Everything below is the *complete, authoritative* spec for the kortext interface — tokens,
> type, color, components, vocabulary and rules. Reproduce it **exactly**. Do not invent
> colors, fonts, spacings or component variants that aren't listed here. When in doubt, use a
> token (`var(--…)`) rather than a literal value.

---

## 0. What kortext is (so you design in the right spirit)

kortext is a **command surface for one human** — `+prime` — directing an army of AI agents that
operate like a full software house. A dozen agents work in parallel, so the UI must stay **calm,
dense, and quiet**. The aesthetic is **Vercel/Geist-grade restraint**:

- Near-monochrome **cool-neutral** palette. White-first (light mode is the default).
- Color is **signal only** — agent identity dots and a tight set of status flavours. Never decoration.
- One accent that earns its place (neutral black by default).
- A strict typographic split: **Barlow** for the product, **Overpass Mono** for everything the
  machine speaks (agent handles, timestamps, IDs, file paths, terminals, metrics).
- 8-pt rhythm, functional motion only (130ms ease; a single slow pulse for "live").

**Anti-goals:** no gradients, no emoji, no decorative SVG illustration, no rounded-corner-with-left-accent-border cards, no Inter/Roboto. Less is more — every element must earn its place.

---

## 1. Setup — fonts & root attributes

Load fonts (Google Fonts):

```html
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Barlow:wght@300;400;500;600;700&family=Overpass+Mono:wght@400;500;600;700&display=swap">
```

The system is **themeable via data-attributes on `<html>`**. Defaults:

```html
<html data-theme="light" data-accent="neutral" data-density="comfortable" data-radius="default">
```

| Attribute | Values | Default | Effect |
|---|---|---|---|
| `data-theme` | `light` · `dark` | `light` | Color scheme |
| `data-accent` | `neutral` · `indigo` · `blue` · `green` | `neutral` | Single accent hue |
| `data-density` | `compact` · `comfortable` | `comfortable` | Scales control heights/padding (`--d-scale` 1 → 1.2) |
| `data-radius` | `sharp` · `default` · `round` | `default` | Scales all radii (`--r-scale` 0.4 / 1 / 1.6) |

Every component reads these tokens, so changing one attribute retunes the whole system live.
**Always build components from the tokens below — never hard-code a color/size that a token covers.**

---

## 2. Design tokens (`:root`)

### 2.1 Neutral ramp (cool-neutral, Geist-like)

```css
--gray-50:  #fafafa;   --gray-100: #f5f5f6;   --gray-150: #efeff1;
--gray-200: #e9e9ec;   --gray-300: #e0e0e4;   --gray-400: #c6c6cc;
--gray-500: #9a9aa3;   --gray-600: #71717a;   --gray-700: #52525b;
--gray-800: #2a2a30;   --gray-900: #18181b;   --gray-950: #0b0b0d;
```

### 2.2 Semantic surfaces & borders (light)

```css
--bg:          #ffffff;   /* base canvas */
--bg-subtle:   #fbfbfc;   /* page background, sidebars */
--bg-muted:    #f5f5f6;   /* badges, inset fills */
--bg-inset:    #f7f7f8;
--bg-hover:    #f2f2f4;   /* row/nav hover */
--bg-active:   #ececef;   /* selected row, progress track */
--border:      #eaeaec;   /* default hairline */
--border-strong:#dcdce0;  /* inputs, secondary buttons */
--border-faint:#f0f0f2;   /* internal dividers */
```

### 2.3 Text (light)

```css
--fg:           #18181b;   /* primary */
--fg-secondary: #51515a;   /* body secondary */
--fg-muted:     #76767f;   /* metadata */
--fg-faint:     #a3a3ad;   /* labels, placeholders */
```

### 2.4 Accent (default = neutral / Vercel black)

```css
--accent:#18181b; --accent-hover:#000000; --accent-fg:#ffffff;
--accent-tint:#f4f4f5; --accent-tint-border:#e2e2e6; --accent-ring:rgba(24,24,27,0.16);
```

Accent variants (swap by `data-accent`):

```css
[data-accent="indigo"] { --accent:#5b5bd6; --accent-hover:#4d4dc8; --accent-fg:#fff;
  --accent-tint:#efeffb; --accent-tint-border:#dcdcf5; --accent-ring:rgba(91,91,214,0.22); }
[data-accent="blue"]   { --accent:#2563eb; --accent-hover:#1d56d6; --accent-fg:#fff;
  --accent-tint:#eaf1fe; --accent-tint-border:#cfe0fb; --accent-ring:rgba(37,99,235,0.22); }
[data-accent="green"]  { --accent:#11875a; --accent-hover:#0d7350; --accent-fg:#fff;
  --accent-tint:#e7f5ee; --accent-tint-border:#cce9da; --accent-ring:rgba(17,135,90,0.22); }
```

### 2.5 Status flavours (light) — the ONLY non-neutral UI colors

Each flavour has a foreground, a tint background, and a tint border. **Never introduce a status color outside this set.**

```css
--green:#157a52;  --green-bg:#eaf5ef;  --green-border:#cfe9dd;   /* success / passed / approved / done */
--amber:#9a6a16;  --amber-bg:#faf2e2;  --amber-border:#ecdcb8;   /* warning / queued / in-progress / debt */
--red:#c5392f;    --red-bg:#fbeceb;    --red-border:#f1cfcc;     /* error / blocked / failed / bug */
--blue:#2563c9;   --blue-bg:#eaf1fc;   --blue-border:#cfe0f6;    /* info / pending / test / task */
--violet:#5b4bcc; --violet-bg:#efedfb; --violet-border:#dad5f4;  /* review / epic */
```

### 2.6 Agent identity hues — dots & avatars ONLY (never fills/text)

Equal lightness & chroma, varied hue (oklch). Used for the 16 agent personas' identity dots & square avatars. **Never use these as text or surface fills.**

```css
--a-red:    oklch(0.64 0.16 25);    --a-orange: oklch(0.66 0.15 55);
--a-amber:  oklch(0.70 0.13 85);    --a-green:  oklch(0.66 0.14 150);
--a-teal:   oklch(0.66 0.11 190);   --a-cyan:   oklch(0.68 0.11 220);
--a-blue:   oklch(0.62 0.15 255);   --a-indigo: oklch(0.58 0.16 280);
--a-purple: oklch(0.60 0.16 310);   --a-pink:   oklch(0.66 0.16 350);
```

### 2.7 Radius (scaled by `--r-scale`)

```css
--r-scale: 1;                              /* sharp=0.4, round=1.6 */
--r-sm: calc(4px * var(--r-scale));        /* badges-square, checks, kbd, small btn */
--r-md: calc(6px * var(--r-scale));        /* buttons, inputs, nav items, rows */
--r-lg: calc(9px * var(--r-scale));        /* cards, panels, popovers */
--r-xl: calc(13px * var(--r-scale));       /* large surfaces */
--r-pill: 999px;                            /* pills, badges, dots, toggles */
```

### 2.8 Density (scaled by `--d-scale`)

```css
--d-scale: 1;                  /* comfortable = 1.2 */
--row-h: calc(30px * var(--d-scale));
--control-h: calc(30px * var(--d-scale));
--control-h-sm: calc(24px * var(--d-scale));
--pad-x: calc(10px * var(--d-scale));
--gap: calc(8px * var(--d-scale));
```

### 2.9 Type tokens

```css
--font-sans: 'Barlow', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif;
--font-mono: 'Overpass Mono', ui-monospace, 'SF Mono', Menlo, monospace;
--fs-11:11px; --fs-12:12px; --fs-13:13px; --fs-14:14px; --fs-16:16px;
--fs-18:18px; --fs-20:20px; --fs-24:24px; --fs-30:30px; --fs-40:40px;
```

Base body: `font-family: var(--font-sans); font-size: 13px; line-height: 1.5; color: var(--fg);`
Enable figures/features: `font-feature-settings: "cv01","ss01","tnum";` — tabular numerals everywhere.

### 2.10 Shadow & motion

```css
--shadow-xs: 0 1px 1px rgba(24,24,27,0.04);
--shadow-sm: 0 1px 2px rgba(24,24,27,0.06), 0 1px 1px rgba(24,24,27,0.04);
--shadow-md: 0 4px 12px rgba(24,24,27,0.08), 0 1px 2px rgba(24,24,27,0.05);
--shadow-lg: 0 12px 32px rgba(24,24,27,0.12), 0 2px 6px rgba(24,24,27,0.06);
--shadow-pop: 0 8px 28px rgba(24,24,27,0.14), 0 1px 2px rgba(24,24,27,0.08);
--speed: 130ms;
--ease: cubic-bezier(0.2, 0, 0, 1);
```

---

## 3. Dark theme

Set `data-theme="dark"`. Overrides (use these exact values):

```css
[data-theme="dark"] {
  --gray-50:#161618; --gray-100:#1a1a1d; --gray-150:#1e1e21; --gray-200:#232327;
  --gray-300:#2c2c31; --gray-400:#3a3a40; --gray-500:#5b5b63; --gray-600:#8a8a93;
  --gray-700:#a7a7b0; --gray-800:#cdcdd3; --gray-900:#ededef; --gray-950:#050506;

  --bg:#0a0a0b; --bg-subtle:#0e0e10; --bg-muted:#161618; --bg-inset:#121214;
  --bg-hover:#1a1a1d; --bg-active:#212126;
  --border:#222226; --border-strong:#2e2e34; --border-faint:#18181b;

  --fg:#ededef; --fg-secondary:#9c9ca5; --fg-muted:#6e6e77; --fg-faint:#54545c;

  /* neutral accent in dark = near-white pill (Vercel dark) */
  --accent:#ededef; --accent-hover:#ffffff; --accent-fg:#0a0a0b;
  --accent-tint:#1c1c20; --accent-tint-border:#2a2a30; --accent-ring:rgba(237,237,239,0.16);

  --green:#46c08a; --green-bg:#10231b; --green-border:#1d3b2e;
  --amber:#d3a55e; --amber-bg:#241c0e; --amber-border:#3a2e16;
  --red:#e0726a;   --red-bg:#26120f;   --red-border:#3d201c;
  --blue:#5e9bf0;  --blue-bg:#0f1c30;  --blue-border:#1c3252;
  --violet:#8b7df0;--violet-bg:#171530;--violet-border:#272350;

  --shadow-xs:0 1px 1px rgba(0,0,0,0.4);
  --shadow-sm:0 1px 2px rgba(0,0,0,0.5);
  --shadow-md:0 6px 16px rgba(0,0,0,0.55);
  --shadow-lg:0 14px 36px rgba(0,0,0,0.6);
  --shadow-pop:0 10px 30px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.04);
}
[data-theme="dark"][data-accent="indigo"] { --accent:#6d6df0; --accent-hover:#7e7ef5; --accent-fg:#fff; --accent-tint:#1a1a3a; --accent-tint-border:#2a2a55; --accent-ring:rgba(109,109,240,0.3); }
[data-theme="dark"][data-accent="blue"]   { --accent:#3b82f6; --accent-hover:#4f8ff7; --accent-fg:#fff; --accent-tint:#10243f; --accent-tint-border:#1d3a5e; --accent-ring:rgba(59,130,246,0.3); }
[data-theme="dark"][data-accent="green"]  { --accent:#22a06b; --accent-hover:#28b277; --accent-fg:#fff; --accent-tint:#0f2a1e; --accent-tint-border:#1c4231; --accent-ring:rgba(34,160,107,0.3); }
```

The agent identity hues (`--a-*`) stay identical across themes.

---

## 4. Typography — duties

**Two families, sharp separation of duties.** Barlow carries the product; Overpass Mono carries
machine speech and numerics. Tight letter-spacing on display sizes, generous line-height on copy.

### Barlow (product)

| Role | Size / weight | Notes |
|---|---|---|
| Display | 30px · 600 | `letter-spacing:-0.02em` |
| Title | 20px · 600 | `letter-spacing:-0.01em` |
| Heading | 16px · 600 | |
| Body | 13px · 450 | line-height 1.5 |
| Small | 12px · 500 | |
| Micro / label (`.eyebrow`) | 11px · 600 | `letter-spacing:0.06em; text-transform:uppercase; color:var(--fg-faint)` |

### Overpass Mono (machine) — use `.mono` / `var(--font-mono)`

Always mono for: agent handles (`+backend-developer`), timestamps (`12:38 · 2m 03s`),
IDs (`TR-E01`, `NOT-T01`), file paths (`references/PRD.md`), terminal output, metrics (`12%`),
counts (`5/9`), keyboard keys. Always tabular figures (`font-feature-settings:"tnum"`).

---

## 5. Components

All components live in **one stylesheet** (`styles/kortext.css`) shared by the product. Reproduce the class API exactly. Below are the canonical specs — copy the CSS verbatim into your build.

### 5.1 Buttons — `.btn`

One primary per view. Primary = accent fill; secondary = bordered surface; ghost disappears until hover.

```css
.btn { display:inline-flex; align-items:center; justify-content:center; gap:6px;
  height:var(--control-h); padding:0 calc(11px*var(--d-scale));
  font-size:var(--fs-13); font-weight:500; line-height:1;
  border-radius:var(--r-md); border:1px solid transparent;
  background:var(--bg); color:var(--fg); cursor:pointer; white-space:nowrap; user-select:none;
  transition:background var(--speed) var(--ease), border-color var(--speed) var(--ease), box-shadow var(--speed) var(--ease), color var(--speed) var(--ease); }
.btn:focus-visible { outline:none; box-shadow:0 0 0 3px var(--accent-ring); }
.btn .ic { width:14px; height:14px; flex:none; }

.btn-primary   { background:var(--accent); color:var(--accent-fg); border-color:var(--accent); }
.btn-primary:hover { background:var(--accent-hover); border-color:var(--accent-hover); }
.btn-secondary { background:var(--bg); color:var(--fg); border-color:var(--border-strong); box-shadow:var(--shadow-xs); }
.btn-secondary:hover { background:var(--bg-muted); border-color:var(--gray-400); }
.btn-ghost     { background:transparent; color:var(--fg-secondary); }
.btn-ghost:hover { background:var(--bg-hover); color:var(--fg); }
.btn-danger    { background:var(--bg); color:var(--red); border-color:var(--red-border); }
.btn-danger:hover { background:var(--red-bg); }
.btn-success   { background:var(--green-bg); color:var(--green); border-color:var(--green-border); }   /* "Approved" confirmed state */

.btn-sm   { height:var(--control-h-sm); padding:0 calc(8px*var(--d-scale)); font-size:var(--fs-12); border-radius:var(--r-sm); }
.btn-icon { width:var(--control-h); padding:0; }   /* square; +.btn-sm → width:var(--control-h-sm) */
.btn[disabled] { opacity:0.45; pointer-events:none; }
```

Leading icon: `<button class="btn btn-secondary"><i class="ic">…</i> New item</button>`.

### 5.2 Badges & pills — `.badge`

```css
.badge { display:inline-flex; align-items:center; gap:5px; height:20px; padding:0 8px;
  font-size:var(--fs-12); font-weight:500; line-height:1; border-radius:var(--r-pill);
  border:1px solid var(--border); background:var(--bg-muted); color:var(--fg-secondary); white-space:nowrap; }
.badge .dot { width:6px; height:6px; border-radius:999px; background:var(--fg-muted); flex:none; }
.badge-square { border-radius:var(--r-sm); }            /* IDs / versions */
.badge-solid  { background:var(--accent); color:var(--accent-fg); border-color:var(--accent); }
.badge-count  { min-width:18px; height:18px; padding:0 5px; justify-content:center;
  font-family:var(--font-mono); font-size:var(--fs-11); font-weight:500;
  background:var(--bg-active); color:var(--fg-secondary); border-color:transparent; }
```

**Status flavour classes** (apply to `.badge`, `.kc-type`, `.st-pill`, `.banner`):

```css
.s-green{color:var(--green);background:var(--green-bg);border-color:var(--green-border);}
.s-amber{color:var(--amber);background:var(--amber-bg);border-color:var(--amber-border);}
.s-red{color:var(--red);background:var(--red-bg);border-color:var(--red-border);}
.s-blue{color:var(--blue);background:var(--blue-bg);border-color:var(--blue-border);}
.s-violet{color:var(--violet);background:var(--violet-bg);border-color:var(--violet-border);}
.s-neutral{color:var(--fg-secondary);background:var(--bg-muted);border-color:var(--border);}
.s-green .dot{background:var(--green);} .s-amber .dot{background:var(--amber);}
.s-red .dot{background:var(--red);}     .s-blue .dot{background:var(--blue);}
.s-violet .dot{background:var(--violet);}
```

**Live pulse** (use on the dot inside an "active" badge):

```css
.dot-live{position:relative;}
.dot-live::after{content:"";position:absolute;inset:-3px;border-radius:999px;
  border:1px solid currentColor;opacity:0.5;animation:kx-pulse 1.8s var(--ease) infinite;}
@keyframes kx-pulse{0%{transform:scale(0.6);opacity:0.6}100%{transform:scale(1.7);opacity:0}}
```

### 5.3 Agent token — `.agent` (three forms)

Always monospace, with a colored identity dot. Three forms: **token** (inline in logs),
**chip** (bordered, assignable), **avatar/initial** (square mono initials).

```css
.agent { display:inline-flex; align-items:center; gap:6px; font-family:var(--font-mono);
  font-size:var(--fs-12); font-weight:500; color:var(--fg-secondary); white-space:nowrap; }
.agent .adot { width:7px; height:7px; border-radius:999px; flex:none;
  box-shadow:0 0 0 2px color-mix(in oklab, currentColor 14%, transparent); }
.agent.chip { height:22px; padding:0 9px 0 7px; border-radius:var(--r-pill);
  border:1px solid var(--border); background:var(--bg-subtle); }
.avatar { width:24px; height:24px; border-radius:var(--r-sm); flex:none;
  display:inline-flex; align-items:center; justify-content:center;
  font-family:var(--font-mono); font-size:11px; font-weight:600; background:var(--gray-900); color:#fff; }
```

The `.adot` color is set inline per agent, e.g. `style="background:var(--a-blue);color:var(--a-blue)"`
(color drives the soft ring). Avatar background uses the same `--a-*` hue. **`+prime` (the human)
is the exception** — it renders as a solid accent chip: `style="background:var(--accent);color:var(--accent-fg);border-color:var(--accent)"`.

### 5.4 Inputs — `.input`, `.select`, `.input-group`, `.kbd`

```css
.input,.select { height:var(--control-h); width:100%; padding:0 10px; font-size:var(--fs-13);
  color:var(--fg); background:var(--bg); border:1px solid var(--border-strong);
  border-radius:var(--r-md); outline:none;
  transition:border-color var(--speed) var(--ease), box-shadow var(--speed) var(--ease); }
.input::placeholder { color:var(--fg-faint); }
.input:focus,.select:focus { border-color:var(--accent); box-shadow:0 0 0 3px var(--accent-ring); }
.input-group { position:relative; display:flex; align-items:center; }
.input-group .ic-lead { position:absolute; left:9px; width:15px; height:15px; color:var(--fg-faint); pointer-events:none; }
.input-group .input { padding-left:30px; }
.kbd { display:inline-flex; align-items:center; gap:1px; height:18px; padding:0 5px;
  font-family:var(--font-mono); font-size:11px; color:var(--fg-muted);
  background:var(--bg-muted); border:1px solid var(--border); border-radius:var(--r-sm); white-space:nowrap; }
```

Search is first-class (⌘K) — show a trailing `.kbd` inside the input group.

### 5.5 Toggle & checkbox

```css
.toggle { position:relative; display:inline-block; width:34px; height:20px; flex:none; cursor:pointer; }
.toggle input { position:absolute; opacity:0; inset:0; margin:0; cursor:pointer; }
.toggle .track { position:absolute; inset:0; border-radius:999px; background:var(--gray-300);
  transition:background var(--speed) var(--ease); }
.toggle .thumb { position:absolute; top:2px; left:2px; width:16px; height:16px; border-radius:999px;
  background:#fff; box-shadow:var(--shadow-sm);
  transition:transform var(--speed) var(--ease), background var(--speed) var(--ease); }
.toggle input:checked + .track { background:var(--accent); }
.toggle input:checked + .track + .thumb { transform:translateX(14px); background:var(--accent-fg); }
.toggle input:focus-visible + .track { box-shadow:0 0 0 3px var(--accent-ring); }
[data-theme="dark"] .toggle .thumb { background:#ededef; }

.check { width:16px; height:16px; border-radius:var(--r-sm); border:1px solid var(--border-strong);
  background:var(--bg); display:inline-flex; align-items:center; justify-content:center; cursor:pointer;
  transition:background var(--speed) var(--ease), border-color var(--speed) var(--ease); }
.check.on { background:var(--accent); border-color:var(--accent); }
.check svg { width:11px; height:11px; color:#fff; opacity:0; }
.check.on svg { opacity:1; }
```

**Canonical off-state thumb** (per design decision): dark knob + white ring in light, white knob + dark ring in dark.

```css
.toggle input:not(:checked) + .track + .thumb { background:#18181b; box-shadow:0 0 0 1.5px #fff, var(--shadow-sm); }
[data-theme="dark"] .toggle input:not(:checked) + .track + .thumb { background:#fff; box-shadow:0 0 0 1.5px #18181b, var(--shadow-sm); }
```

### 5.6 Segmented control & tabs

```css
.seg { display:inline-flex; padding:2px; gap:2px; background:var(--bg-muted);
  border:1px solid var(--border); border-radius:var(--r-md); }
.seg button { height:calc(24px*var(--d-scale)); padding:0 10px; border:none; background:transparent;
  font-size:var(--fs-12); font-weight:500; color:var(--fg-muted);
  border-radius:calc(var(--r-md) - 2px); cursor:pointer;
  transition:background var(--speed) var(--ease), color var(--speed) var(--ease); }
.seg button:hover { color:var(--fg-secondary); }
.seg button.on { background:var(--bg); color:var(--fg); box-shadow:var(--shadow-xs); }

.tabs { display:flex; gap:2px; border-bottom:1px solid var(--border); }
.tab { position:relative; height:34px; padding:0 11px; display:inline-flex; align-items:center; gap:7px;
  font-size:var(--fs-13); font-weight:500; color:var(--fg-muted); cursor:pointer; border:none; background:transparent; }
.tab:hover { color:var(--fg-secondary); }
.tab.on { color:var(--fg); }
.tab.on::after { content:""; position:absolute; left:6px; right:6px; bottom:-1px; height:2px; background:var(--accent); border-radius:2px; }
```

### 5.7 Nav item & rows

```css
.nav-item { display:flex; align-items:center; gap:9px; height:var(--row-h); padding:0 9px;
  border-radius:var(--r-md); font-size:var(--fs-13); font-weight:450; color:var(--fg-secondary);
  cursor:pointer; user-select:none;
  transition:background var(--speed) var(--ease), color var(--speed) var(--ease); }
.nav-item .ic { width:16px; height:16px; flex:none; color:var(--fg-muted); transition:color var(--speed) var(--ease); }
.nav-item:hover { background:var(--bg-hover); color:var(--fg); }
.nav-item:hover .ic { color:var(--fg-secondary); }
.nav-item.active { background:var(--bg-active); color:var(--fg); font-weight:550; }
.nav-item.active .ic { color:var(--fg); }

.row { display:flex; align-items:center; gap:10px; height:var(--row-h); padding:0 10px;
  border-radius:var(--r-md); cursor:pointer; transition:background var(--speed) var(--ease); }
.row:hover { background:var(--bg-hover); }
.row.active { background:var(--bg-active); }
```

### 5.8 Card / panel / progress

```css
.card { background:var(--bg); border:1px solid var(--border); border-radius:var(--r-lg); }
.card-pad { padding:calc(16px*var(--d-scale)); }
.panel-head { display:flex; align-items:center; justify-content:space-between; gap:8px;
  padding:calc(11px*var(--d-scale)) calc(14px*var(--d-scale)); border-bottom:1px solid var(--border); }
.panel-title { font-size:var(--fs-13); font-weight:600; color:var(--fg); white-space:nowrap; }

.progress { height:6px; border-radius:999px; background:var(--bg-active); overflow:hidden; }
.progress > span { display:block; height:100%; border-radius:999px; background:var(--accent); }
.progress.thin { height:4px; }
```

### 5.9 Kanban card — `.kcard`

```css
.kcard { background:var(--bg); border:1px solid var(--border); border-radius:var(--r-md);
  padding:calc(10px*var(--d-scale)); box-shadow:var(--shadow-xs); cursor:grab;
  transition:border-color var(--speed) var(--ease), box-shadow var(--speed) var(--ease), transform var(--speed) var(--ease); }
.kcard:hover { border-color:var(--border-strong); box-shadow:var(--shadow-sm); }
```

Card anatomy: type chip (top-left) + ID badge-square (top-right) → title (13px/500) → agent token →
footer with dependency count (mono) + gate squares. Epic cards add `.bg-subtle`, bold title, and a
`.progress.thin` + `count/total` + `%` row. Type chip (`.kc-type`) uses status flavours:
**Epic→s-violet, Task→s-blue, Debt→s-amber, Bug→s-red**.

### 5.10 Gate squares

Six gates per item — letters `A C D S Q U` (Architecture, Code, Design, Security, QA, UAT).

```css
.gate { width:18px; height:18px; border-radius:5px; border:1px solid var(--border); background:transparent;
  display:inline-flex; align-items:center; justify-content:center;
  font-family:var(--font-mono); font-size:10px; font-weight:600; color:var(--fg-faint); }
.gate.g-pass { color:var(--green); border-color:var(--green-border); background:var(--green-bg); }
.gate.g-fail { color:var(--red);   border-color:var(--red-border);   background:var(--red-bg); }
.gate.g-todo { color:var(--fg-faint); border-color:var(--border); background:transparent; }
```

### 5.11 Terminal

```css
.terminal { font-family:var(--font-mono); font-size:var(--fs-12); line-height:1.65;
  background:var(--gray-950); color:#d6d6da; border-radius:var(--r-lg); }
[data-theme] .terminal { background:var(--gray-950); }
.terminal .t-dim{color:#6f6f78;} .terminal .t-green{color:#4ec38a;} .terminal .t-amber{color:#d9a85a;}
.terminal .t-red{color:#e0726a;} .terminal .t-blue{color:#6aa6f0;}
```

The terminal is **always dark** (`--gray-950`), even in light theme.

### 5.12 Notifications

**Toasts** (transient, top-right): white card, 3px left border in the status flavour, mono refs.

```css
.toast { display:flex; gap:11px; align-items:flex-start; padding:12px 12px 12px 13px;
  background:var(--bg); border:1px solid var(--border); border-left-width:3px;
  border-radius:var(--r-lg); box-shadow:var(--shadow-md); }
.toast.t-success{border-left-color:var(--green);}  .toast.t-success > svg.ti{color:var(--green);}
.toast.t-info{border-left-color:var(--blue);}       .toast.t-info > svg.ti{color:var(--blue);}
.toast.t-warn{border-left-color:var(--amber);}      .toast.t-warn > svg.ti{color:var(--amber);}
.toast.t-error{border-left-color:var(--red);}        .toast.t-error > svg.ti{color:var(--red);}
```

**Inline banner** (persistent, top of view): `.banner` + a status flavour class, icon + text + optional action button.
**Bell list**: panel with header (`.badge-count`), `.notif-item` rows; unread rows get `background: color-mix(in oklab, var(--accent) 6%, var(--bg))` and an accent `.notif-dot`.

### 5.13 Misc

```css
.hr { height:1px; background:var(--border); border:0; margin:0; }
.vr { width:1px; align-self:stretch; background:var(--border); }
.eyebrow { font-size:var(--fs-11); font-weight:600; letter-spacing:0.06em; text-transform:uppercase; color:var(--fg-faint); }
.tip { font-size:var(--fs-12); color:#fff; background:var(--gray-900); padding:4px 8px; border-radius:var(--r-sm); box-shadow:var(--shadow-md); }
/* utilities */
.muted{color:var(--fg-muted);} .faint{color:var(--fg-faint);} .secondary{color:var(--fg-secondary);}
.flex{display:flex;} .items-center{align-items:center;} .gap{gap:var(--gap);}
.grow{flex:1 1 auto;min-width:0;} .truncate{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
```

Custom scrollbars: add `.kx-scroll` to scroll containers
(`::-webkit-scrollbar{width:10px}`, thumb `var(--gray-300)` 999px radius with 3px `--bg` border).

---

## 6. Iconography

Icons come from **Lucide** (lucide.dev, MIT). Served through one helper `icon(name, className)`
that maps a kortext-semantic name → Lucide glyph and returns inline SVG with `stroke="currentColor"`,
so every icon inherits its surrounding text color and size.

- **Grid 24px · stroke 1.75px · round caps & joins · `fill:none`.**
- Size is set via CSS `width/height`, never baked in. Default **16px**; scale 14 / 16 / 20 / 24.
- Render: `<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">…</svg>`.

Semantic name → Lucide mapping (the set actually used — add new ones by pointing a kortext name at any Lucide glyph):

| Group | name → Lucide |
|---|---|
| **Navigation** | `dashboard`→LayoutDashboard, `board`→SquareKanban, `memory`→Brain, `foundation`→FolderRoot, `references`→FolderBookmark, `reports`→FolderCheck, `folderOpen`→FolderOpen, `team`→Users, `search`→Search, `bell`→Bell, `sidebar`→PanelLeft |
| **Engine & settings** | `setup`→Cog, `project`→FolderKanban, `rocket`→Rocket, `integrations`→Blocks, `environments`→Layers, `models`→Cpu, `llmauth`→KeyRound, `agents`→Bot, `askAi`→BotMessageSquare, `rules`→Scale, `workflows`→Workflow, `hooks`→Webhook, `scripts`→FileCode, `worktree`→GitBranch, `review`→ShieldUser, `terminal`→Terminal, `clipboard`→ClipboardPaste |
| **Theme** | `sun`→Sun, `moon`→Moon, `eclipse`→Eclipse |
| **Item types** | `epic`→Bookmark, `task`→SquareCheck, `bug`→Bug, `debt`→Coins |
| **Item detail** | `itemType`→LaptopMinimalCheck, `version`→Box, `testUrl`→SquareArrowOutUpRight, `childItem`→ListTree, `activity`→Activity, `comment`→MessageCircle, `send`→Send, `description`→TextAlignStart, `deps`/`link2`→Link2, `acceptance`→ListChecks, `gates`→LayoutList, `cost`→Currency |
| **Platforms** | `web`→Globe, `ios`→Smartphone, `android`→TabletSmartphone, `desktop`→Monitor, `api`/`server`→Server, `cli`→SquareTerminal |
| **Integrations** | `github`→GitMerge, `vercel`→Triangle, `supabase`/`database`→Database, `sentry`→Radio, `stripe`→CreditCard, `firebase`→Flame, `slack`→MessageSquare |
| **Files & visibility** | `fileText`→FileText, `file`→File, `folder`→Folder, `public`/`eye`→Eye, `secret`→EyeOff, `lock`→LockKeyhole, `unlock`→LockKeyholeOpen |
| **Actions** | `refresh`→RefreshCw, `play`→Play, `pause`→Pause, `copy`→Copy, `more`→Ellipsis, `moreV`→EllipsisVertical, `plus`→Plus, `check`→Check, `x`→X, `arrowRight`/`arrowLeft`, `chevron*`→Chevron*, `quote`→Quote, `shield`→Shield, `info`→Info |
| **Status glyphs** | `stTodo`→CircleDashed, `stProgress`→CircleEllipsis, `stReview`→CircleDot, `stDone`→CircleCheck, `stFail`→CircleAlert, `circle`→Circle |
| **Custom (filled)** | `dot` = `<circle cx="12" cy="12" r="4.5" fill="currentColor" stroke="none"/>` |

---

## 7. Vocabulary — fixed sets (one canonical form each)

Every concept has **exactly one canonical visual form** so the same word always reads the same. Every color is one of the status flavours; nothing invents a hue.

| Vocabulary | Canonical form | Values & flavours |
|---|---|---|
| **File status** (lifecycle) | **pill** (`.st-pill`) | `queued`(neutral) → `drafting`(amber) → `pending`(blue) → `approved`(green) |
| **Agent status** | **badge + dot** in cards/panels · **dot + count** in bottom status bar | `active`(green, **live pulse**) · `queued`(amber) · `blocked`(red) |
| **Item status** (board columns) | **badge + dot** | `to do`(neutral) · `in progress`(amber) · `test`(blue) · `review`(violet) · `done`(green) |
| **Item type** | **chip** (`.kc-type`, top-left of card) | `Epic`(violet) · `Task`(blue) · `Debt`(amber) · `Bug`(red) |
| **Roles / who speaks** | **mono token** (`.agent`) | `+prime` = the human (solid accent chip) · `system` & `engine` = machine actors (muted dot) · `+persona` = any of the 16 agents (identity dot) |
| **Item duties** | **text label** + the agent token it points at | Assignee · Approver · Gatekeeper · Reviewer |
| **Gate status** | **square** on cards (`.gate`, letter) + label in detail | 6 gates `A C D S Q U` · `pending`(todo) / `passed`(g-pass) / `failed`(g-fail) |

### The roster — `+prime` + 16 agent personas

`+prime` is the human (initials `pr`, solid accent). Each agent: `+<id>` token, identity hue, square avatar with initials.

| Agent | Role | Hue |
|---|---|---|
| `+operation-manager` | Orchestration | indigo |
| `+product-manager` | Product | purple |
| `+engineering-manager` | Engineering lead | red |
| `+delivery-manager` | Delivery | amber |
| `+designer` | Design | pink |
| `+growth-expert` | Growth | green |
| `+copywriter` | Content | amber |
| `+backend-developer` | Backend | blue |
| `+frontend-developer` | Frontend | cyan |
| `+db-admin` | Database | teal |
| `+devops-engineer` | DevOps | orange |
| `+security-engineer` | Security | red |
| `+qa-engineer` | QA | green |
| `+legal-expert` | Legal | purple |
| `+compliance-expert` | Compliance | teal |
| `+env-agent` | Environment | orange |

Avatar/token initials = first letter of first word + first letter of second word, lowercase
(e.g. `backend-developer` → `bd`, `db-admin` → `da`).

---

## 8. Hard rules (do / don't)

**Do**
- Build everything from tokens. Reference `var(--…)`; never hard-code a color the tokens cover.
- One primary button per view.
- Mono for ALL machine output (handles, IDs, times, paths, metrics, counts, keys).
- Color only as signal — status flavours + agent identity dots.
- 8-pt rhythm; functional motion only (130ms `var(--ease)`; the 1.8s pulse for "live" alone).
- Keep light-mode the default; verify dark works via the override block.

**Don't**
- No gradients, no emoji, no decorative/illustrative SVG.
- No new fonts (Barlow + Overpass Mono only; the product also ships Hanken Grotesk/JetBrains Mono and IBM Plex as optional `data-font` swaps — don't introduce others).
- Don't use agent identity hues (`--a-*`) as text or surface fills — dots/avatars only.
- Don't invent status colors outside the five flavours.
- Don't give a vocabulary a second visual form — one canonical form each (§7).
- No rounded-card-with-left-accent-border tropes (toasts' 3px left border is the *only* sanctioned use).
