#!/usr/bin/env python3
"""
Kortext CLI — Ana Komut Dağıtıcı
---------------------------------
npm install sonrası `kortext` binary'si bu dosyayı çağırır. Tüm alt komutlar
buradan yönlendirilir. Yazılım bilmeyen kullanıcı için Türkçe açıklamalı
komut tablosu içerir.

Standart kütüphane dışında bağımlılığı yoktur. Python 3.10+ gereklidir.
"""
from __future__ import annotations

import argparse
import os
import subprocess
import sys
from pathlib import Path


# Kortext kurulumunun kök dizini. Bu dosya scripts/ altında olduğu için
# bir üst klasör root sayılır.
ROOT = Path(__file__).resolve().parents[1]
SCRIPTS = ROOT / "scripts"
HOOKS = ROOT / "hooks"
WORKFLOWS = ROOT / "workflows"


# Komut → Türkçe açıklama eşlemesi. `kortext help` çıktısında kullanılır.
COMMAND_HELP: list[tuple[str, str]] = [
    ("init", "Kortext'i mevcut çalışma dizinine kur (git hook + lock)."),
    ("start <workflow>", "Workflow dosyasının başlığını ve özetini ekrana bas."),
    ("status", "Aktif ajanları, son handover'ı ve oturum özetini göster."),
    ("check", "Tutarlılık + context + backlog sağlık kontrollerini sırayla çalıştır."),
    ("lock <file>", "Paylaşımlı dosyaya kilit al (eşzamanlı yazma çakışmasını önler)."),
    ("unlock <file>", "Daha önce alınmış kilidi serbest bırak."),
    ("list-locks", "Aktif tüm kilitleri listele."),
    ("handover ...", "Görev devir kaydı oluştur (handover.md'ye satır ekler)."),
    ("add ...", "Backlog'a yeni task/bug/debt item'ı ekle."),
    ("transition ...", "Item status geçişi yap (To Do → In Progress → ...)."),
    ("health", "Backlog sağlık raporunu üret (stale/blocked/review)."),
    ("help", "Bu yardım listesini göster."),
]


def _run_python_script(script_name: str, args: list[str], env_overrides: dict[str, str] | None = None) -> int:
    """Bir Python scriptini subprocess olarak çalıştırır ve exit code'unu döndürür."""
    script_path = SCRIPTS / script_name
    if not script_path.exists():
        print(f"❌ Script bulunamadı: {script_path}", file=sys.stderr)
        return 127

    cmd = [sys.executable, str(script_path), *args]
    env = os.environ.copy()
    if env_overrides:
        env.update(env_overrides)

    # Subprocess çıktısı doğrudan terminale aksın; hata kodunu koruyalım.
    result = subprocess.run(cmd, env=env)
    return result.returncode


def _run_shell_script(script_path: Path, args: list[str], env_overrides: dict[str, str] | None = None) -> int:
    """Bir shell scriptini çalıştırır."""
    if not script_path.exists():
        print(f"❌ Shell script bulunamadı: {script_path}", file=sys.stderr)
        return 127

    cmd = ["bash", str(script_path), *args]
    env = os.environ.copy()
    if env_overrides:
        env.update(env_overrides)

    result = subprocess.run(cmd, env=env)
    return result.returncode


def cmd_init(args: argparse.Namespace) -> int:
    """`kortext init` — kortext-init.sh'i tetikler. Runtime bilgisi env ile geçer."""
    env: dict[str, str] = {}
    if args.runtime:
        env["KORTEXT_RUNTIME"] = args.runtime
    # kortext-init.sh git hook kurulumunu da yapar.
    return _run_shell_script(HOOKS / "kortext-init.sh", ["--install-hooks"], env)


def cmd_start(args: argparse.Namespace) -> int:
    """`kortext start <workflow>` — workflow dosyasının ilk başlığını basar.

    Tam dosya adı bilinmiyorsa numara/anahtar kelimeyle eşleştirir
    (ör. `analysis` → `01a-analysis-pipeline.md`).
    """
    workflow_arg = args.workflow.lower().strip()
    if not WORKFLOWS.exists():
        print(f"❌ workflows klasörü bulunamadı: {WORKFLOWS}", file=sys.stderr)
        return 1

    # En iyi eşleşmeyi bul: dosya adı içinde anahtar kelime geçen ilk dosya.
    candidates = sorted(WORKFLOWS.glob("*.md"))
    matches = [p for p in candidates if workflow_arg in p.stem.lower()]
    if not matches:
        print(f"❌ Eşleşen workflow bulunamadı: '{workflow_arg}'", file=sys.stderr)
        print("\nMevcut workflow'lar:", file=sys.stderr)
        for p in candidates:
            print(f"  • {p.stem}", file=sys.stderr)
        return 1

    target = matches[0]
    text = target.read_text(errors="ignore")
    lines = text.splitlines()
    title_line = next((l for l in lines if l.startswith("# ")), target.stem)

    print("=" * 60)
    print(f"  KORTEXT WORKFLOW BAŞLADI")
    print("=" * 60)
    print(f"\nDosya  : {target.relative_to(ROOT)}")
    print(f"Başlık : {title_line}")
    # Workflow özeti olarak ilk paragrafı yazdır.
    summary_lines: list[str] = []
    in_summary = False
    for line in lines:
        if line.startswith("# "):
            in_summary = True
            continue
        if in_summary:
            if line.startswith("#"):
                break
            if line.strip():
                summary_lines.append(line.strip())
    if summary_lines:
        print(f"\nÖzet  :\n  {summary_lines[0]}")
    print("\n→ Akışı yürütmek için dosyayı oku ve adımları sırayla uygula.")
    return 0


def cmd_status(_args: argparse.Namespace) -> int:
    """`kortext status` — oturum özetini gösterir."""
    return _run_python_script("kortext-session-start.py", [])


def cmd_check(_args: argparse.Namespace) -> int:
    """`kortext check` — üç ardışık sağlık kontrolü çalıştırır."""
    print("🔍 1/3 Tutarlılık kontrolü...")
    rc1 = _run_python_script("kortext-consistency-check.py", [])
    print("\n🔍 2/3 Context kontrolü...")
    rc2 = _run_python_script("kortext-context-check.py", [])
    print("\n🔍 3/3 Backlog sağlık kontrolü...")
    rc3 = _run_python_script("kortext-backlog-health.py", [])

    # Herhangi biri fail ederse non-zero döndür.
    final = rc1 or rc2 or rc3
    print("\n" + ("✅ Tüm kontroller geçti." if final == 0 else "❌ Bir veya daha fazla kontrol başarısız."))
    return final


def cmd_lock(args: argparse.Namespace) -> int:
    """`kortext lock` — kortext-lock.py acquire delegasyonu."""
    return _run_python_script(
        "kortext-lock.py",
        ["acquire", "--file", args.file, "--agent", args.agent],
    )


def cmd_unlock(args: argparse.Namespace) -> int:
    """`kortext unlock` — kortext-lock.py release delegasyonu."""
    return _run_python_script("kortext-lock.py", ["release", "--file", args.file])


def cmd_list_locks(_args: argparse.Namespace) -> int:
    """`kortext list-locks` — kortext-lock.py list delegasyonu."""
    return _run_python_script("kortext-lock.py", ["list"])


def cmd_handover(args: argparse.Namespace) -> int:
    """`kortext handover ...` — kortext-handover.py'ye argümanları aynen aktarır."""
    return _run_python_script("kortext-handover.py", args.passthrough)


def cmd_add(args: argparse.Namespace) -> int:
    """`kortext add ...` — kortext-backlog-add.py'ye argümanları aynen aktarır."""
    return _run_python_script("kortext-backlog-add.py", args.passthrough)


def cmd_transition(args: argparse.Namespace) -> int:
    """`kortext transition ...` — kortext-item-transition.py delegasyonu."""
    return _run_python_script("kortext-item-transition.py", args.passthrough)


def cmd_health(_args: argparse.Namespace) -> int:
    """`kortext health` — kortext-backlog-health.py delegasyonu."""
    return _run_python_script("kortext-backlog-health.py", [])


def cmd_help(_args: argparse.Namespace) -> int:
    """`kortext help` — tüm komutları Türkçe açıklamalı tabloda göster."""
    print("=" * 70)
    print("  KORTEXT KOMUT REFERANSI")
    print("=" * 70)
    print("\nKullanım: kortext <komut> [seçenekler]\n")
    name_width = max(len(name) for name, _ in COMMAND_HELP) + 2
    for name, desc in COMMAND_HELP:
        print(f"  {name.ljust(name_width)} {desc}")
    print("\nDetay için: kortext <komut> --help")
    print("=" * 70)
    return 0


def build_parser() -> argparse.ArgumentParser:
    """Subparser yapısını kurar."""
    parser = argparse.ArgumentParser(
        prog="kortext",
        description="Kortext AI Agent Framework — komut satırı arayüzü.",
        add_help=False,  # `--help` yerine `kortext help` tablosunu tercih ediyoruz.
    )
    parser.add_argument("-h", "--help", action="store_true", help="Yardım göster")
    sub = parser.add_subparsers(dest="command")

    # init
    p_init = sub.add_parser("init", help="Kortext'i mevcut dizine kur")
    p_init.add_argument(
        "--runtime",
        choices=["claude_code", "gemini_cli", "codex"],
        help="Tercih edilen AI runtime (env var olarak iletilir).",
    )
    p_init.set_defaults(func=cmd_init)

    # start
    p_start = sub.add_parser("start", help="Bir workflow başlat")
    p_start.add_argument("workflow", help="Workflow adı veya numarası (ör. analysis, 02b)")
    p_start.set_defaults(func=cmd_start)

    # status
    p_status = sub.add_parser("status", help="Oturum özetini göster")
    p_status.set_defaults(func=cmd_status)

    # check
    p_check = sub.add_parser("check", help="Üç sağlık kontrolünü sırayla çalıştır")
    p_check.set_defaults(func=cmd_check)

    # lock
    p_lock = sub.add_parser("lock", help="Dosya kilidi al")
    p_lock.add_argument("--file", required=True)
    p_lock.add_argument("--agent", required=True)
    p_lock.set_defaults(func=cmd_lock)

    # unlock
    p_unlock = sub.add_parser("unlock", help="Dosya kilidini kaldır")
    p_unlock.add_argument("--file", required=True)
    p_unlock.set_defaults(func=cmd_unlock)

    # list-locks
    p_locks = sub.add_parser("list-locks", help="Aktif kilitleri listele")
    p_locks.set_defaults(func=cmd_list_locks)

    # handover (passthrough)
    p_handover = sub.add_parser("handover", help="Handover kaydı ekle")
    p_handover.add_argument("passthrough", nargs=argparse.REMAINDER)
    p_handover.set_defaults(func=cmd_handover)

    # add (passthrough)
    p_add = sub.add_parser("add", help="Backlog'a item ekle")
    p_add.add_argument("passthrough", nargs=argparse.REMAINDER)
    p_add.set_defaults(func=cmd_add)

    # transition (passthrough)
    p_trans = sub.add_parser("transition", help="Item status'u değiştir")
    p_trans.add_argument("passthrough", nargs=argparse.REMAINDER)
    p_trans.set_defaults(func=cmd_transition)

    # health
    p_health = sub.add_parser("health", help="Backlog sağlık raporu")
    p_health.set_defaults(func=cmd_health)

    # help
    p_help = sub.add_parser("help", help="Yardım tablosu")
    p_help.set_defaults(func=cmd_help)

    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()

    # Komut yoksa veya --help geldiyse yardım göster.
    if getattr(args, "help", False) or not getattr(args, "command", None):
        return cmd_help(args)

    func = getattr(args, "func", None)
    if func is None:
        return cmd_help(args)
    return func(args)


if __name__ == "__main__":
    sys.exit(main())
