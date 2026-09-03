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

## 1. Setup — fonts & theme

Load fonts (Google Fonts):

```html
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Barlow:wght@300;400;500;600;700&family=Overpass+Mono:wght@400;500;600;700&display=swap">
```

**One configuration, one choice.** The system had four `data-*` axes — theme,
accent, density, radius — and the panel set none of them: `<html>` carried no
attribute, so three of the four could never change and dark mode could never
appear at all. Accent, density and radius are gone (2026-09-03); the values they
scaled are now literal. Theme stays, and this time it is wired to a control.

**Theme is the one axis that stays**, because it is the one a person has an
opinion about. Three states: it defaults to the operating system, and an explicit
choice overrides it and is remembered.

```css
:root                    { /* light — §2 */ }
:root[data-theme='dark'] { /* dark  — §3 */ }
@media (prefers-color-scheme: dark) {
  :root:not([data-theme='light']) { /* dark — §3, again */ }
}
```

The dark values appear twice; plain CSS has no way to alias a block, and the
alternative — a class the script swaps — puts the theme behind JavaScript that
has not run yet, which is a flash of the wrong theme on every load. Duplication
is the cheaper honesty.

`data-theme` is set by one control in the panel header — **Auto · Light · Dark** —
and persisted. Unset means auto, which is what a first visit gets.

**Always build from the tokens below — never hard-code a value a token covers.**
That rule was in this document already and the stylesheet broke it: all ten type
tokens went unused while 15 hand-written sizes accumulated, half of them
half-pixel. A token nobody uses is not a system, it is a suggestion.

---

## 2. Design tokens (`:root`)

Roughly 50 tokens, each earning its place: every one below is used, and nothing
used is missing. Grouped by what it answers, not by what it looks like.

### 2.1 Surfaces & borders (light)

```css
--bg:#ffffff; --bg-subtle:#fbfbfc; --bg-muted:#f5f5f6; --bg-inset:#f7f7f8;
--bg-hover:#f2f2f4; --bg-active:#ececef;
--border:#e4e4e7; --border-strong:#d4d4d8; --border-faint:#eeeef1;
--border-hover:#c6c6cc;   /* the border a control takes under the cursor */
--scroll-thumb:#e0e0e4;
```

> The 12-step grey ramp is gone. It never fed the semantic tokens — those are
> literal hexes — so it was twelve public names duplicating values written
> elsewhere, and exactly two of them were ever used. Those two are above, named
> for their job instead of their position on a ramp.

### 2.2 Text (light)

```css
--fg:#18181b; --fg-secondary:#51515a; --fg-muted:#71717a; --fg-faint:#a3a3ad;
```

### 2.3 Accent — one, neutral

```css
--accent:#18181b; --accent-hover:#000000; --accent-fg:#ffffff;
--accent-tint:#f4f4f5; --accent-tint-border:#e2e2e6; --accent-ring:rgba(24,24,27,0.16);
```

The indigo / blue / green variants are gone with `data-accent`. Kortext is a
neutral tool; a second hue was a setting nobody set.

### 2.4 Status flavours — the ONLY non-neutral UI colours

Each flavour is a foreground, a tint background and a tint border. **Never
introduce a status colour outside this set.**

```css
--green:#157a52;  --green-bg:#eaf5ef;  --green-border:#cfe9dd;   /* approved · success · done */
--amber:#9a6a16;  --amber-bg:#faf2e2;  --amber-border:#ecdcb8;   /* your turn · paused · a question */
--red:#c5392f;    --red-bg:#fbeceb;    --red-border:#f1cfcc;     /* failed · destructive */
--blue:#2563c9;   --blue-bg:#eaf1fc;   --blue-border:#cfe0f6;    /* running · information */
--violet:#5b4bcc; --violet-bg:#efedfb; --violet-border:#dad5f4;  /* pending review */
--pink:#c02a72;   --pink-bg:#fdebf3;   --pink-border:#f6cede;    /* a demand · a moving input */
```

### 2.5 Type — seven roles

The scale is named by **duty**, not by pixels. `--fs-13` told you a number;
`--fs-body` tells you where it goes, which is the difference between a system
and a list.

```css
--font-sans:'Barlow', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif;
--font-mono:'Overpass Mono', ui-monospace, 'SF Mono', Menlo, monospace;

--fs-title:18px;    /* the one page or document title            h1 */
--fs-section:16px;  /* a section inside a document               h2 */
--fs-heading:14px;  /* card name, drawer title, panel head       h3 */
--fs-body:13px;     /* prose, inputs, the base                       */
--fs-ui:12px;       /* buttons, controls, chrome                     */
--fs-label:11px;    /* meta, ids, counts, footer                     */
--fs-micro:10px;    /* badges, mono eyebrows                         */
```

Base body: `font-family:var(--font-sans); font-size:var(--fs-body); line-height:1.5; color:var(--fg);`
Enable figures: `font-feature-settings:"cv01","ss01","tnum";` — tabular numerals everywhere.

**Two vocabularies, one scale.** Panel chrome speaks in roles: a `Dismiss` button
is `--fs-ui`, not an `h4`. Document prose — the markdown the panel renders inside
`.kx-doc` — speaks in headings, and they map onto the same seven:

| in a document | token | px |
|---|---|---|
| `h1` | `--fs-title` | 18 |
| `h2` | `--fs-section` | 16 |
| `h3` | `--fs-heading` | 14 |
| body | `--fs-body` | 13 |

### 2.6 Radius

```css
--r-sm:4px; --r-md:8px; --r-lg:12px; --r-pill:999px;
```

`--r-xl` is gone (one use) along with `--r-scale` and `data-radius`.

### 2.7 Control size

```css
--control-h:36px;      /* inputs, selects */
--control-h-sm:29px;   /* every button — see §5.1, there is one button size */
```

`--row-h`, `--pad-x` and `--gap` are gone (never used), along with `--d-scale`
and `data-density`. The scaled values are literal now: what was
`calc(24px * 1.2)` is 29px, because there is no second density to scale to.

### 2.8 Shadow & motion

```css
--terminal-bg:#09090b;   /* the one surface that ignores the theme */

--shadow-xs: 0 1px 1px rgba(24,24,27,0.04);        /* a raised control */
--shadow-lg: 0 12px 32px rgba(24,24,27,0.12), 0 2px 6px rgba(24,24,27,0.06);  /* a drawer, a popover */
--speed:130ms;
--ease:cubic-bezier(0.2, 0, 0, 1);
```

`--shadow-sm`, `--shadow-md` and `--shadow-pop` are gone — three depths nothing
reached for. Two is the honest number: a thing that is slightly off the page, and
a thing that is over it.

> **Agent identity hues (`--a-*`) are gone.** Ten oklch values for a 16-persona
> colour roster that died with the v6 dashboard; the panel writes an author's
> name in mono grey and has not asked for a colour since. If personas ever want
> colour again, it comes back as a decision, not as ten tokens waiting.

---

## 3. Dark theme

Same token names, different values. Applied by `:root[data-theme='dark']` and,
for anyone who never chose, by the media query in §1 — the same block written
twice.

```css
:root[data-theme='dark'] {
  --bg:#0a0a0b; --bg-subtle:#0f0f10; --bg-muted:#161618; --bg-inset:#121214;
  --bg-hover:#1a1a1d; --bg-active:#212126;
  --border:#222226; --border-strong:#2e2e34; --border-faint:#1a1a1e;
  --border-hover:#3a3a40; --scroll-thumb:#2e2e34;

  --fg:#ededef; --fg-secondary:#a1a1aa; --fg-muted:#8b8b93; --fg-faint:#63636b;

  --accent:#ededef; --accent-fg:#0a0a0b;
  /* darker, not whiter: the accent is already near-white, so a #ffffff hover
     moved a primary button nowhere. A light-on-dark control reacts by dimming. */
  --accent-hover:#cfcfd4;
  --accent-tint:#18181b; --accent-tint-border:#26262b; --accent-ring:rgba(237,237,239,0.22);

  --green:#46c08a; --green-bg:#10231b; --green-border:#1d3b2e;
  --amber:#d9a441; --amber-bg:#241c0e; --amber-border:#3d3016;
  --red:#e0726a;   --red-bg:#26120f;   --red-border:#3d201c;
  --blue:#6a9bf0;  --blue-bg:#101a2b;  --blue-border:#1d2e4a;
  --violet:#8d81ea; --violet-bg:#171429; --violet-border:#282348;
  --pink:#ee7bb0;  --pink-bg:#2b1220;  --pink-border:#4a2038;
}
```

Dark is not a filter over light: surfaces lift with elevation, borders stay
quiet, and a tint background is a near-black with a hue in it — never a
lightened light-mode value.

---

## 4. Typography — duties

### Barlow (product)

Everything a person reads as language: titles, prose, labels, buttons. Weights
300–700; the system uses 400 for body, 500 for controls, 600–650 for headings.

### Overpass Mono (machine) — use `.mono` / `var(--font-mono)`

Everything a machine owns: file paths, ids, codes, counts, commands, timestamps,
persona handles. If the user cannot retype it from memory, it is mono.

---

## 5. Components

All components live in **one stylesheet** (`styles/kortext.css`) shared by the product. Reproduce the class API exactly. Below are the canonical specs — copy the CSS verbatim into your build.

### 5.1 Buttons — `.btn`

`.btn` is the **base every clickable control carries**: size, font, focus ring,
disabled. It is never used alone — a variant always sits on it, and the variant
owns the hover. One primary per view.

Two families, one geometry. A **solid** variant shows its box always. A **link**
variant shows none until you point at it, and then it becomes its solid twin:
`.btn-link-success:hover` is `.btn-success` as it sits. Same height, same
padding, same radius, same font — the only difference is the resting box.

```css
/* ONE SIZE. The small one was on 19 call sites out of 21, so it is the size —
   a modifier that is almost always on is not a modifier. */
.btn { display:inline-flex; align-items:center; justify-content:center; gap:6px;
  height:var(--control-h-sm); padding:0 9.6px;
  font-size:var(--fs-ui); font-weight:500; line-height:1;
  border-radius:var(--r-sm); border:1px solid transparent;
  background:var(--bg); color:var(--fg); cursor:pointer; white-space:nowrap; user-select:none;
  transition:background var(--speed) var(--ease), border-color var(--speed) var(--ease), box-shadow var(--speed) var(--ease), color var(--speed) var(--ease); }
.btn:focus-visible { outline:none; box-shadow:0 0 0 3px var(--accent-ring); }
.btn .ic { width:14px; height:14px; flex:none; }
/* The base declares NO hover: a rule here would silently outrank a variant's. */
.btn:hover { background:none; border-color:transparent; }

/* ── solid: the box is always there ─────────────────────────────────────── */
.btn-primary         { background:var(--accent); color:var(--accent-fg); border-color:var(--accent); }
.btn-primary:hover   { background:var(--accent-hover); border-color:var(--accent-hover); }
.btn-secondary       { background:var(--bg); color:var(--fg); border-color:var(--border-strong); box-shadow:var(--shadow-xs); }
.btn-secondary:hover { background:var(--bg-active); border-color:var(--border-hover); }
.btn-success         { background:var(--green-bg); color:var(--green); border-color:var(--green-border); }
.btn-success:hover   { background:var(--green-bg); color:var(--green); border-color:var(--green); }
.btn-danger          { background:var(--red-bg); color:var(--red); border-color:var(--red-border); }
.btn-danger:hover    { background:var(--red-bg); color:var(--red); border-color:var(--red); }

/* ── link: no box until you point at it ─────────────────────────────────── */
.btn-link-primary,
.btn-link-success,
.btn-link-danger { height:var(--control-h-sm); padding:0 9.6px;
                   border-radius:var(--r-sm); background:none; border-color:transparent; }
.btn-link-primary       { color:var(--fg-secondary); }
.btn-link-primary:hover { background:var(--bg-active); border-color:var(--border-strong); color:var(--fg); }
.btn-link-success       { color:var(--green); }
.btn-link-success:hover { background:var(--green-bg); border-color:var(--green-border); color:var(--green); }
.btn-link-danger        { color:var(--red); }
.btn-link-danger:hover  { background:var(--red-bg); border-color:var(--red-border); color:var(--red); }

/* ── the one exception ──────────────────────────────────────────────────── */
/* A × inside a 6px-padded chip: full button height would grow the chip around
   it. Carries the family, keeps its own geometry, and takes no hover — it sits
   in a row you are reading, not a control you are aiming at. */
.btn-x       { height:auto; padding:0 4px; font-size:14px; margin-left:auto;
               background:none; border-color:transparent; color:var(--fg-faint); }
.btn-x:hover { background:none; border-color:transparent; color:var(--fg-secondary); }

.btn[disabled] { opacity:0.45; pointer-events:none; }   /* one rule, every variant */
```

Leading icon: `<button class="btn btn-secondary"><i class="ic">…</i> New item</button>`.
Link: `<button class="btn btn-link-danger">Remove project</button>`.

> **Retired (2026-09-03):** `.btn-sm` (folded into `.btn`), `.btn-ghost` and
> `.btn-icon` (defined, never used), the bare `.btn` variant (with no box at
> rest it *was* the link), the `info` tone, and the `.kx-link*` family — which
> became `.btn-link*` and stopped being 10.5px mono, because a link that is a
> button should read like one.

### 5.2 Badges & pills — `.badge`

```css
.badge { display:inline-flex; align-items:center; gap:5px; height:20px; padding:0 8px;
  font-size:var(--fs-ui); font-weight:500; line-height:1; border-radius:var(--r-pill);
  border:1px solid var(--border); background:var(--bg-muted); color:var(--fg-secondary); white-space:nowrap; }
.badge .dot { width:6px; height:6px; border-radius:999px; background:var(--fg-muted); flex:none; }
.badge-square { border-radius:var(--r-sm); }            /* IDs / versions */
.badge-solid  { background:var(--accent); color:var(--accent-fg); border-color:var(--accent); }
.badge-count  { min-width:18px; height:18px; padding:0 5px; justify-content:center;
  font-family:var(--font-mono); font-size:var(--fs-label); font-weight:500;
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
  font-size:var(--fs-ui); font-weight:500; color:var(--fg-secondary); white-space:nowrap; }
.agent .adot { width:7px; height:7px; border-radius:999px; flex:none;
  box-shadow:0 0 0 2px color-mix(in oklab, currentColor 14%, transparent); }
.agent.chip { height:22px; padding:0 9px 0 7px; border-radius:var(--r-pill);
  border:1px solid var(--border); background:var(--bg-subtle); }
.avatar { width:24px; height:24px; border-radius:var(--r-sm); flex:none;
  display:inline-flex; align-items:center; justify-content:center;
  font-family:var(--font-mono); font-size:11px; font-weight:600; background:var(--fg); color:#fff; }
```

The `.adot` colour is inherited, not per-agent: the identity hues were removed with the
v6 dashboard (§2.8), so a persona reads as its handle in mono, not as a colour.
(color drives the soft ring). Avatar background uses the same `--a-*` hue. **`+prime` (the human)
is the exception** — it renders as a solid accent chip: `style="background:var(--accent);color:var(--accent-fg);border-color:var(--accent)"`.

### 5.4 Inputs — `.input`, `.select`, `.input-group`, `.kbd`

```css
.input,.select { height:var(--control-h); width:100%; padding:0 10px; font-size:var(--fs-body);
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
.toggle .track { position:absolute; inset:0; border-radius:999px; background:var(--border-strong);
  transition:background var(--speed) var(--ease); }
.toggle .thumb { position:absolute; top:2px; left:2px; width:16px; height:16px; border-radius:999px;
  background:#fff; box-shadow:var(--shadow-xs);
  transition:transform var(--speed) var(--ease), background var(--speed) var(--ease); }
.toggle input:checked + .track { background:var(--accent); }
.toggle input:checked + .track + .thumb { transform:translateX(14px); background:var(--accent-fg); }
.toggle input:focus-visible + .track { box-shadow:0 0 0 3px var(--accent-ring); }
@media (prefers-color-scheme: dark) .toggle .thumb { background:#ededef; }

.check { width:16px; height:16px; border-radius:var(--r-sm); border:1px solid var(--border-strong);
  background:var(--bg); display:inline-flex; align-items:center; justify-content:center; cursor:pointer;
  transition:background var(--speed) var(--ease), border-color var(--speed) var(--ease); }
.check.on { background:var(--accent); border-color:var(--accent); }
.check svg { width:11px; height:11px; color:#fff; opacity:0; }
.check.on svg { opacity:1; }
```

**Canonical off-state thumb** (per design decision): dark knob + white ring in light, white knob + dark ring in dark.

```css
.toggle input:not(:checked) + .track + .thumb { background:#18181b; box-shadow:0 0 0 1.5px #fff, var(--shadow-xs); }
@media (prefers-color-scheme: dark) .toggle input:not(:checked) + .track + .thumb { background:#fff; box-shadow:0 0 0 1.5px #18181b, var(--shadow-xs); }
```

### 5.6 Segmented control & tabs

```css
.seg { display:inline-flex; padding:2px; gap:2px; background:var(--bg-muted);
  border:1px solid var(--border); border-radius:var(--r-md); }
.seg button { height:29px; padding:0 10px; border:none; background:transparent;
  font-size:var(--fs-ui); font-weight:500; color:var(--fg-muted);
  border-radius:calc(var(--r-md) - 2px); cursor:pointer;
  transition:background var(--speed) var(--ease), color var(--speed) var(--ease); }
.seg button:hover { color:var(--fg-secondary); }
.seg button.on { background:var(--bg); color:var(--fg); box-shadow:var(--shadow-xs); }

.tabs { display:flex; gap:2px; border-bottom:1px solid var(--border); }
.tab { position:relative; height:34px; padding:0 11px; display:inline-flex; align-items:center; gap:7px;
  font-size:var(--fs-body); font-weight:500; color:var(--fg-muted); cursor:pointer; border:none; background:transparent; }
.tab:hover { color:var(--fg-secondary); }
.tab.on { color:var(--fg); }
.tab.on::after { content:""; position:absolute; left:6px; right:6px; bottom:-1px; height:2px; background:var(--accent); border-radius:2px; }
```

### 5.7 Nav item & rows

```css
.nav-item { display:flex; align-items:center; gap:9px; height:36px; padding:0 9px;
  border-radius:var(--r-md); font-size:var(--fs-body); font-weight:450; color:var(--fg-secondary);
  cursor:pointer; user-select:none;
  transition:background var(--speed) var(--ease), color var(--speed) var(--ease); }
.nav-item .ic { width:16px; height:16px; flex:none; color:var(--fg-muted); transition:color var(--speed) var(--ease); }
.nav-item:hover { background:var(--bg-hover); color:var(--fg); }
.nav-item:hover .ic { color:var(--fg-secondary); }
.nav-item.active { background:var(--bg-active); color:var(--fg); font-weight:550; }
.nav-item.active .ic { color:var(--fg); }

.row { display:flex; align-items:center; gap:10px; height:36px; padding:0 10px;
  border-radius:var(--r-md); cursor:pointer; transition:background var(--speed) var(--ease); }
.row:hover { background:var(--bg-hover); }
.row.active { background:var(--bg-active); }
```

### 5.8 Card / panel / progress

```css
.card { background:var(--bg); border:1px solid var(--border); border-radius:var(--r-lg); }
.card-pad { padding:19.2px; }
.panel-head { display:flex; align-items:center; justify-content:space-between; gap:8px;
  padding:13.2px 16.8px; border-bottom:1px solid var(--border); }
.panel-title { font-size:var(--fs-body); font-weight:600; color:var(--fg); white-space:nowrap; }

.progress { height:6px; border-radius:999px; background:var(--bg-active); overflow:hidden; }
.progress > span { display:block; height:100%; border-radius:999px; background:var(--accent); }
.progress.thin { height:4px; }
```

### 5.9 Kanban card — `.kcard`

```css
.kcard { background:var(--bg); border:1px solid var(--border); border-radius:var(--r-md);
  padding:12px; box-shadow:var(--shadow-xs); cursor:grab;
  transition:border-color var(--speed) var(--ease), box-shadow var(--speed) var(--ease), transform var(--speed) var(--ease); }
.kcard:hover { border-color:var(--border-strong); box-shadow:var(--shadow-xs); }
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
.terminal { font-family:var(--font-mono); font-size:var(--fs-ui); line-height:1.65;
  background:var(--terminal-bg); color:#d6d6da; border-radius:var(--r-lg); }
.terminal .t-dim{color:#6f6f78;} .terminal .t-green{color:#4ec38a;} .terminal .t-amber{color:#d9a85a;}
.terminal .t-red{color:#e0726a;} .terminal .t-blue{color:#6aa6f0;}
```

The terminal is **always dark** (`--terminal-bg: #09090b`), in either theme — it shows a
machine's own output, and that surface does not follow the room it is read in.

### 5.12 Notifications

**Toasts** (transient, top-right): white card, 3px left border in the status flavour, mono refs.

```css
.toast { display:flex; gap:11px; align-items:flex-start; padding:12px 12px 12px 13px;
  background:var(--bg); border:1px solid var(--border); border-left-width:3px;
  border-radius:var(--r-lg); box-shadow:var(--shadow-xs); }
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
.eyebrow { font-size:var(--fs-label); font-weight:600; letter-spacing:0.06em; text-transform:uppercase; color:var(--fg-faint); }
.tip { font-size:var(--fs-ui); color:#fff; background:var(--fg); padding:4px 8px; border-radius:var(--r-sm); box-shadow:var(--shadow-xs); }
/* utilities */
.muted{color:var(--fg-muted);} .faint{color:var(--fg-faint);} .secondary{color:var(--fg-secondary);}
.flex{display:flex;} .items-center{align-items:center;} .gap{gap:9.6px;}
.grow{flex:1 1 auto;min-width:0;} .truncate{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
```

Custom scrollbars: add `.kx-scroll` to scroll containers
(`::-webkit-scrollbar{width:10px}`, thumb `var(--border-strong)` 999px radius with 3px `--bg` border).

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
