"""Print a version's section of docs/CHANGELOG.md as GitHub release notes.

Usage: release-notes.py <version>   (3.4.1, without the v)
"""

import os
import re
import sys

version = sys.argv[1]
repo = os.environ.get("GITHUB_REPOSITORY", "erayendes/kortext")
text = open("docs/CHANGELOG.md", encoding="utf-8").read()
section = re.search(
    rf"^## \[{re.escape(version)}\][^\n]*\n(.*?)(?=^## \[|\Z)", text, re.S | re.M
)
body = section.group(1).strip() if section else ""
# The changelog is wrapped at 100 columns; a release page would keep each break.
body = re.sub(r"\n +(?=\S)", " ", body)
base = f"https://github.com/{repo}/blob/v{version}/docs"
print(body + "\n\n" if body else "", end="")
print(f"[Changelog]({base}/CHANGELOG.md) · [Türkçe]({base}/tr/CHANGELOG.md)")
