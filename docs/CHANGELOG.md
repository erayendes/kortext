# Changelog

🇹🇷 [For Turkish press 1](tr/CHANGELOG.md)

## [Unreleased]

## [3.3.2] — 2026-09-28

- **Menu bar app: no stale beta against an older server.** Talking to a 3.3.0 server, the
  app showed *Beta 3.2-beta9*; it now shows a beta only when the server says it is ahead of the
  release.

## [3.3.1] — 2026-09-28

- **Pick your channel.** Click the version at the bottom left: it lists *Stable* and, when there
  is one newer than the stable release, *Beta*. Pick one and Kortext installs it and keeps
  following that channel. On beta you also get every stable release, and stay on beta for the
  next one. Going back to stable never downgrades: it waits for the next stable release. The
  menu bar app's settings show the same two rows; a pick in either is a pick in both.
- **No stale beta.** A beta older than the stable release is no longer offered (3.3.0 showed
  *Try beta version 3.2-beta9*).

## [3.3.0] — 2026-09-28

- **The document drawer, rebuilt.** At the top, the document's name and state; on the right
  **⋯**, **Approve** and **Close**. Edit and Export live in the ⋯ menu. Click the document's name
  and its earlier versions open; pick a date and the text shows what changed since that version.
- **Asking on the left, deciding on the right.** In the box under a row, **Ask** and **Get a
  suggestion** are always on the left, the decisions on the right: **Add answer** on a question,
  **Add note** on a line, **Reject · Accept** on a request. Deny and Discard became one word:
  *Reject*. Enter starts a new line everywhere; a button sends. The checkboxes are gone.
- **Requests show their direction with an arrow.** An incoming request reads `→ STACK`, an
  outgoing one `← BRIEF`.
- **Tags.** A decided row says **ANSWERED**, **ACCEPTED** or **REJECTED**; in the text, a line ends
  with **NOTE #1**, **CHANGED**, **NEW** or **SUGGESTION**. Capitals belong to tags, not to
  buttons. **SUGGESTION** marks a line the persona did not find in the inputs but proposes itself.
- **Apply opens once everything is decided.** Until then it says how many are (`2 of 3
  decided`), so the document is rewritten once. While it is written, it reads **Writing…**.
- **Apply on the brief really works.** The brief with the accepted requests worked in opens as a
  draft in the editor; **Save** updates the brief and closes the requests. Before, the button
  either stayed grey or the draft closed as soon as it opened.
- **A hand edit is reviewed.** Correct a document an agent writes and save it, and it goes back to
  draft while its author reads your change: it closes the requests the change carries and asks
  you, as a question, about anything left open or contradicted. *Save, requests done* is gone.
- **However the brief changes.** Change the brief outside the panel, in an editor, and the
  documents that read it are still checked again against the new brief.
- **Continue says why.** With the brief unapproved, Continue no longer answers "started" and does
  nothing; it says the brief needs approving.
- **Effort on Antigravity.** An effort level a model does not take never reaches the command; on
  a model switch an unfit level falls back to the default, and the picker offers only that
  model's levels. Before, the brief check failed on it and the chain stood still.
- **The handshake card, simpler.** Title and document count on the left, an **Export documents**
  button on the right; no need to open the gear. The EXPERIENCE offer sits first, at the command
  cards' own weight — the one thing still to decide, above the three ways to start. The prose
  is gone.
- **A project code is exactly three letters or digits.**

## [3.2.0] — 2026-09-20

- **EXPERIENCE.md, on request.** One more document, offered at the handshake rather than
  queued by the chain: the brief a design AI needs — journeys, every screen with its states,
  the copy word for word — and the prompts to paste, one master and one per journey, for any
  design tool. Press *Write EXPERIENCE.md* on the handshake card, with the engine and model of
  your choice above it; skip it if the design is already in hand. `DESIGN.md` documents a
  design the project folder already holds instead of inventing one. After the handshake the
  document is the project owner's to update.
- **n/a is prime's call.** A document the author judges not to apply no longer settles on its
  own: it arrives as `n/a?` under Action Needed, and *Approve n/a* is what settles it. A note
  and a revision send the author back to write it after all.
- **Export.** A document leaves the panel as a file: **Export** in the drawer saves the open
  one, **Export documents** under the project's gear lists every written document — All, None,
  or pick — and downloads the chosen ones as one zip. `.kortext/` is a hidden folder a file
  picker will not show; this is how `EXPERIENCE.md` reaches a design AI.
- **The thread stays where the answer is.** A click elsewhere folds a line's question box; a
  click on the answer reopens it for the follow-up; × on the thread closes it. *Suggest* shows
  only where the author has something to suggest — a question or a request — not on a plain
  line.

- **A menu bar app for macOS.** `Kortext.zip` on the release, notarized, updating itself. One
  card per project with the documents that wait on you — `approve`, `review`, `failed` — and
  the ones being written, grey; a row opens the panel on that document. ⏻ starts the server
  or, pressed twice, stops it; the app stays. Opening the app brings the server up with it. A
  notification when a document lands, a step fails, a brief is sent back or a chain settles,
  in the project's language, opening the panel where it happened. On a Mac without it, the
  panel offers it in the update strip's slot — one strip at a time.
- **The engine line is the control.** `codex · default · high ›` beside Start opens the
  picker; *Change model* is gone. Add project carries the same line and the same picker, the
  effort always named.
- **⚙ beside the project's name** unfolds Restart, Archive and Remove under the path, each
  arming in place; the page's foot is empty. Restart wears amber. After the handshake the
  engine line and its controls go — kortext has retired from that project.
- **Approve anyway.** A draft that still carries a template line verbatim is refused as
  before, but the panel now names the line — a click jumps to it — and the way to insist
  waits at the foot of the drawer, beside Request revision, until you are done reading.
- **Stable version / Try beta version.** Two rows in the app's settings, each showing the
  newest of its kind and whether it is what you run. Press one to install it — the server
  restarts and the app follows to the same channel; press the other to go back. The panel's
  status bar carries the same pair: the running channel, a press away from a check, and the
  other, a press away from installing it. The update strip follows your channel.
- **Short versions** everywhere: `3.2-beta3`, `3.2`, `3.1.2`.
- **Continue holds** until the step is seen running; a second press no longer pauses it
  again. A pause made elsewhere — the menu bar app, another tab — reaches the panel.
- Two URLs reach in: `/?project=<id>` and `/?project=<id>&doc=<rel>`. The other tools sit
  under the documents, not above them. Remove's warning no longer mentions Kopeng.

## [3.1.2] — 2026-09-14

- **The update strip shows.** Under the heading of either screen, blue, the button at the
  right, instead of a grey line under the header that read like any other card. After the
  install it offers **Quit**, so the restart is one press and a `kortext`. The panel checks for a release when opened and then every hour, and
  the server asks npm at most hourly instead of every six — a release lands on a panel that
  has been open all day.

## [3.1.1] — 2026-09-14

- **Change model.** The CLI, model and effort read as one line under the buttons, at the
  right of the project's name — `claude · sonnet · high` — and are changed in a picker that reads like the CLIs' own: chips,
  a model list with a line about each, an effort segment. Every pick saves at once.
- **Effort, per project.** A third pick in the same dialog, for the CLIs that have the
  notion: `claude --effort`, codex's `model_reasoning_effort`, `agy --effort` — with the levels
  and models each CLI's own picker offers.
- The failure reason sits on its own line under the document's name, two lines before it is
  cut; prose in the drawer runs to 100 characters.
- **The mark.** New wordmark and icon: outlines over sketch guides in light, solid in dark,
  the `x` alone as the favicon. Panel header, README and favicon use them.
- **A wider drawer.** 880px, up from 720, for the bands, tables, code and the design page;
  prose keeps a 78-character measure.
- **One decision per request.** Accepting an outgoing request on the document that asks
  lands it at the target already ticked — *accepted there* — so the same person is not asked
  twice; it can still be unticked, and it goes into the target's next rewrite with everything
  else owed there. Send became Accept.
- **A sent tray belongs to one document.** After Apply the tray stayed read-only — no ×, Apply
  greyed — on the next document opened, and forever when the rewrite landed while the drawer
  was closed, so notes from one document sat unticked on another. It now clears when the
  document, its version, or the run's outcome moves on.
- **Suggest, then take the answer.** Beside Ask, **Suggest** asks the author what it would do
  without typing a word; under every reply, **Use as my answer** makes it your note on the
  question in one press — on a request row it fills the note box for Accept or Deny.
- **The design preview reads what designers write.** Tokens named `color.primary` as well as
  `--color-primary`; `light #X, dark #Y` on one bullet; `space.md = 16` in prose, drawn as px.
  A real DESIGN.md that used to render as "no decided tokens" now draws its palette in both
  modes.
- **The brief drafts, it does not accept.** A request aimed at the brief shows **Draft the
  change** in its row instead of a disabled Accept whose reason lived in a tooltip.

## [3.1.0] — 2026-09-14

The first public release.

What was published under this name before 3.1.0 was a different tool. I used it personally and never released it. This one starts from a similar place, but it is a new product.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and Kortext follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
