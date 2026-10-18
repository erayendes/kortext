"""Print a version's changelog sections, English then Turkish, as GitHub release notes.

Usage: release-notes.py <version>   (3.4.1, without the v)
"""

import os
import re
import sys

version = sys.argv[1]
repo = os.environ.get("GITHUB_REPOSITORY", "erayendes/kortext")
base = f"https://github.com/{repo}/blob/v{version}/docs"


def section(path: str) -> str:
    text = open(path, encoding="utf-8").read()
    found = re.search(
        rf"^## \[{re.escape(version)}\][^\n]*\n(.*?)(?=^## \[|\Z)", text, re.S | re.M
    )
    # The changelog is wrapped at 100 columns; a release page would keep each break.
    return re.sub(r"\n +(?=\S)", " ", found.group(1).strip()) if found else ""


parts = []
for title, path, link in [
    ("English", "docs/CHANGELOG.md", f"{base}/CHANGELOG.md"),
    ("Türkçe", "docs/tr/CHANGELOG.md", f"{base}/tr/CHANGELOG.md"),
]:
    body = section(path)
    if body:
        parts.append(f"### {title}\n\n{body}\n\n[{path}]({link})")
print("\n\n".join(parts) or f"[docs/CHANGELOG.md]({base}/CHANGELOG.md)")
