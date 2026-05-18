#!/usr/bin/env python3
from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import Path


BACKLOG_ROOT = Path("workspace/memory/backlog")


@dataclass
class Item:
    item_id: str
    title: str
    status: str
    path: Path
    epic: str | None


def parse_item(path: Path) -> Item:
    content = path.read_text()
    header = re.search(r"^# ([TBD]\d+): (.+)$", content, re.M)
    status = re.search(r"> \*\*Status:\*\* (.+)", content)
    epic = re.search(r"> \*\*Epic:\*\* (.+)", content)
    if not header or not status:
        raise ValueError(f"Geçersiz item şablonu: {path}")
    return Item(
        item_id=header.group(1),
        title=header.group(2),
        status=status.group(1).strip(),
        path=path,
        epic=epic.group(1).strip() if epic else None,
    )


def actual_items() -> list[Item]:
    items: list[Item] = []
    for path in BACKLOG_ROOT.glob("*.md"):
        if path.name.endswith("dashboard.md"):
            continue
        if re.match(r"^[TBD]\d+-", path.name):
            items.append(parse_item(path))
    return items


def expected_epic_rows(items: list[Item]) -> set[str]:
    return {
        f"| {item.item_id} | [{item.title}](./{item.path.name}) | {item.epic} | "
        f"{read_assignee(item.path)} | {item.status} |"
        for item in items
        if item.item_id.startswith(("T", "B"))
    }


def expected_debt_rows(items: list[Item]) -> set[str]:
    return {
        f"| {item.item_id} | [{item.title}](./{item.path.name}) | "
        f"{read_assignee(item.path)} | {item.status} |"
        for item in items
        if item.item_id.startswith("D")
    }


def read_assignee(path: Path) -> str:
    match = re.search(r"> \*\*Assignee:\*\* \[(.+)\]", path.read_text())
    return match.group(1) if match else "+persona"


def actual_rows(path: Path) -> set[str]:
    if not path.exists():
        return set()
    return {
        line
        for line in path.read_text().splitlines()
        if re.match(r"^\| [TBD]\d+ \|", line)
    }


def compare(label: str, expected: set[str], actual: set[str]) -> list[str]:
    failures: list[str] = []
    for row in sorted(expected - actual):
        failures.append(f"{label}: eksik satır -> {row}")
    for row in sorted(actual - expected):
        failures.append(f"{label}: beklenmeyen satır -> {row}")
    return failures


def main() -> None:
    items = actual_items()
    failures: list[str] = []
    failures.extend(
        compare(
            "epic-dashboard.md",
            expected_epic_rows(items),
            actual_rows(BACKLOG_ROOT / "epic-dashboard.md"),
        )
    )
    failures.extend(
        compare(
            "debt-dashboard.md",
            expected_debt_rows(items),
            actual_rows(BACKLOG_ROOT / "debt-dashboard.md"),
        )
    )

    if failures:
        print("❌ Backlog dashboard drift tespit edildi:")
        for failure in failures:
            print(f"- {failure}")
        raise SystemExit(1)

    print("✅ Backlog dashboard'ları item dosyalarıyla uyumlu.")


if __name__ == "__main__":
    main()
