#!/usr/bin/env python3
from __future__ import annotations

import argparse
import re
import shutil
import subprocess
from pathlib import Path


ALLOWED_TRANSITIONS = {
    "To Do": {"In Progress"},
    "In Progress": {"Test"},
    "Test": {"In Progress", "Review"},
    "Review": {"In Progress", "Done"},
    "Done": set(),
}


def read_status(content: str) -> str:
    match = re.search(r"> \*\*Status:\*\* (.+)", content)
    if not match:
        raise SystemExit("Hata: Item dosyasında status alanı bulunamadı.")
    return match.group(1).strip()


def write_status(content: str, status: str) -> str:
    return re.sub(r"> \*\*Status:\*\* .*", f"> **Status:** {status}", content, count=1)


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
    parser = argparse.ArgumentParser(description="Transition a Kortext item status")
    parser.add_argument("item_path")
    parser.add_argument("--to", required=True, choices=sorted(ALLOWED_TRANSITIONS))
    parser.add_argument("--no-commit", action="store_true", help="Atomic git commit'i atla")
    args = parser.parse_args()

    item_path = Path(args.item_path)
    if not item_path.exists():
        raise SystemExit(f"Hata: Dosya bulunamadı: {item_path}")

    content = item_path.read_text()
    current = read_status(content)
    allowed = ALLOWED_TRANSITIONS.get(current)
    if allowed is None:
        raise SystemExit(f"Hata: Geçersiz mevcut status: {current}")
    if args.to not in allowed:
        raise SystemExit(f"Hata: Geçersiz geçiş: {current} -> {args.to}")

    item_path.write_text(write_status(content, args.to))
    print(f"✅ Geçiş yapıldı: {current} -> {args.to}")

    if not args.no_commit:
        item_id = item_path.stem.split("-", 1)[0]
        slug = args.to.lower().replace(" ", "-")
        _atomic_commit(
            f"chore(kortext): transition {item_id} -> {slug} [skip ci]",
            [str(item_path)],
        )


if __name__ == "__main__":
    main()
