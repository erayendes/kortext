# Changelog

🇹🇷 [For Turkish press 1](tr/CHANGELOG.md)

## [Unreleased]

- **The engine line.** The CLI, model and effort sit under the project's name as one line —
  `claude · sonnet · high` — and become three fixed-width dropdowns when pressed.
- **Effort, per project.** A third dropdown beside the model, for the CLIs that have the
  notion: `claude --effort`, codex's `model_reasoning_effort`, `agy --effort` — with the levels
  and models each CLI's own picker offers.
- The failure reason in a row wraps to two lines before it is cut; prose in the drawer runs to
  100 characters.
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
