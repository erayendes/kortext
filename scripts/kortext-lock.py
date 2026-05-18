#!/usr/bin/env python3
"""
Kortext File Lock
-----------------
Paylaşımlı dosyalara (handover.md, epic-dashboard.md vb.) eş zamanlı yazma
çakışmasını önlemek için dosya kilidi mekanizması sağlar.

Kullanım:
  # Kilitlemek için:
  python kortext-lock.py acquire --file workspace/memory/handover.md --agent backend-developer

  # Kilidi serbest bırakmak için:
  python kortext-lock.py release --file workspace/memory/handover.md

  # Kilit durumunu kontrol etmek için:
  python kortext-lock.py status --file workspace/memory/handover.md
"""
from __future__ import annotations

import argparse
import os
import sys
from datetime import datetime, timedelta
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
LOCK_DIR = ROOT / "workspace/.locks"

# Saniye cinsinden lock timeout. Env var ile override edilebilir.
# Default: 300 saniye = 5 dakika.
LOCK_TIMEOUT_SECONDS = int(os.environ.get("KORTEXT_LOCK_TIMEOUT_SECONDS", "300"))
LOCK_TIMEOUT_MINUTES = LOCK_TIMEOUT_SECONDS / 60


def lock_path(target_file: str) -> Path:
    safe_name = target_file.replace("/", "_").replace("\\", "_")
    return LOCK_DIR / f"{safe_name}.lock"


def acquire(target_file: str, agent: str) -> None:
    LOCK_DIR.mkdir(parents=True, exist_ok=True)
    lp = lock_path(target_file)

    # Stale lock kontrolü — saniye bazında karşılaştırılır.
    if lp.exists():
        content = lp.read_text(errors="ignore")
        lines = content.splitlines()
        # Zaman damgasını parse et
        time_line = next((l for l in lines if l.startswith("time:")), None)
        if time_line:
            try:
                lock_time = datetime.fromisoformat(time_line.split(":", 1)[1].strip())
                age = datetime.now() - lock_time
                if age > timedelta(seconds=LOCK_TIMEOUT_SECONDS):
                    print(
                        f"⚠️  Stale kilit tespit edildi ({round(age.total_seconds()/60, 1)} dakika). "
                        f"Otomatik kaldırılıyor..."
                    )
                    lp.unlink()
                else:
                    owner_line = next((l for l in lines if l.startswith("agent:")), "agent: bilinmiyor")
                    owner = owner_line.split(":", 1)[1].strip()
                    # Türkçe hata mesajı stderr'e — fail durumunda exit 1.
                    print(
                        f"🔒 Kilit alınamadı: {target_file} — sahibi: +{owner}, "
                        f"son güncelleme: {lock_time.strftime('%Y-%m-%d %H:%M:%S')}",
                        file=sys.stderr,
                    )
                    print(
                        f"   Otomatik açılır: {round(LOCK_TIMEOUT_MINUTES, 1)} dakika sonra",
                        file=sys.stderr,
                    )
                    sys.exit(1)
            except (ValueError, IndexError):
                # Parse edilemezse stale say
                lp.unlink()

    # Kilidi al
    now = datetime.now()
    lp.write_text(
        f"agent: {agent}\n"
        f"file: {target_file}\n"
        f"time: {now.isoformat()}\n"
    )
    print(f"✅ Kilit alındı: {target_file} (+{agent})")


def release(target_file: str) -> None:
    lp = lock_path(target_file)
    if lp.exists():
        lp.unlink()
        print(f"✅ Kilit kaldırıldı: {target_file}")
    else:
        print(f"ℹ️  Kilit zaten yok: {target_file}")


def status(target_file: str) -> None:
    lp = lock_path(target_file)
    if not lp.exists():
        print(f"🔓 Serbest: {target_file}")
        return

    content = lp.read_text(errors="ignore")
    lines = content.splitlines()
    agent_line = next((l for l in lines if l.startswith("agent:")), "agent: bilinmiyor")
    time_line = next((l for l in lines if l.startswith("time:")), None)
    agent = agent_line.split(":", 1)[1].strip()
    if time_line:
        try:
            lock_time = datetime.fromisoformat(time_line.split(":", 1)[1].strip())
            age = datetime.now() - lock_time
            stale = age > timedelta(seconds=LOCK_TIMEOUT_SECONDS)
            stale_flag = " ⚠️ STALE" if stale else ""
            print(f"🔒 Kilitli: {target_file}")
            print(f"   Sahibi: +{agent}")
            print(f"   Süre  : {round(age.total_seconds()/60, 1)} dakika{stale_flag}")
        except (ValueError, IndexError):
            print(f"🔒 Kilitli (parse hatası): {target_file}")
    else:
        print(f"🔒 Kilitli: {target_file} (+{agent})")


def list_all() -> None:
    if not LOCK_DIR.exists():
        print("ℹ️  Aktif kilit yok.")
        return
    locks = list(LOCK_DIR.glob("*.lock"))
    if not locks:
        print("ℹ️  Aktif kilit yok.")
        return
    print(f"🔒 Aktif kilitler ({len(locks)} adet):")
    for lp in sorted(locks):
        content = lp.read_text(errors="ignore")
        lines = content.splitlines()
        agent_line = next((l for l in lines if l.startswith("agent:")), "agent: ?")
        file_line = next((l for l in lines if l.startswith("file:")), "file: ?")
        agent = agent_line.split(":", 1)[1].strip()
        file_ref = file_line.split(":", 1)[1].strip()
        print(f"  • {file_ref} → +{agent}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Kortext File Lock Manager")
    sub = parser.add_subparsers(dest="command")

    acq = sub.add_parser("acquire", help="Dosya kilidi al")
    acq.add_argument("--file", required=True, help="Kilitlenecek dosya yolu")
    acq.add_argument("--agent", required=True, help="Kilidi alan ajan (örn: backend-developer)")

    rel = sub.add_parser("release", help="Dosya kilidini kaldır")
    rel.add_argument("--file", required=True, help="Kilidi kaldırılacak dosya yolu")

    stat = sub.add_parser("status", help="Dosya kilit durumu")
    stat.add_argument("--file", required=True, help="Kontrol edilecek dosya yolu")

    sub.add_parser("list", help="Tüm aktif kilitleri listele")

    args = parser.parse_args()

    if args.command == "acquire":
        acquire(args.file, args.agent)
    elif args.command == "release":
        release(args.file)
    elif args.command == "status":
        status(args.file)
    elif args.command == "list":
        list_all()
    else:
        parser.print_help()


if __name__ == "__main__":
    main()
