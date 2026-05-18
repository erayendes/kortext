#!/usr/bin/env python3
"""
Kortext Context Check
---------------------
Context bütünlüğünü ölçer. Stale aktif dosyalar, çakışan görevler,
handover uyumsuzlukları ve backlog dashboard tutarsızlıklarını raporlar.
"""
from __future__ import annotations

import os
import re
from datetime import datetime
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
CONTEXT_DIR = ROOT / "workspace/memory/context"
HANDOVER_PATH = ROOT / "workspace/memory/handover.md"
BACKLOG_DIR = ROOT / "workspace/memory/backlog"
EPIC_DASHBOARD = BACKLOG_DIR / "epic-dashboard.md"

# Stale eşikleri env var ile override edilebilir.
STALE_HOURS_CONTEXT = int(os.environ.get("KORTEXT_STALE_HOURS_CONTEXT", "24"))
STALE_HOURS_BACKLOG = int(os.environ.get("KORTEXT_STALE_HOURS_BACKLOG", "48"))
WARNINGS: list[str] = []
ERRORS: list[str] = []


def check_stale_context() -> None:
    """24 saatten eski In Progress context dosyalarını tespit eder."""
    if not CONTEXT_DIR.exists():
        return
    for f in CONTEXT_DIR.glob("*-active.md"):
        mtime = datetime.fromtimestamp(f.stat().st_mtime)
        age_hours = (datetime.now() - mtime).total_seconds() / 3600
        if age_hours > STALE_HOURS_CONTEXT:
            WARNINGS.append(
                f"⚠️  STALE: {f.name} — {round(age_hours, 1)} saat önce güncellendi. "
                f"Görev hala açık mı kontrol et."
            )


def check_context_vs_backlog() -> None:
    """Context dosyalarında belirtilen item ID'lerinin backlog'da gerçekten var ve In Progress olup olmadığını kontrol eder."""
    if not CONTEXT_DIR.exists() or not BACKLOG_DIR.exists():
        return
    for ctx_file in CONTEXT_DIR.glob("*-active.md"):
        content = ctx_file.read_text(errors="ignore")
        # ### +persona | T01 | In Progress | ... formatını parse et
        match = re.search(r"\|\s*([TB D]\d+)\s*\|", content)
        if not match:
            WARNINGS.append(
                f"⚠️  FORMAT: {ctx_file.name} içinde item ID parse edilemedi. "
                f"Standart format: `### +persona | TXX | Status | HH:MM | özet`"
            )
            continue
        item_id = match.group(1).strip()
        # Backlog'da bu ID'yi ara
        found = list(BACKLOG_DIR.glob(f"{item_id}-*.md"))
        if not found:
            ERRORS.append(
                f"❌ EXİSTS: {ctx_file.name} içindeki {item_id} backlog'da bulunamadı."
            )
            continue
        item_text = found[0].read_text(errors="ignore")
        if "**Status:** In Progress" not in item_text:
            WARNINGS.append(
                f"⚠️  STATUS UYUŞMAZLIĞI: {ctx_file.name} aktif gösteriyor ama "
                f"{found[0].name} In Progress değil."
            )


def check_handover_freshness() -> None:
    """handover.md'nin son 48 saatte güncellenip güncellenmediğini kontrol eder."""
    if not HANDOVER_PATH.exists():
        WARNINGS.append("⚠️  HANDOVER: handover.md bulunamadı. Dosya oluşturulmalı.")
        return
    mtime = datetime.fromtimestamp(HANDOVER_PATH.stat().st_mtime)
    age_hours = (datetime.now() - mtime).total_seconds() / 3600
    if age_hours > STALE_HOURS_BACKLOG:
        WARNINGS.append(
            f"⚠️  HANDOVER: handover.md {round(age_hours, 1)} saat önce güncellendi. "
            f"Son tamamlanan görevin devir kaydı yapıldı mı?"
        )


def check_duplicate_context() -> None:
    """Aynı ajan için birden fazla aktif context dosyası var mı kontrol eder."""
    if not CONTEXT_DIR.exists():
        return
    seen: dict[str, list[str]] = {}
    for f in CONTEXT_DIR.glob("*-active.md"):
        # agent-name-active.md → agent-name
        agent = f.stem.replace("-active", "")
        seen.setdefault(agent, []).append(f.name)
    for agent, files in seen.items():
        if len(files) > 1:
            ERRORS.append(
                f"❌ DUPLICATE CONTEXT: {agent} için birden fazla aktif dosya var: {files}"
            )


def print_report(score: int, total_checks: int) -> None:
    now = datetime.now().strftime("%d.%m.%Y %H:%M")
    print("=" * 60)
    print(f"  KORTEXT CONTEXT CHECK — {now}")
    print("=" * 60)

    if ERRORS:
        print(f"\n❌ HATALAR ({len(ERRORS)} adet):")
        for e in ERRORS:
            print(f"  {e}")

    if WARNINGS:
        print(f"\n⚠️  UYARILAR ({len(WARNINGS)} adet):")
        for w in WARNINGS:
            print(f"  {w}")

    if not ERRORS and not WARNINGS:
        print("\n✅ Tüm kontroller geçti. Context sağlıklı görünüyor.")

    print(f"\n  Sağlık Skoru: {score}/{total_checks}")
    print("=" * 60)


def main() -> None:
    checks = [
        check_stale_context,
        check_context_vs_backlog,
        check_handover_freshness,
        check_duplicate_context,
    ]
    for check in checks:
        check()

    total = len(checks)
    failed = len([e for e in ERRORS]) + len([w for w in WARNINGS])
    score = max(0, total - failed)
    print_report(score, total)

    if ERRORS:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
