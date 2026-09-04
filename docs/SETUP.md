# Kortext — Setup Guide

This guide walks you through everything you need to install before using Kortext, with separate instructions for **Windows**, **macOS**, and **Linux / Unix**.

> **Already set up?** Jump straight to [Quick start](#quick-start).

---

## What Kortext is built with

Kortext is a single TypeScript project — backend and frontend live in the same repo and ship as one npm package.

| Layer | Technology | Role |
|---|---|---|
| **Runtime** | Node.js 22 | Executes everything |
| **Language** | TypeScript 5.7 | Frontend and backend share types |
| **HTTP API** | Express 5 | REST server + MCP endpoints |
| **Database** | SQLite (`better-sqlite3`) | File-based — no separate DB server needed |
| **Agent protocol** | MCP SDK | Connects Claude, Codex, Gemini as tools |
| **Dashboard** | React 19 + Vite 7 | Browser UI at `localhost:5173` |
| **Routing** | TanStack Router | Dashboard page navigation |
| **Styling** | Tailwind CSS 4 | Dashboard design |
| **Validation** | Zod | Schema checks on all API input |
| **Config files** | js-yaml | Reads persona / workflow markdown |

> **Why SQLite?** No separate database server to install or manage. Kortext spins up and works immediately after `npm install` — one binary, one file.

---

## What you need

| Requirement | Minimum version | Why |
|---|---|---|
| **Node.js** | 22.0.0 | Kortext runtime |
| **npm** | 10.0.0 | Comes with Node 22 |
| **Git** | 2.38.0 | Per-task worktrees |
| **An AI CLI** | any | The engine that runs agents |

You only need **one** AI CLI — install whichever you have an account for.

---

## macOS

### 1 — Install Homebrew (if you don't have it)

Open **Terminal** (Spotlight → type "Terminal" → Enter) and paste:

```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

Follow the prompts. When it finishes, close and reopen Terminal.

### 2 — Install Node.js 22

```bash
brew install node@22
```

Verify:

```bash
node --version    # should print v22.x.x
npm --version     # should print 10.x.x
```

> **Already have a different Node version?** Use `fnm` (fast Node manager) to keep multiple versions side-by-side:
> ```bash
> brew install fnm
> fnm install 22
> fnm use 22
> fnm default 22
> ```

### 3 — Install Git

macOS ships with a minimal Git. Install the full version:

```bash
brew install git
git --version    # should print git version 2.x.x
```

### 4 — Install an AI CLI

Install at least one. Kortext works with Claude Code, Codex, and Gemini CLI.

**Claude Code** (recommended):
```bash
npm install -g @anthropic/claude-code
claude --version
```

**Gemini CLI:**
```bash
npm install -g @google/gemini-cli
gemini --version
```

**Codex:**
```bash
npm install -g @openai/codex
codex --version
```

Verify the binary is on your path:
```bash
which claude    # → /usr/local/bin/claude  (or similar)
```

### 5 — Install Kortext

```bash
npm install -g kortext
kortext --version    # → 3.x.x
```

---

## Windows

### 1 — Install Windows Terminal (optional but strongly recommended)

Download from the Microsoft Store: search **Windows Terminal** and install it. It handles UTF-8 and colours correctly, which the old `cmd.exe` does not.

### 2 — Install Git for Windows

Download the installer from **git-scm.com/download/win** and run it. Accept all defaults. When asked about the default terminal, choose **Windows Terminal**.

Verify in a new terminal window:
```powershell
git --version    # git version 2.x.x
```

### 3 — Install Node.js 22

**Option A — Official installer (easiest):**

1. Go to **nodejs.org** and download the **LTS** release labelled v22.x.x.
2. Run the installer and accept all defaults.
3. **Important:** on the "Tools for Native Modules" screen, tick **"Automatically install the necessary tools"**. This installs Python and Visual Studio Build Tools, which Kortext's SQLite binding requires.

**Option B — winget (if you use the Windows Package Manager):**
```powershell
winget install OpenJS.NodeJS.LTS
```

After either option, open a new terminal and verify:
```powershell
node --version    # v22.x.x
npm --version     # 10.x.x
```

> **Multiple Node versions?** Use `nvm-windows`:
> 1. Download the installer from **github.com/coreybutler/nvm-windows/releases** → `nvm-setup.exe`.
> 2. After install:
>    ```powershell
>    nvm install 22
>    nvm use 22
>    ```

### 4 — Install an AI CLI

Open a terminal **as Administrator** (right-click → "Run as administrator") and run:

**Claude Code:**
```powershell
npm install -g @anthropic/claude-code
claude --version
```

**Gemini CLI:**
```powershell
npm install -g @google/gemini-cli
gemini --version
```

**Codex:**
```powershell
npm install -g @openai/codex
codex --version
```

### 5 — Install Kortext

In an **Administrator** terminal:
```powershell
npm install -g kortext
kortext --version    # → 3.x.x
```

> **`EACCES` or permission error?** This is a Node global install permissions issue. Fix it by running the terminal as Administrator, or by changing npm's global prefix to a user-writable folder:
> ```powershell
> npm config set prefix "$env:APPDATA\npm"
> ```
> Then add `%APPDATA%\npm` to your `PATH` (System Settings → Environment Variables).

---

## Linux / Unix

Instructions below use `apt` (Ubuntu / Debian). For Fedora / RHEL use `dnf`; for Arch use `pacman`.

### 1 — Install system dependencies

```bash
sudo apt update
sudo apt install -y git curl build-essential python3
```

`build-essential` provides `gcc` and `make`, which Kortext's SQLite native binding needs when compiling from source.

Verify:
```bash
git --version      # git version 2.x.x
python3 --version  # Python 3.x.x
```

### 2 — Install Node.js 22 via nvm

The system `apt` package for Node is usually outdated. `nvm` is the safest approach:

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash
```

Close and reopen your terminal (or run `source ~/.bashrc`), then:

```bash
nvm install 22
nvm use 22
nvm alias default 22
node --version    # v22.x.x
npm --version     # 10.x.x
```

### 3 — Install an AI CLI

```bash
npm install -g @anthropic/claude-code
claude --version
```

Or Gemini / Codex — same as macOS:

```bash
npm install -g @google/gemini-cli     # Gemini
npm install -g @openai/codex          # Codex
```

### 4 — Install Kortext

```bash
npm install -g kortext
kortext --version    # → 3.x.x
```

> **`EACCES` permission error?** Don't use `sudo npm install -g`. Instead, configure npm to install globals into your home directory:
> ```bash
> mkdir -p ~/.npm-global
> npm config set prefix '~/.npm-global'
> echo 'export PATH=~/.npm-global/bin:$PATH' >> ~/.bashrc
> source ~/.bashrc
> npm install -g kortext
> ```

---

## Quick start

Once the prerequisites above are installed, create your first project:

```bash
mkdir my-project
cd my-project
git init
kortext init
```

Then start the runtime:

```bash
kortext serve
```

Open **http://localhost:5173** in your browser. You'll see the Kortext dashboard.

Edit `workspace/references/blueprint.md`, describe what you want to build, and change the frontmatter from `status: draft` to `status: approved`. The orchestrator picks it up within a few seconds.

For a full walkthrough — the board, approval gates, personas, workflows, and MCP integration — see [USER-GUIDE.md](./USER-GUIDE.md).

---

## Verifying everything works

Run this checklist before starting a real project:

```bash
node --version        # v22.x.x ✓
git --version         # 2.x.x ✓
kortext --version     # 3.x.x ✓
which claude          # (or: which gemini / which codex) ✓
kortext doctor        # should report no errors ✓
```

If any step fails, jump to [Troubleshooting](./USER-GUIDE.md#troubleshooting) in the User Guide.

---

## Updating Kortext

```bash
npm update -g kortext
kortext --version
```

---

## Uninstalling

```bash
npm uninstall -g kortext
```

This removes the `kortext` binary. Your project folders (including `.kortext/` data) are untouched — delete them manually if you want a clean slate.
