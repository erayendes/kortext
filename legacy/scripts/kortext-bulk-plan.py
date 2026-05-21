#!/usr/bin/env python3
from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path


SCRIPT_ADD = Path(__file__).with_name("kortext-backlog-add.py")


def run_add_task(item_type: str, epic: str | None, item_id: str, title: str, persona: str) -> None:
    cmd = [
        sys.executable,
        str(SCRIPT_ADD),
        "--type",
        item_type,
        "--id",
        item_id,
        "--title",
        title,
        "--persona",
        persona,
    ]
    if epic:
        cmd.extend(["--epic", epic])
    subprocess.run(cmd, check=True)


def main() -> None:
    if len(sys.argv) < 2:
        raise SystemExit("Kullanım: kortext-bulk-plan.py <plan.json>")

    data = json.loads(Path(sys.argv[1]).read_text())

    for epic in data.get("epics", []):
        epic_id = epic.get("id")
        for item in epic.get("tasks", []):
            print(f"⌛ Oluşturuluyor: {item.get('id')}...")
            run_add_task(
                item.get("type", "task"),
                epic_id,
                item.get("id"),
                item.get("title"),
                item.get("persona", "+persona"),
            )

    for debt in data.get("debts", []):
        print(f"⌛ Oluşturuluyor: {debt.get('id')}...")
        run_add_task(
            "debt",
            None,
            debt.get("id"),
            debt.get("title"),
            debt.get("persona", "+persona"),
        )

    print("\n🚀 Toplu planlama başarıyla tamamlandı!")


if __name__ == "__main__":
    main()
