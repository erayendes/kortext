#!/usr/bin/env python3
"""
Kortext Session Start
---------------------
Her oturum açılışında çalışır. Context dosyalarını okur, handover'ı kontrol eder
ve SESSION_BRIEF üretir. Ajan bu özeti görmeden göreve başlamamalıdır.
"""
from __future__ import annotations

import os
from datetime import datetime, timedelta
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
CONTEXT_DIR = ROOT / "workspace/memory/context"
HANDOVER_PATH = ROOT / "workspace/memory/handover.md"
BACKLOG_DIR = ROOT / "workspace/memory/backlog"

# Stale eşiği saat cinsinden. Env var ile override edilebilir.
STALE_HOURS = int(os.environ.get("KORTEXT_STALE_HOURS_CONTEXT", "24"))


def read_context_files() -> list[dict]:
    """Tüm aktif context dosyalarını okur."""
    agents = []
    if not CONTEXT_DIR.exists():
        return agents
    for f in sorted(CONTEXT_DIR.glob("*-active.md")):
        if f.name.startswith("["):  # şablon dosyalarını atla
            continue
        content = f.read_text(errors="ignore").strip()
        mtime = datetime.fromtimestamp(f.stat().st_mtime)
        age_hours = (datetime.now() - mtime).total_seconds() / 3600
        agents.append({
            "file": f.name,
            "content": content,
            "age_hours": round(age_hours, 1),
            "stale": age_hours > STALE_HOURS,
        })
    return agents


def read_last_handover() -> str:
    """handover.md dosyasından en son handover bloğunu döndürür."""
    if not HANDOVER_PATH.exists():
        return "(handover.md bulunamadı)"
    text = HANDOVER_PATH.read_text(errors="ignore")
    # İlk ## Handover: bloğunu bul
    lines = text.splitlines()
    block: list[str] = []
    in_block = False
    for line in lines:
        if line.startswith("## Handover:"):
            if in_block:
                break  # Sadece ilk (en yeni) bloğu al
            in_block = True
        if in_block:
            block.append(line)
    return "\n".join(block) if block else "(kayıtlı handover yok)"


def count_in_progress_items() -> list[str]:
    """Backlog'da In Progress olan itemları döndürür."""
    items = []
    if not BACKLOG_DIR.exists():
        return items
    for f in BACKLOG_DIR.glob("*.md"):
        text = f.read_text(errors="ignore")
        if "**Status:** In Progress" in text:
            items.append(f.stem)
    return items


def main() -> None:
    now = datetime.now().strftime("%d.%m.%Y %H:%M")
    print("=" * 60)
    print(f"  KORTEXT SESSION BRIEF — {now}")
    print("=" * 60)

    # 1. Aktif ajanlar
    agents = read_context_files()
    print(f"\n📋 AKTİF AJANLAR ({len(agents)} dosya):")
    if not agents:
        print("  → Context dosyası yok. Temiz başlangıç.")
    for agent in agents:
        stale_flag = " ⚠️ STALE" if agent["stale"] else ""
        print(f"  • {agent['file']} ({agent['age_hours']}s önce güncellendi{stale_flag})")
        # İlk satırı özetle
        first_line = agent["content"].splitlines()[0] if agent["content"] else ""
        if first_line:
            print(f"    {first_line}")

    # 2. In Progress itemlar
    in_progress = count_in_progress_items()
    print(f"\n🔄 IN PROGRESS İTEMLAR ({len(in_progress)} adet):")
    if not in_progress:
        print("  → Yok.")
    for item in in_progress:
        print(f"  • {item}")

    # 3. Son handover
    print(f"\n📨 SON HANDOVER:")
    handover = read_last_handover()
    # İlk 10 satırı göster
    preview_lines = handover.splitlines()[:10]
    for line in preview_lines:
        print(f"  {line}")
    if len(handover.splitlines()) > 10:
        print(f"  ... ({len(handover.splitlines())} satır — tam okuma için handover.md)")

    # 4. Stale uyarıları
    stale_agents = [a for a in agents if a["stale"]]
    if stale_agents:
        print(f"\n⚠️  STALE CONTEXT UYARISI ({len(stale_agents)} dosya):")
        for a in stale_agents:
            print(f"  • {a['file']} — {a['age_hours']} saat önce güncellendi")
        print("  → Bu dosyalar hala In Progress görünüyor. Kontrol et.")

    print("\n" + "=" * 60)
    print("  Context yüklendi. Göreve başlamadan önce yukarıdaki")
    print("  bilgileri oku ve durumu anla.")
    print("=" * 60)


if __name__ == "__main__":
    main()
