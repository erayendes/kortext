# Kortext — Design System

The panel's visual language: what a colour means, which size goes where, when a button takes
which shape. The token values below are the ones live in `ui/src/index.css`; that file is the
implementation, this document is the argument. Visual history: `archive/concepts/`.

---

## 0 · Principles

**Quiet is correct.** Kortext is a tool, not a show. A dozen agents can be working in parallel
and the screen stays calm. Colour enters only when it has something to say.

**Colour carries meaning.** Green is approval, red is failure, pink is a demand. No decorative
colour — if you see one, there is a reason.

**Every token names a job, not a size.** `--fs-body` says where it goes; `--fs-13` is just a
number. You pick the job.

**Machine and human write differently.** Paths, ids, commands — mono. Every sentence a human
reads — Barlow. Blur the two and both lose their credibility.

**One configuration.** A setting nobody changes is not a setting. One axis survives: theme.

**Never:** gradients, emoji, decorative SVG, rounded cards with a coloured left edge,
Inter/Roboto.

---

## 1 · Theme

Three states. **Auto** follows the OS and is the first-run state; **Light** and **Dark** are the
user's choice, override the OS and are remembered in `localStorage`. No other appearance setting.

```css
:root                    { /* light */ }
:root[data-theme='dark'] { /* dark — same names, other values */ }
@media (prefers-color-scheme: dark) {
  :root:not([data-theme='light']) { /* dark, written a second time */ }
}
```

The dark values are written twice on purpose. Plain CSS has no block alias, and the alternative
— a class a script adds on load — shows the wrong theme for one frame on every open. Repetition
is the cheaper honesty. `data-theme` is written by one control (the footer's `.seg-sm`); no
attribute means auto.

> Dark is not light run through a filter: surfaces lighten as they rise, borders stay quiet, and
> a tinted background is a black with colour mixed in — not a lightened light-mode value.

---

## 2 · Colour

**Surfaces** rise in order — `--bg` is the floor, `--bg-active` the top. Higher means lighter
(in dark too, where "lighter" means less black).

| token | light | dark | used for |
| --- | --- | --- | --- |
| `--bg` | `#ffffff` | `#0a0a0b` | the page |
| `--bg-subtle` | `#fbfbfc` | `#0e0e10` | card, panel |
| `--bg-muted` | `#f5f5f6` | `#161618` | a sunken well |
| `--bg-inset` | `#f7f7f8` | `#121214` | code box |
| `--bg-hover` | `#f2f2f4` | `#1a1a1d` | under the cursor |
| `--bg-active` | `#ececef` | `#212126` | pressed, selected |
| `--border` | `#eaeaec` | `#2a2a30` | default line |
| `--border-strong` | `#dcdce0` | `#3a3a42` | control edge |
| `--border-faint` | `#f0f0f2` | `#1f1f24` | divider |
| `--border-hover` | `#c6c6cc` | `#3a3a40` | under the cursor |

**Text** has four steps, importance falling: `--fg` `#18181b`/`#ededef` (read this) ·
`--fg-secondary` `#51515a`/`#9c9ca5` · `--fg-muted` `#76767f`/`#6e6e77` · `--fg-faint`
`#a3a3ad`/`#54545c` (just needs to exist).

**Accent** is single and neutral. Kortext is not a brand show; the primary action is black,
because it is the one thing that must be seen. `--accent` `#18181b` / dark `#ededef`, plus
`--accent-fg`, `--accent-tint`, `--accent-tint-border`, `--accent-ring`.

> In dark, `--accent-hover` is **darker**, not whiter: the accent there is already near white
> (`#ededef`), so a white hover goes nowhere. A light-on-dark control darkens to respond —
> `#cfcfd4`.

**State colours** are the only non-neutral colours in the interface. Each comes as a triple
(text, background, border) and the set is closed.

| token | light | dark | reads as |
| --- | --- | --- | --- |
| `--green` | `#157a52` | `#46c08a` | approved, passed |
| `--amber` | `#9a6a16` | `#d3a55e` | your turn, paused |
| `--red` | `#c5392f` | `#e0726a` | failed, destructive |
| `--blue` | `#2563c9` | `#5e9bf0` | writing, info |
| `--violet` | `#5b4bcc` | `#8b7df0` | in review |
| `--pink` | `#c02a72` | `#ee7bb0` | a demand, a moving input |

**One palette, three contexts.** These six speak three languages and never collide, because none
stands next to another: state lives at the edge of a row, an alert inside a document body, syntax
inside a code block.

| colour | in a row (state) | in a body (alert) | in a block (syntax) |
|---|---|---|---|
| green | approved | Tip | string |
| amber | your turn, paused | Warning | number |
| violet | pending | Important | keyword |
| blue | writing | Note | JSON key |
| red | failed | Caution | — |
| pink | demand, dependency | — | — |

The rule stands: **no new state colour is invented.** What expands is what a colour says
depending on where it is read.

---

## 3 · Typography

Two families. **Barlow** writes the human's language — headings, sentences, buttons.
**Overpass Mono** writes everything the machine owns — paths, ids, commands, timestamps. The
test: if the user cannot type it from memory, it is mono.

Seven roles, named by job, not by number:

| token | px | where |
| --- | --- | --- |
| `--fs-title` | 18 | the single title of a page or document (h1) |
| `--fs-section` | 16 | a section inside a document (h2) |
| `--fs-heading` | 14 | card name, drawer title, panel head (h3) |
| `--fs-body` | 13 | prose, inputs — the base |
| `--fs-ui` | 12 | buttons, controls, panel chrome |
| `--fs-label` | 11 | meta, id, counter, footer |
| `--fs-micro` | 10 | badge, mono eyebrow |

Base: `font-family:var(--font-sans); font-size:var(--fs-body); line-height:1.5; color:var(--fg)`
with `font-feature-settings:"cv01","ss01","tnum"` so numbers align in a column.

Weights: `400` body · `500` control and label · `600` section heading · `650` page title.
Mono takes the **same size** as the prose beside it; `.mono` changes the family only.

**Two vocabularies, one scale.** Panel chrome speaks in role names — a `Dismiss` button is not a
heading. Markdown inside a document says h1/h2/h3. Same seven sizes, different words.

---

## 4 · Spacing

Six steps, all multiples of 4. Nothing in between — with no 13px there is nothing to misalign.

`--sp-1` 4px (icon to text) · `--sp-2` 8px (inside a control) · `--sp-3` 12px (card padding) ·
`--sp-4` 16px (within a section) · `--sp-5` 24px (between sections) · `--sp-6` 32px (page edge).

Controls doing the same job sit `--sp-2` apart; an action and a choice group are `--sp-3` apart.
`Example ↓` does not touch the `Write | Upload` segment — one does work, the other asks a
question, and the gap says so.

---

## 5 · Radius, shadow, motion

`--r-sm` 4px (control) · `--r-md` 6px (card) · `--r-lg` 9px (panel) · `--r-pill` 999px (badge).

Two elevations, nothing between: `--shadow-xs` is *slightly off the page* (a control),
`--shadow-lg` *above it* (drawer, popover). Dark keeps the same two, blacker.

Motion is functional: `--speed` 130ms with `--ease` `cubic-bezier(0.2,0,0,1)`, plus one slow
pulse (1.8s) for "alive". No other animation.

---

## 6 · Buttons

One height, and it is the height of a single-line text input (`--control-h`, 36px). In a control
row the input, button, select and segment line up; two different heights never sit side by side.

Two families: **solid** always shows its box; **link** shows it only on hover — and then becomes
its solid twin. One primary button per screen.

`.btn` is the **base** every control carries: size, font, focus ring, disabled state. It is never
used alone, and **hover belongs to the variant** — the base deliberately has no hover of its own,
because a rule there would quietly beat the variant's.

| variant | when |
|---|---|
| `.btn-primary` | the real action — the one button that moves things on |
| `.btn-secondary` | the alternative — cancel, close, decline |
| `.btn-success` | approval — **Approve** only |
| `.btn-danger` | an irreversible action |
| `.btn-link-primary` | secondary and quiet — Close, Edit, Ask, Add note |
| `.btn-link-success` | positive and quiet — Archive |
| `.btn-link-danger` | destructive and quiet — the danger zone |
| `.btn-x` | the × inside a chip. Carries the family, not the height; no hover, because it sits in a line you read, not a control you aim at |

Action order under a demand: `Apply · Dismiss · Add note · Ask` — decision, then addition to the
decision, then the question.

---

## 7 · Inputs

`--control-h` 36px for **every** control; `--control-h-sm` 29px only in compressed contexts.
`.input` takes `--fs-body` and a `--border-strong` edge, and on focus swaps to the accent border
plus a 3px `--accent-ring`.

**Select.** The native arrow ignores the theme and is drawn differently on every platform, so
`appearance:none` kills it and the chevron comes back as an inline SVG that inherits the text
colour. Button height, so a select and a button line up.

**Segmented control.** For "which one is on", not "which was pressed". Full-size `.seg` is for a
choice that changes how a screen works; `.seg-sm` (half height, pill) is for a preference set once
and forgotten — the theme switch sits in the footer at that size.

**Two options are still a segment**: instead of an underlined tab pair, `.seg` keeps the control
height and lifts the selected one out of its well. The brief's **Write | Upload** works this way.
An action is not a tab — **Example ↓** downloads a file and stands outside the segment as
`.btn-link-primary`.

---

## 8 · State vocabulary

The heart of the system. A document is in **exactly one** state — where it is. Badges ride on top
— what it owes. Two questions, so two displays.

| state | means | colour |
|---|---|---|
| `waiting` | queued; the chain has not reached it | neutral |
| `writing` | the agent is writing it now | blue, slow pulse |
| `paused` | writing was stopped | amber |
| `pending` | written, waiting for your approval | violet |
| `approved` | you approved it | green |
| `n/a` | considered, deliberately skipped | no badge, faint outline |

`n/a` is not a colour but the absence of one: an outline in the text's own ink.

| badge | means | colour |
|---|---|---|
| `failed` | the last attempt fell over; the reason is in the document | red |
| `change request` | another document wants this one changed | pink |
| `dependent` | an input is moving; it will be re-read when that settles | pink, hollow |

**A badge beats the state.** Anything carrying `failed` or `change request` moves to **Needs
you** whatever its state. The exception is `dependent`: news, not work, so it stays put.

Groups: `Needs you` → `In progress` → `Next` → `Approved` → `Not applicable`. The last two are
collapsed by default — one is finished, the other deliberately skipped.

---

## 9 · Rows, cards, bands

A document row reads left to right: **name**, **author**, **what it owes**, **where it is**. The
state sits last because it is what you check last — first which document, then whether you owe it
something.

```html
<button class="kx-doc-row">
  <span class="kx-doc-name">API</span>
  <span class="kx-doc-author mono">architect</span>
  <span class="kx-doc-spacer"></span>
  <span class="kx-badge kx-badge-change">change request</span>
  <span class="kx-status kx-status-approved">approved</span>
</button>
```

A command card (`.kx-cmd-card`) copies its content on click; the hint lives inside the card, not
in a separate button.

**Bands** sit above a document, and the colour says whose turn it is:

| band | colour | means |
|---|---|---|
| readiness gate `.kx-gate` | blue ground, blue text, no frame | the system is reading |
| demand `.kx-doc-changebar` | pink ground, pink frame and text | a decision is waited on |
| dependency `.kx-doc-dependbar` | no ground, plain pink frame | news only |
| open question `.kx-doc-askbar` | amber | yours, and it blocks approval |

The demand band shares its pink with the `change request` badge: you see the badge in the row,
open the document and find the same pink. The dependency band is the `dependent` badge enlarged —
hollow, framed.

Panel header is one line: **Kortext | project brain**, and nothing else unless there is no
agent CLI at all — the engine belongs to a project, so its control sits on the project screen,
beside Start, at the same height as Start. Footer: **Kortext v3.1.0 by
Milowda** and **Kopeng — task board** on the left, the theme switch (`.seg-sm`) on the right. A
setting configured once does not sit at the top of every screen.

---

## 10 · Document view

The markdown the panel renders, on the same seven sizes: body `--fs-body`, headings
`--fs-title` / `--fs-section` / `--fs-heading`.

Two kinds of debt, two colours — **amber** `.open-q` (`## Open Questions for prime`, yours to
answer) and **pink** `.req-q` (`## Revision Requests`, a demand written to another document).
Share one colour and you lose which is yours. Pink lands only on a **standing** demand: a closed
one (`- [x]`) stays in the document unpainted — it is no longer a debt but the record of one.

An open question is always numbered `#n` (`.kx-qno`), and the bullet is suppressed on that line —
both fall into the same hanging indent and would overlap. Once a note is added (`.noted`) the
amber ground withdraws and only the left bar stays; ground plus bar would read as brown.

**Blockquote** has no ground: a grey bar on the left, GitHub-style. The bar is not a `border` but
the **same mechanism as the selection/note bar** (`box-shadow: inset 3px`), so a blue selection or
an amber note replaces it instead of sitting beside it. It starts at the heading column
(`margin-left: 8px`), because a rule that overhangs the text it aligns with reads as a margin.

**Alerts** use GitHub's `> [!NOTE]` syntax — five kinds, each with its own 16px inline SVG, label
and ground: NOTE blue · TIP green · IMPORTANT violet · WARNING amber · CAUTION red. The block is
parsed as one piece, so a reader asks about the whole alert, not one of its lines.

**Code.** Inline code is a token inside the sentence: 0.9em, `--bg-inset` ground, 4px corner. A
block is a framed panel with a **Copy** button that appears on hover, becomes ✓ *Copied* and
reverts after 1.6s — a code block is there to be taken somewhere, not read. Highlighting comes
from our own painter (`ui/src/highlight.ts`, no dependency), six token kinds from the §2 palette:
keyword/command violet · string green · number amber · JSON key blue · comment `--fg-faint` italic
· flag `--fg-muted`. An unknown or unlabelled language is **not painted at all**, so folder trees
and output dumps stay plain. The painter's one hard rule: text in equals text out.

**Lists and boxes.** Top-level bullets are filled (`•`), nested ones hollow (`◦`); indentation
comes from the source. A wrapped line rejoins its own item instead of falling to the left margin.
`- [ ]` and `- [x]` are drawn as real boxes, and they are **read-only**: the mark is placed by
whoever wrote the document, not by the panel.

**Headings.** `H1` and `H2` carry a thin `--border` line beneath them — a section boundary reads
cheaper and sharper than whitespace alone.

**Proposal diff.** The agent's draft is shown in the editor itself, not in a second box: the whole
document with the changed lines marked, removed in `--red-bg`, added in `--green-bg`, the line
count above and **Edit text** to drop into plain text. Two boxes meant two documents, and the
reader had to merge them in their head.

---

## 11 · Writing

- **Headings, code and names are always English.** Section headings are structure and other
  documents cite them by name; so are file names, commands, table columns, API paths, branches.
- **Prose is in the brief's language** — whatever the human reading it speaks.
- **Product copy is in the interface language** — every string the end user reads. It may differ
  from the document's language.
- **A name is never translated.** `PRODUCT.md` is `PRODUCT.md` in every language.

---

## 12 · The dead-CSS sweep (2026-09-04)

`index.css` still carried the whole v6 dashboard — a board, a sidebar, a terminal, an
onboarding flow, a settings page, none of them rendered by any component. It was removed in one
pass, with a rule kept only when **every** class in its selector is one the panel actually
renders (dynamic names — `hl-${kind}`, `kx-status-${key}`, `kx-alert-${kind}`, `kx-${mdKind}` —
enumerated from the code that builds them, so a rule reached only through a template literal
survives).

| | before | after |
| --- | --- | --- |
| lines | 1734 | 643 |
| rules | 1256 | 354 |
| custom properties | 169 | 76 |

Gone with it: the `--color-*` alias family, the unused greys, the ten persona colours `--a-*`,
`--radius-*`, `--shadow-md/pop`, `--sidebar-w` / `--header-h` / `--footer-h`, the `.kx-link*`
family superseded by `.btn-link*`, and the `data-accent` / `data-density` / `data-radius`
switches with their `--r-scale` / `--d-scale` multipliers — no code ever wrote those attributes,
so the radii and control heights are now the literal values they always computed to.

Two things were left on purpose: `--sp-1`, `--sp-5` and `--sp-6` (a spacing scale with holes
invites hand-written pixels) and `var(--bg-surface, transparent)`, which reads an undefined
token through a fallback and is therefore correct as written.

---

## 13 · Rules

**Do** — build from tokens; leave one primary button per screen; put the destructive action at the
bottom as a quiet link; show state and debt separately; set everything the machine owns in mono;
keep light the default and check dark on every change.

**Don't** — invent a state colour (the set is closed); give a persona or category its own colour;
use half-pixel sizes; put two button heights on one screen; carry a warning in colour alone; use
gradients, emoji or decorative SVG.
