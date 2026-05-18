#!/usr/bin/env python3
from __future__ import annotations

import argparse
import shutil
import subprocess
from datetime import datetime
from pathlib import Path


HANDOVER_PATH = Path("workspace/memory/handover.md")


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


def main() -> None:
    parser = argparse.ArgumentParser(description="Append a Kortext handover entry")
    parser.add_argument("--item", required=True, help="e.g. T01-login-form")
    parser.add_argument("--title", required=True)
    parser.add_argument("--author", required=True)
    parser.add_argument("--to", required=True, help="Devralan ajan veya 'none' (görev Done)")
    parser.add_argument(
        "--status",
        required=True,
        choices=["completed", "blocked", "partial"],
        help="Görev durumu: completed | blocked | partial",
    )
    parser.add_argument("--completed", required=True)
    parser.add_argument("--context", required=True, help="Bir sonraki ajanın mutlaka bilmesi gereken kritik bağlam")
    parser.add_argument("--changed-file", action="append", default=[])
    parser.add_argument("--watch-out", action="append", default=[])
    parser.add_argument("--last-commit", required=True)
    parser.add_argument("--next-step", required=True)
    parser.add_argument("--no-commit", action="store_true", help="Atomic git commit'i atla")
    args = parser.parse_args()

    STATUS_LABELS = {
        "completed": "Tamamlandı",
        "blocked": "Bloklandı",
        "partial": "Kısmen tamamlandı",
    }

    existing = HANDOVER_PATH.read_text() if HANDOVER_PATH.exists() else "# Handover Reports\n"
    date = datetime.now().strftime("%d.%m.%y-%H:%M")
    to_label = "Yok — görev Done" if args.to.lower() == "none" else f"+{args.to}"
    changed_files = "\n".join(f"- {entry}" for entry in args.changed_file) or "- Yok"
    watch_outs = "\n".join(f"- {entry}" for entry in args.watch_out) or "- Yok"

    block = f"""## Handover: {args.item} — {args.title}

> [!INFO]
> - **Author:** +{args.author}
> - **To:** {to_label}
> - **Date:** {date}
> - **Status:** {STATUS_LABELS[args.status]}

### ✅ Completed

- {args.completed}

### Changed Files

{changed_files}

### Kritik Bağlam

- {args.context}

### Watch-outs & Decisions

{watch_outs}

### Last Commit

- {args.last_commit}

### Next Steps

- {args.next_step}

"""
    HANDOVER_PATH.write_text(block + existing)
    print(f"✅ Handover eklendi: {args.item} [{STATUS_LABELS[args.status]}]")

    if not args.no_commit:
        _atomic_commit(
            f"chore(kortext): handover {args.item} ({args.status}) [skip ci]",
            [str(HANDOVER_PATH)],
        )


if __name__ == "__main__":
    main()

