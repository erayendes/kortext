#!/usr/bin/env python3
from __future__ import annotations

from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SCAN_ROOTS = ["agents", "rules", "workflows", "scripts", "settings", "workspace"]
FORBIDDEN_PATTERNS = {
    "active-agents": "Eski aktif bağlam klasörü",
    "backlog/v[": "Eski hiyerarşik backlog modeli",
    "workspace/memory/backlog.md": "Eski monolitik backlog referansı",
}


def iter_text_files() -> list[Path]:
    files: list[Path] = []
    for rel in SCAN_ROOTS:
        for path in (ROOT / rel).rglob("*"):
            if path.is_file() and path.suffix in {".md", ".py", ".sh"}:
                if path == Path(__file__).resolve():
                    continue
                files.append(path)
    return files


def main() -> None:
    failures: list[str] = []
    for path in iter_text_files():
        text = path.read_text(errors="ignore")
        for pattern, label in FORBIDDEN_PATTERNS.items():
            if pattern in text:
                failures.append(f"{path.relative_to(ROOT)}: {label} bulundu ({pattern})")

    required_paths = [
        ROOT / "workspace/memory/context",
        ROOT / "workspace/memory/handover.md",
        ROOT / "workspace/memory/decisions.md",
        ROOT / "workspace/memory/learned.md",
        ROOT / "workspace/memory/backlog/version-dashboard.md",
        ROOT / "workspace/memory/backlog/epic-dashboard.md",
        ROOT / "workspace/memory/backlog/debt-dashboard.md",
        ROOT / "workspace/backups",
        # v2.2.0 — yeni scriptler
        ROOT / "scripts/kortext-session-start.py",
        ROOT / "scripts/kortext-context-check.py",
        ROOT / "scripts/kortext-backlog-health.py",
        ROOT / "scripts/kortext-lock.py",
        # v2.2.0 — yeni workflow'lar
        ROOT / "workflows/02b-spike-workflow.md",
        ROOT / "workflows/09-maintenance-cycle.md",
        ROOT / "settings/CHANGELOG.md",
        # v2.3.0 — şablon merkezi
        ROOT / "workspace/templates",
        ROOT / "workspace/templates/TXX-[task-name].md",
        ROOT / "workspace/templates/BXX-[bug-name].md",
        ROOT / "workspace/templates/DXX-[debt-name].md",
        ROOT / "workspace/templates/[agent-name]-active.md",
    ]
    for path in required_paths:
        if not path.exists():
            failures.append(f"{path.relative_to(ROOT)} eksik")

    if failures:
        print("❌ Tutarlılık kontrolü başarısız:")
        for failure in failures:
            print(f"- {failure}")
        raise SystemExit(1)

    print("✅ Kortext çekirdeği tutarlı görünüyor.")


if __name__ == "__main__":
    main()
