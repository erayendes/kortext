# Install

🇹🇷 [For Turkish press 1](tr/INSTALL.md)

**Node 22 or newer** and at least one agent CLI on your PATH (`claude`, `codex`, `antigravity` or another) is all you need.

After that it is one command in the terminal:

```sh
npm install -g kortext
```

When the install finishes, type `kortext`. The server comes up, your browser opens, and the Kortext panel is in front of you. That is all. What comes next is in the [GUIDE](GUIDE.md); on a Mac, the menu bar app is in [MACOS](MACOS.md).

> [!NOTE]
> You give Kortext no key; it uses the subscription behind the CLI you already use. Cursor, Copilot, OpenCode, Amp, Droid, Goose, Qwen Code and Cline have their definitions ready too.
> The server uses port 3441; change it with `--port` if you like.
> Your data lives in one global SQLite database: `~/.kortext/kortext.db`. Change that with `--db`.
> If `kortext` starts but cannot open its database, install once more with the script allowed:

```sh
npm install -g --allow-scripts=better-sqlite3 kortext
```

> [!WARNING]
> Windows support is experimental. Kortext is developed and tested on macOS and Linux. The Windows-specific parts were written, but have not been run on a real Windows machine.
> If something does not work, please [open an issue](https://github.com/erayendes/kortext/issues); the fault is most likely not in your setup.

<details>
<summary><b>Setting up Node 22 and an agent CLI</b></summary>
<br/>

**Node 22 on macOS**

```sh
brew install node@22
```

**Node 22 on Windows** — install Node 22 from **nodejs.org** (the LTS labelled v22.x). On the *Tools for Native Modules* screen, tick **"Automatically install the necessary tools"**; Kortext's SQLite binding needs them. `EACCES` or a permission error on the global install? Point npm's global folder at one you own instead of opening an admin shell:

```powershell
npm config set prefix "$env:APPDATA\npm"
```

and add `%APPDATA%\npm` to your `PATH`.

**Linux**

```sh
sudo apt install -y curl build-essential python3      # gcc/make for the SQLite binding
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash
nvm install 22 && nvm alias default 22
```

Do not `sudo npm install -g`. On `EACCES`: `npm config set prefix ~/.npm-global`, then put `~/.npm-global/bin` on your `PATH`.

**An agent CLI**

```sh
npm install -g @anthropic-ai/claude-code    # claude
npm install -g @openai/codex                # codex
npm install -g @google/gemini-cli           # gemini
```
</details>

# Update

When a new version is out, the panel says so in a blue strip under the heading — it checks when opened and then every hour.
**Update now** runs the install for you; the new version takes over once you start Kortext again.
If a step is running, the button waits for it to finish.

By hand, or if the button fails:

```sh
npm update -g kortext
```

# Uninstall

Uninstalling removes only Kortext. Your project registry and logs stay in `~/.kortext/`, and your documents stay in your repo.
For a clean slate, delete both yourself.

```sh
npm uninstall -g kortext
```

[README](../README.md) · [INSTALL](INSTALL.md) · [GUIDE](GUIDE.md) · [MACOS](MACOS.md) · [SUPPORT](../.github/SUPPORT.md) · [SECURITY](../.github/SECURITY.md) · [CHANGELOG](CHANGELOG.md)
