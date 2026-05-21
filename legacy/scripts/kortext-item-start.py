#!/usr/bin/env python3
from __future__ import annotations

import argparse
import re
import shutil
import subprocess
from datetime import datetime
from pathlib import Path


BACKLOG_ROOT = Path("workspace/memory/backlog")
CONTEXT_ROOT = Path("workspace/memory/context")


def update_status(content: str, status: str) -> str:
    return re.sub(r"> \*\*Status:\*\* .*", f"> **Status:** {status}", content, count=1)


def _atomic_commit(message: str, paths: list[str]) -> None:
    # Kortext atomic operation: dosyaları add edip commit'ler.
    # Git repo değilse, değişiklik yoksa veya hook reddederse sessizce geç.
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
    parser = argparse.ArgumentParser(description="Start a Kortext backlog item")
    parser.add_argument("item_path")
    parser.add_argument("--agent", required=True, help="e.g. backend-developer")
    parser.add_argument("--summary", required=True)
    parser.add_argument("--no-commit", action="store_true", help="Atomic git commit'i atla")
    args = parser.parse_args()

    item_path = Path(args.item_path)
    if not item_path.exists():
        raise SystemExit(f"Hata: Dosya bulunamadı: {item_path}")

    item_id = item_path.stem.split("-", 1)[0]
    content = item_path.read_text()
    item_path.write_text(update_status(content, "In Progress"))

    CONTEXT_ROOT.mkdir(parents=True, exist_ok=True)
    timestamp = datetime.now().strftime("%H:%M")
    context_path = CONTEXT_ROOT / f"{args.agent}-active.md"
    context_path.write_text(
        f"### +{args.agent} | {item_id} | In Progress | {timestamp} | {args.summary}\n"
    )

    print(f"✅ Başlatıldı: {item_id}")
    print(f"✅ Context güncellendi: {context_path}")

    if not args.no_commit:
        _atomic_commit(
            f"chore(kortext): start {item_id} [skip ci]",
            [str(item_path), str(context_path)],
        )


if __name__ == "__main__":
    main()
