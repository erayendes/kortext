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
is the cheaper honesty. `data-theme` is written by one control — the header's `.kx-theme`
button, which cycles auto → light → dark and shows the state that is on; no attribute means
auto.

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
| violet | the `approve` badge; a plan not yet approved | Important | keyword |
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
| `--fs-title` | 20 | the single title of a page or document (h1) |
| `--fs-section` | 18 | a section inside a document (h2) |
| `--fs-heading` | 16 | card name, drawer title, a sub-section (h3) |
| `--fs-body` | 13 | prose, inputs, buttons — the base |
| `--fs-ui` | 12 | controls, pills, panel chrome |
| `--fs-label` | 11 | meta, id, counter, footer |
| `--fs-micro` | 10 | mono eyebrow: group label, h4, table head |

Base: `font-family:var(--font-sans); font-size:var(--fs-body); line-height:1.5; color:var(--fg)`
with `font-feature-settings:"cv01","ss01","tnum"` so numbers align in a column.

Weights: `400` body · `500` control and label · `600` every heading. Nothing heavier: a title is
told by its size, not by a fourth weight. Mono takes the **same size** as the prose beside it;
`.mono` changes the family only.

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

Transitions use `--speed` 130ms with `--ease` `cubic-bezier(0.2,0,0,1)`. Current animations also
include the 1.8s status ping, 1.4s activity pulse, 0.8s/0.9s spinners and 320ms slide entry.
Reduced-motion handling currently disables slide entry only; coverage of the remaining
animations is still incomplete. The accessibility target is recorded in [PRODUCT.md](./PRODUCT.md).

---

## 6 · Buttons

One height, and it is the height of a single-line text input (`--control-h`, 30px). In a control
row the input, button, select and segment line up; two different heights never sit side by side.
A button is `--fs-body` on a `--r-md` corner — the June size, kept because a 36px control read as
a web form, not a tool.

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

Action order in the Action Needed list: the tick that accepts, then `Say why`, then the thread
(Ask · Add note) under the row — decision, then addition to the decision, then the question. The
button that sends them all sits under the whole list, not under a group.

---

## 7 · Inputs

`--control-h` is 30px for standard form controls. Compact controls use sizes in their own rules.
`.input` takes `--fs-body` and a `--border-strong` edge, and on focus swaps to the accent border
plus a 3px `--accent-ring`.

**Checkbox.** Never the browser's: `appearance:none`, a 16px hairline square on `--r-sm` that
fills with the accent and a white tick when on. The same drawing serves the Action Needed rows
(`.kx-req-check`) and a `- [x]` in a document (`.kx-task-box`); only the cursor differs.

**Select.** The native arrow ignores the theme and is drawn differently on every platform, so
`appearance:none` kills it and the chevron comes back as an inline SVG that inherits the text
colour. Button height, so a select and a button line up.

**Segmented control.** For "which one is on", not "which was pressed". `.seg` is for a choice
that changes how a screen works. A preference set once (the theme) is not a segment: one icon
button in the header, whose drawing says which state is on.

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
| `waiting` | queued — or written and waiting for you, which the `approve` badge says | neutral |
| `writing` | the agent is writing it now | blue, the dot pulses |
| `reading` | a recheck is running against it now — the agent reads, it does not write | blue, the dot pulses |
| `paused` | writing was stopped | amber |
| `approved` | you approved it | green |
| `n/a` | considered, deliberately skipped | no ground, faint outline |

A state is a **tag with a dot**: 20px, `--fs-ui`, a hairline border in the state's own tint, a
6px dot in the state's colour before the word, on the `--r-sm` corner — square where the badges
beside it are round, so the two never read as one family. The dot is what you scan a column for; the word is
what you read when you stop. `n/a` is not a colour but the absence of one: an outline in the
text's own ink.

| badge | means | colour | group |
|---|---|---|---|
| `review` | Action Needed items stand on it — questions, incoming or outgoing requests; the tooltip lists them | pink | Action needed |
| `approve` | nothing open — approve it | violet | Action needed |
| `recheck` | an input moved; read again when it settles — the tooltip names the input | amber | To do while queued, Doing while `reading` |
| `revision` | the run is a rewrite of what already stands, not a first draft | muted | Doing |

A badge is drawn only when it says something the state beside it does not. `queue` and `draft`
exist in the data and are never drawn: `waiting` in To do already means queued, `writing` already
means a first draft — only a rewrite needs a word, and that word is `revision`. `failed` is a
state, not a badge — the run fell over and asks for a Retry — and the row that carries it wears
`revision` when the run that failed was one, `recheck` when it was a reading. The reason sits in
the row itself (`.kx-doc-why`): red micro text on its own line under the name, two lines at
most, then an ellipsis, whole in the tooltip — a refused Retry writes a new reason there, and a tooltip alone
would hide that anything happened.

A badge is the round pill without the dot: it says what is owed, and a debt has no motion to
show. Round against the state's square corner is the whole difference at a glance.

**A badge beats the state.** Anything carrying `failed` or `review` moves to **Action
needed** whatever its state. A moving input is news, not work, so it is not a badge: `recheck`
says which input in its tooltip, and the drawer's dependency band names it.

Groups: `Action needed` → `Doing` → `To do` → `Done`. The last is collapsed by default — it is
finished, and the not-applicable documents sit inside it with their faint outline.

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
  <span class="kx-badge kx-badge-review">review</span>
  <span class="kx-status kx-status-waiting">waiting</span>
</button>
```

A command card (`.kx-cmd-card`) copies its content on click; the hint lives inside the card, not
in a separate button.

**Bands** sit above a document, and the colour says whose turn it is:

| band | colour | means |
|---|---|---|
| readiness gate `.kx-gate` | blue ground, blue text, no frame | the system is reading |
| related `.kx-doc-readbar` | blue ground, mono head, no frame | who reads this document |
| action needed `.kx-doc-changebar` | amber ground, amber frame and head | your turn: questions and requests |
| dependency `.kx-doc-dependbar` | no ground, plain pink frame | news only: which input is moving |
| open question `.kx-doc-askbar` | amber | yours, and it blocks approval |

Amber is *your turn* everywhere — the `paused` state, the question band, the Action Needed band —
so the one band that asks for a decision wears it too. Pink stays with the badges in the row: it
says a demand exists, the amber band is where it is answered. The dependency band is
hollow and framed because it asks nothing. Every band's head is the group label from § 10, in
mono, so the panel's labels and the document's own labels are one thing.

**Header.** The wordmark — an SVG per theme, swapped by CSS, so the drawing is right on the
first frame. Two drawings, not one recoloured: in light the letters are outlines over sketch
guides (`kor` grey, `te` and half the `x` blueprint blue, `xt` solid ink); in dark they are solid.
The outline strokes are set in screen pixels (`vector-effect: non-scaling-stroke`, 1.25px for
letters, 0.6px for guides), so a mark drawn for a 1344px page still reads at the header's 20px.
The favicon is the icon — the `x` alone, one file per theme, chosen by the `media` attribute on
the `<link>`. And, at the far right, the theme button. Nothing else, unless there is no agent
CLI at all: the engine belongs to a project, so its control sits on the project screen at the
right — read as one faint mono line under Change model and Continue, `claude · sonnet · high`,
and changed through **Change model**, a link-weight button before Continue, which opens the
**dialog** (§9a). What is changed once a day should read all day and be a control only when
asked. A tagline in the chrome is a thing the reader learns once
and then reads forever. The theme button is the one preference that survived, and it is an
icon, not a control row: it takes no width a heading would.

**Update strip** (`.kx-update`), under the heading of either screen: present only when there is
something to say — a newer version on npm. Blue ground and border (the panel's one
informational colour), one sentence, one primary button, and after the install one sentence
again with **Quit** — the process on screen is still the old one; after the quit, one line
saying to start `kortext` again. An error keeps the strip and adds the command to run by hand. The panel asks once on
open and then hourly; the server asks npm at most hourly.

**Status bar** (`.kx-statusbar`), 52px, never wrapping — an application's bar, not a web
page's footer. On the left two stacked lines (`.kx-statusbar-lines`), one column under the
product's own name. First line: the server dot (`.kx-dot`, green up, red down, and the only
thing said while all is well), `kortext` as a link to the repository, the running version in
mono, the ⏻ button (`.kx-power`, armed state in red on the second click), and a warning span
that only carries words when the dot cannot say it (armed, error, stopped). Second line, in the
first line's own columns — a bug mark in the dot's slot, the words starting under `kortext` and
at the same 11px: `Something wrong? Report an issue`, a link to the GitHub bug template with the
running version already filled in — under the thing that broke, never next to the credit. On the right, that
credit: `milowda ♥ istanbul`, a button whose popover lists the other tools. Nothing in the bar
is visible that is not true right now.

**Milowda strip.** Six cards (`.kx-sib-card`) under the project list, the same grid as the
projects; on the project screen one slide (`.kx-slider`) with dots, because six cards there
would push the documents down. A GitHub mark says where a card goes; an unreleased tool says
*in development* and links nowhere. The × arms first (`.kx-siblings-close-armed`) and hides
for good on the second click.

---

## 9a · The dialog

The panel's one centered overlay, and the engine picker is its only tenant. The drawer's
backdrop, the elevated surface, `--r-lg`, `--shadow-lg`; 560px wide, in the middle of the page
because it is a decision, not a document. Three sections under mono eyebrows, the way the CLIs'
own pickers read:

- **CLI** — chips, one on at a time: the drawn-box vocabulary at control height, the chosen one
  filled with the accent; an untested one carries the word.
- **Model** — one row each in a bordered list: a dot mark, the id in mono at a fixed 190px, one
  line about it in the secondary ink. `default` first, "the CLI's own setting". The chosen row
  sits on the accent tint.
- **Effort** — a segment: one bar, equal parts, the chosen one filled; the line under it says
  what the level means. Drawn only for a CLI that has the notion.

Every pick saves at once — there is no Apply for a preference. *Done* and Escape close; ↑↓ walk
the models and ←→ the levels, as the CLIs do, and the footer says so in mono.

## 10 · Document view

The drawer is **880px** wide (`94vw` at most): the bands, tables, code blocks and the design
page use all of it. Prose does not — headings, paragraphs, lists and quotes stop at **100ch**,
left-aligned, so a line never runs past the length an eye carries and the room stays on the
right. The drawer was 720 and read as cramped where a request and its thread stacked; the text
was never the problem, so the text kept its measure.

The markdown the panel renders, on the same seven sizes: body `--fs-body`, headings
`--fs-title` / `--fs-section` / `--fs-heading` — 20 / 18 / 16, all `600`, none underlined. A
fourth level (`####`, `.kx-h4`) is not a heading but a label: the mono `--fs-micro` eyebrow the
panel uses for its group labels, with the rule running out to the right edge. Whitespace and size
carry the hierarchy; a line under a heading was one more thing to read.

Debt wears nothing in the body. A question (`## Questions for Prime`) and a change request
(`## Change Requests`) are asked in the amber band above and not repeated below; a done request is
gone, and a refused one lives under `## Decisions` as a plain line with the reason beneath — a
ledger, no label. (`.kx-outcome` chips — **WAITING** amber, **DENIED** red, **ACCEPTED** green —
survive only for lines written in the older shape.) The outcome line under a settled request folds
into that word's tooltip; the sentence stays in the file.

An open question is always numbered `#n` (`.kx-qno`), and the dash is suppressed on that line —
both fall into the same hanging indent and would overlap. The line has no ground of its own: the
band above already says it is open. Once a note is added (`.noted`) the whole line turns
`--fg-faint` — it has been dealt with, and the eye should pass it; a bar or a ground would keep
pulling the eye back.

**Blockquote** has no ground: a 2px grey rail on the left in `--fg-secondary` ink. The rail is not
a `border` but the **same mechanism as the selection bar** (`box-shadow: inset`), so a blue
selection replaces it instead of sitting beside it. It starts at the heading column
(`margin-left: 8px`), because a rule that overhangs the text it aligns with reads as a margin.

**Alerts** use GitHub's `> [!NOTE]` syntax — five kinds, and each is the blockquote with its rail
and its label in the kind's colour: NOTE blue · TIP green · IMPORTANT violet · WARNING amber ·
CAUTION red. No ground and no icon: grounds belong to the panel's bands, and a callout that
looked like a band looked like something to act on. The label is the mono eyebrow. The block is
parsed as one piece, so a reader asks about the whole alert, not one of its lines.

**Code.** Inline code is a token inside the sentence: 0.9em, `--bg-inset` ground, 4px corner. A
block is a framed panel with a **Copy** button that appears on hover, becomes ✓ *Copied* and
reverts after 1.6s — a code block is there to be taken somewhere, not read. Highlighting comes
from our own painter (`ui/src/highlight.ts`, no dependency), six token kinds from the §2 palette:
keyword/command violet · string green · number amber · JSON key blue · comment `--fg-faint` italic
· flag `--fg-muted`. An unknown or unlabelled language is **not painted at all**, so folder trees
and output dumps stay plain. The painter's one hard rule: text in equals text out.

**Lists and boxes.** A bullet is a hanging dash in `--fg-faint`, 16px wide; a nested item steps
in by one dash and keeps the same dash — depth is told by position, not by a second glyph. A
wrapped line rejoins its own item instead of falling to the left margin. An ordered item keeps
its number, set as a label beside the text (`.kx-ol-n`: `--fs-label`, mono, muted) rather than
as the first word of it. `- [ ]` and `- [x]` are drawn with the § 7 box, and they are
**read-only**: the mark is placed by whoever wrote the document, not by the panel.

**Table.** Rows, not a grid: a hairline under every row, a stronger one under the head, no
vertical lines. The head is the mono eyebrow. Cells keep their left edge on the text column and
their right padding for breath.

**What changed since.** The date beside the name picks a recorded version, and the body is read
against it. A block that replaced an old one wears `[+]` after its last word — press it and the
old text unfolds beneath, faded, on the same edge; `[−]` folds it back. A block that replaced
nothing is simply new, and a faint `new` says so — once, on the first block of a run of new
blocks, because a whole new section is one addition, not twelve. The word is not a control and
does not underline; only the bracket is pressed.

**Proposal diff.** The agent's draft is shown in the editor itself, not in a second box: the whole
document with the changed lines marked, removed in `--red-bg`, added in `--green-bg`, the line
count above and **Edit text** to drop into plain text. Two boxes meant two documents, and the
reader had to merge them in their head.

---

## 11 · Writing

- **Headings, code and names are always English.** Section headings are structure and other
  documents cite them by name; so are file names, commands, table columns, API paths, branches.
- **Prose follows the chosen document language.** Without an explicit choice, use the brief's
  language; for an existing project, use approved documents, then the README, then English.
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

The counts above are the sweep's own; the file has grown since with the drawer, the bands and the
document view, and is measured again only when the next sweep is due.

---

## 14 · The merge (2026-09-12)

Three drawings of Kortext existed: the June design system in `archive/concepts/` (a product
prototype, `kortext.css`), the panel as built (`index.css`), and a proposal for the document body
drawn as a style sheet. They agreed on tokens and disagreed on almost every element. Eray chose
element by element — twenty-six rows, three candidates each — and the result is what this document
now describes. What came from where:

| from June | from the panel | from the proposal |
| --- | --- | --- |
| control height 30px, `--r-md` corner, `--fs-body` on a button | the button families (solid / link) and their hover | the body: dash lists, numbered labels, quote rail |
| the state pill with a dot; the badge as the same pill | the select with its own chevron | callouts with a rail and a mono word, no ground |
| the drawn checkbox with accent fill | group labels, document rows, the two bands | table as rows; the diff mark; the faint noted line |
| the type scale — 20 / 18 / 16 for the three headings | Decisions and Findings as they are | the mono eyebrow as `####` |

The rule that fell out of it: **the panel's labels and the document's labels are one vocabulary.**
A group label in the Action Needed band, the head of the Related band, an `####` in a document
and a table head are all the same mono eyebrow. The reader learns it once.

---

## 15 · The page

`dev/DESIGN.html` is this document drawn: every token, control, state, badge and body block
above, rendered with the panel's own CSS. Open it in a browser. It is regenerated by hand from
`ui/src/index.css` when the CSS changes — it is a picture of the code, never the other way round.

## 16 · Rules

**Do** — build from tokens; leave one primary button per screen; put the destructive action at the
bottom as a quiet link; show state and debt separately; set everything the machine owns in mono;
keep auto as the initial theme and check both light and dark on every change.

**Don't** — invent a state colour (the set is closed); give a persona or category its own colour;
use half-pixel sizes; put two button heights on one screen; carry a warning in colour alone; use
gradients, emoji or decorative SVG.
