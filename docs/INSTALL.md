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

# Update

When a new version is out, the panel says so in a blue strip under the heading — it checks when opened and then every hour.
**Update now** runs the install for you; the new version takes over once you start Kortext again.
If a step is running, the button waits for it to finish.

By hand, or if the button fails:

```sh
npm update -g kortext
npm uninstall -g kortext
```

# Uninstall

Uninstalling removes only Kortext. Your project registry and logs stay in `~/.kortext/`, and your documents stay in your repo.
For a clean slate, delete both yourself.

```sh
npm uninstall -g kortext
```

[README](../README.md) · [INSTALL](INSTALL.md) · [GUIDE](GUIDE.md) · [MACOS](MACOS.md) · [SUPPORT](../.github/SUPPORT.md) · [SECURITY](../.github/SECURITY.md) · [CHANGELOG](CHANGELOG.md)
