#!/usr/bin/env python3
from __future__ import annotations

import argparse
import re
from pathlib import Path


HANDOVER_PATH = Path("workspace/memory/handover.md")
CONTEXT_ROOT = Path("workspace/memory/context")


def unchecked_items(content: str, section: str) -> list[str]:
    pattern = rf"## {re.escape(section)}\n(.*?)(?:\n## |\Z)"
    match = re.search(pattern, content, re.S)
    if not match:
        return [f"{section} bölümü yok"]
    return re.findall(r"^- \[ \] (.+)$", match.group(1), re.M)


def main() -> None:
    parser = argparse.ArgumentParser(description="Check whether a Kortext item is ready to close")
    parser.add_argument("item_path")
    parser.add_argument("--agent", required=True)
    args = parser.parse_args()

    item_path = Path(args.item_path)
    if not item_path.exists():
        raise SystemExit(f"Hata: Dosya bulunamadı: {item_path}")

    item_id = item_path.stem.split("-", 1)[0]
    content = item_path.read_text()
    failures: list[str] = []

    if "> **Status:** Review" not in content:
        failures.append("Item status `Review` değil")

    for section in ("Acceptance Criteria", "Review Gates"):
        pending = unchecked_items(content, section)
        if pending:
            failures.append(f"{section} eksik: {', '.join(pending)}")

    handover = HANDOVER_PATH.read_text() if HANDOVER_PATH.exists() else ""
    if f"## Handover: {item_id}" not in handover:
        failures.append("Handover kaydı yok")

    context_path = CONTEXT_ROOT / f"{args.agent}-active.md"
    if context_path.exists():
        failures.append(f"Aktif context hâlâ açık: {context_path}")

    if failures:
        print("❌ Item kapanışa hazır değil:")
        for failure in failures:
            print(f"- {failure}")
        raise SystemExit(1)

    print(f"✅ Item kapanışa hazır: {item_id}")


if __name__ == "__main__":
    main()
