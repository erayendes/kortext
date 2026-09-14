# macOS companion — brainstorm (v3.2)

Working document for the `v3.2-macos` branch. Once the decisions settle, the surviving
parts fold into [ARCHITECTURE.md](./ARCHITECTURE.md) as "§ macOS companion" and this file
is deleted.

## Why

The npm package does its job, but the moment the panel tab is closed the user is cut off:
the only way to learn a document has landed is to reopen the browser. And the terminal is
still required for install, start and stop — against the GUI-first principle.

## What: a menu bar agent

One icon in the menu bar. A small SwiftUI app; the engine stays in the npm package.

| State | Menu bar |
| --- | --- |
| `kortext` not on PATH | dimmed icon · "npm i -g kortext" with a copy button |
| daemon down | hollow icon · Start |
| daemon up, idle | solid icon |
| a step is running | pulsing icon · "Writing PRODUCT.md · ACME" |
| drafts awaiting approval | count badge · one line per project: "ACME · 2 documents awaiting approval" → click opens the panel at `http://127.0.0.1:3441/projects/<id>` |

Bottom of the menu: Start / Stop (`kortext` · `kortext --stop`), Launch at login, Quit.

## Notifications — the real value

The user does not keep the panel open; they are told when something needs them. In line
with "silence is a feature": one line per event, no exclamation marks, no sound.

macOS local notifications (`UNUserNotificationCenter`), produced by the app from polling.
Not phone push (APNs) — that needs a server, an Apple account and device registration; the
kortext server never reaches the internet. Out of scope for v3.2.

Four events, each either "a human has to decide" or "the wait is over":

| Event | Source (poll delta) | Text | Click |
| --- | --- | --- | --- |
| Draft ready | job `running → done`, doc `draft` | "PRODUCT.md ready — awaiting approval · ACME" | panel, that document |
| Step failed | job `running → failed` | "ARCHITECTURE.md could not be written · ACME" + first line of `error` | panel, that document |
| Brief too thin | readiness verdict turns `not ready` | "Brief too thin — answer the questions · ACME" | panel, BRIEF |
| Chain complete | `docCounts.settled === total` (newly) | "ACME is ready — AGENTS.md in force" | panel, project |

Not sent: step started, revision running, recheck done, daemon up/down — these show in the
icon, not as notifications. Sent even when the panel is frontmost; Focus / Do Not Disturb is
the user's, the app does not filter.

Source: `jobs.notes` / `jobs.error` (server/db.ts), readiness verdict (server/readiness.ts).
No server change: the delta between polls lives in the app; the last seen job id is kept in
`UserDefaults` so a relaunch does not replay old events.

## How: a plain REST client, zero server changes

Endpoints used (server/app.ts):

- `GET /api/health` — daemon up, version
- `GET /api/projects` — project list + `docCounts`
- `GET /api/projects/:id/jobs` — `running`: the step in progress
- `GET /api/projects/:id/docs` — `status === 'draft'` count = awaiting approval

Poll every 5 s (the panel already polls; SSE would be YAGNI). "New draft" = a job that was
running on the previous poll is now done. Starting the daemon: `Process` spawns `kortext`;
kortext detaches itself (server/daemon.ts), the app only triggers it.

## Skeleton (minimum)

- `macos/Kortext/` — one Xcode project, one target, SwiftUI `MenuBarExtra`, macOS 14+
- Files: `KortextApp.swift` (MenuBarExtra + poll timer), `Api.swift` (three structs +
  `URLSession`), `Menu.swift` (the view). Three files, ~200 lines.
- Notifications: `UNUserNotificationCenter`. Login item: `SMAppService.mainApp`.
- Icon: the existing logo (DESIGN.md) as a template PNG — single colour, menu bar rule.
- Test: one XCTest for the `Api.swift` decode; the rest by hand.

## Distribution — proposal: notarized DMG + Homebrew cask, no App Store

The app spawns the `kortext` CLI; kortext spawns the user's `claude` / `codex` and writes
into arbitrary repo directories. The Mac App Store sandbox blocks all three; working around
it (XPC helper + security-scoped bookmarks) is more work than the app itself. A Developer ID
notarized DMG plus `brew install --cask kortext` is enough. Revisit the App Store only if the
engine ever moves to Swift (not planned).

## Relationship to the npm package — proposal: companion

- **Companion:** the app expects `kortext` to be installed; the engine lives in one place
  (npm), one update channel. Without the app, kortext still works in full. Least work, least
  risk.
- **Replacement:** Node + kortext embedded in the app (~60 MB), no npm needed. Two
  distribution channels, two update paths, and the `claude` CLI is still external — half an
  independence.
- **Separate product:** unrelated to kortext; not this task.

Start as a companion. Embedding Node is added only if "I do not want to install npm" comes
back as feedback.

## Open questions

1. Notifications for "draft ready" only, or "step failed" too? (proposal: both; no other event)
2. Panel opens in the browser, or in a WKWebView window inside the app? (proposal: browser —
   v3.2 is the menu agent, a window is a v3.3 candidate)
3. Same repo (`macos/`) or a separate one? (proposal: same repo; the npm `files` field does
   not include `macos/`, so the package is untouched — to be verified)
