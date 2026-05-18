# Kortext

**AI Agent Framework for Autonomous Project Management**

Kortext is a structured framework that enables AI agent teams (Claude Code, Gemini CLI, Codex) to run software projects autonomously — with minimal human intervention.

---

## What is Kortext?

Most AI agents are reactive: they answer questions or complete isolated tasks. Kortext turns them into an **autonomous team** that can:

- Analyze a product idea and produce a full backlog
- Pick up tasks, write code, run tests, and deploy
- Hand off work between agents without losing context
- Lock files to prevent concurrent edits
- Enforce conventions via git hooks

No coding knowledge required. You describe what you want to build — Kortext agents handle the rest.

---

## Quick Start

```bash
# Install
npm install -g kortext

# In your project directory
kortext init

# Fill in the blueprint (describes your product)
# workspace/references/blueprint.md

# Then tell your AI agent:
# !start analysis
```

---

## Architecture

```
kortext/
├── agents/          # 14 persona definitions (operation-manager, backend-dev, qa...)
├── workflows/       # 12 workflow pipelines (analysis, planning, dev, deploy...)
├── hooks/           # 16 git + runtime hooks (lock, audit, secret-scan, snapshot...)
├── scripts/         # 13 Python automation scripts (backlog, handover, health...)
├── rules/           # Behavior rules, commands, branching strategy
├── settings/        # Config, runtime adapters (Claude/Gemini/Codex), INTEGRATION-MAP
├── skills/          # Per-persona skill folders (populate with your stack)
└── workspace/       # Memory, backlog, references, templates, reports
```

---

## Supported Runtimes

| Runtime | Hook Integration |
|---|---|
| **Claude Code** | PreToolUse / PostToolUse / SessionStart |
| **Gemini CLI** | preToolCall / postToolCall |
| **Codex / Generic** | AGENTS.md baseline |

---

## Key Commands

| Command | What happens |
|---|---|
| `kortext init` | Set up hooks + runtime adapter in your project |
| `kortext help` | List all available commands |
| `!start analysis` | Agent team analyzes your blueprint |
| `!start planning` | Agent team builds your backlog |
| `!start development` | Agents pick tasks and start coding |
| `kortext status` | Show active sessions and locks |
| `kortext health` | Check backlog and context consistency |

---

## Requirements

- Node.js ≥ 14
- Python ≥ 3.10
- Git

---

## License

MIT © Eray Endes
