#!/usr/bin/env python3
from __future__ import annotations

import argparse
import shutil
import subprocess
from datetime import datetime
from pathlib import Path


BACKLOG_ROOT = Path("workspace/memory/backlog")


def _atomic_commit(message: str, paths: list[str]) -> None:
    # Kortext atomic operation: dosyaları add edip commit'ler.
    if not shutil.which("git"):
        return
    try:
        subprocess.run(["git", "add", "--", *paths], check=True, capture_output=True)
        subprocess.run(
            ["git", "commit", "-m", message, "--", *paths],
            check=True,
            capture_output=True,
        )
    except subprocess.CalledProcessError:
        return


def slugify(title: str) -> str:
    return "-".join(title.lower().split())


def dashboard_path(kind: str) -> Path:
    mapping = {
        "version": BACKLOG_ROOT / "version-dashboard.md",
        "epic": BACKLOG_ROOT / "epic-dashboard.md",
        "debt": BACKLOG_ROOT / "debt-dashboard.md",
    }
    return mapping[kind]


def append_row(path: Path, row: str) -> None:
    content = path.read_text() if path.exists() else ""
    if row not in content:
        if content and not content.endswith("\n"):
            content += "\n"
        content += row + "\n"
        path.write_text(content)


def build_item_content(item_type: str, item_id: str, title: str, persona: str, epic: str | None) -> str:
    date_str = datetime.now().strftime("%Y.%m.%d-%H:%M")
    epic_line = f"> **Epic:** {epic}\n" if epic else ""
    return f"""# {item_id}: {title}
{epic_line}> **Assignee:** [{persona}]
> **Model:** [selected-ai-model]
> **Status:** To Do

---

## Description
{title} açıklaması.

## Acceptance Criteria
- [ ] Code review
- [ ] Quality control
- [ ] Security check

## Dependencies
- [task-id] - [task-name]

## Work Log
- **[{date_str}] ({persona}):** {item_type.capitalize()} oluşturuldu.

## Decisions
- [alınan karar]

## Notes
- [notlar]
"""


def main() -> None:
    parser = argparse.ArgumentParser(description="Kortext Backlog Add Tool")
    parser.add_argument("--type", choices=["task", "bug", "debt"], required=True)
    parser.add_argument("--id", required=True, help="e.g. T01, B01, D01")
    parser.add_argument("--title", required=True)
    parser.add_argument("--persona", default="+persona")
    parser.add_argument("--epic", help="e.g. E01-auth (required for task and bug)")
    parser.add_argument("--no-commit", action="store_true", help="Atomic git commit'i atla")
    args = parser.parse_args()

    if args.type in {"task", "bug"} and not args.epic:
        raise SystemExit("Hata: task ve bug türleri için --epic zorunludur.")

    BACKLOG_ROOT.mkdir(parents=True, exist_ok=True)
    file_path = BACKLOG_ROOT / f"{args.id}-{slugify(args.title)}.md"
    file_path.write_text(build_item_content(args.type, args.id, args.title, args.persona, args.epic))

    if args.type in {"task", "bug"}:
        dashboard = dashboard_path("epic")
        append_row(
            dashboard,
            f"| {args.id} | [{args.title}](./{file_path.name}) | {args.epic} | {args.persona} | To Do |",
        )
    else:
        dashboard = dashboard_path("debt")
        append_row(
            dashboard,
            f"| {args.id} | [{args.title}](./{file_path.name}) | {args.persona} | To Do |",
        )

    print(f"✅ {args.type.capitalize()} oluşturuldu: {file_path}")

    if not args.no_commit:
        _atomic_commit(
            f"chore(kortext): add {args.type} {args.id} [skip ci]",
            [str(file_path), str(dashboard)],
        )


if __name__ == "__main__":
    main()
