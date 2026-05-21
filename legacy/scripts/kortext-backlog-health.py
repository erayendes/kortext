#!/usr/bin/env python3
"""
Kortext Backlog Health
----------------------
Backlog'un genel sağlık durumunu raporlar. Blocker itemlar, stale In Progress'ler,
review bekleyenler ve hazır (başlanabilir) itemlar özetlenir.
"""
from __future__ import annotations

import os
import re
from datetime import datetime
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
BACKLOG_DIR = ROOT / "workspace/memory/backlog"
# In Progress backlog item'larının stale eşiği. Env var ile override edilebilir.
STALE_HOURS = int(os.environ.get("KORTEXT_STALE_HOURS_BACKLOG", "48"))

STATUS_PATTERN = re.compile(r"\*\*Status:\*\*\s*(.+)")
BLOCKED_BY_PATTERN = re.compile(r"\*\*Blocked By:\*\*\s*(.+)")
RISK_PATTERN = re.compile(r"\*\*Risk:\*\*\s*(Blocker|High|Critical)", re.IGNORECASE)


def parse_items() -> list[dict]:
    items = []
    if not BACKLOG_DIR.exists():
        return items
    for f in sorted(BACKLOG_DIR.glob("[TBD]*.md")):
        text = f.read_text(errors="ignore")
        status_m = STATUS_PATTERN.search(text)
        blocked_m = BLOCKED_BY_PATTERN.search(text)
        risk_m = RISK_PATTERN.search(text)

        status = status_m.group(1).strip() if status_m else "?"
        has_blocker = blocked_m is not None and blocked_m.group(1).strip() not in ("", "-", "Yok")
        is_high_risk = risk_m is not None
        mtime = datetime.fromtimestamp(f.stat().st_mtime)
        age_hours = (datetime.now() - mtime).total_seconds() / 3600

        items.append({
            "id": f.stem,
            "status": status,
            "has_blocker": has_blocker,
            "is_high_risk": is_high_risk,
            "age_hours": round(age_hours, 1),
            "stale": status == "In Progress" and age_hours > STALE_HOURS,
        })
    return items


def compute_score(items: list[dict]) -> tuple[int, int]:
    """Basit sağlık skoru: toplam item sayısı üzerinden sorunlu itemları düşür."""
    total = len(items)
    if total == 0:
        return 100, 100
    problems = sum(1 for i in items if i["stale"] or i["has_blocker"])
    score = max(0, round((1 - problems / total) * 100))
    return score, 100


def main() -> None:
    items = parse_items()
    now = datetime.now().strftime("%d.%m.%Y %H:%M")

    # Grupla
    todo = [i for i in items if i["status"] == "To Do" and not i["has_blocker"]]
    in_progress = [i for i in items if i["status"] == "In Progress"]
    review = [i for i in items if i["status"] == "Review"]
    blocked = [i for i in items if i["has_blocker"] or i["status"] == "Blocked"]
    stale = [i for i in items if i["stale"]]
    done = [i for i in items if i["status"] == "Done"]
    score, max_score = compute_score(items)

    print("=" * 60)
    print(f"  KORTEXT BACKLOG HEALTH — {now}")
    print("=" * 60)
    print(f"\n  Toplam item       : {len(items)}")
    print(f"  ✅ Başlanabilir    : {len(todo)}")
    print(f"  🔄 In Progress     : {len(in_progress)}")
    print(f"  👀 Review bekliyor : {len(review)}")
    print(f"  🚫 Bloklu          : {len(blocked)}")
    print(f"  ⚠️  Stale ({STALE_HOURS}s+)   : {len(stale)}")
    print(f"  ✔️  Done            : {len(done)}")

    if blocked:
        print(f"\n  🚫 BLOKLANAN İTEMLAR:")
        for i in blocked:
            print(f"    • {i['id']} ({i['status']})")

    if stale:
        print(f"\n  ⚠️  STALE İTEMLAR:")
        for i in stale:
            print(f"    • {i['id']} — {i['age_hours']} saat önce güncellendi")

    if review:
        print(f"\n  👀 REVIEW BEKLEYENLER (+prime aksiyonu gerekebilir):")
        for i in review:
            print(f"    • {i['id']}")

    bar_filled = int(score / 5)
    bar = "█" * bar_filled + "░" * (20 - bar_filled)
    print(f"\n  Sağlık Skoru: {score}/{max_score}  [{bar}]")
    print("=" * 60)

    if score < 50:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
