#!/usr/bin/env python3
"""Write the newest news highlights into README.md, between its news markers.

    python readme.py INDEX README

INDEX is the news branch's data/index.json. The list is the 12 newest product highlights as
one-liners, linked where the highlight links, with their date. Models and API changes are too
low-level for the README, and apps already have its Recent Apps table.
"""

import json
import re
import sys
from datetime import date
from pathlib import Path

ITEMS = 12
LINK = re.compile(r"\[[^\]]+\]\(([^)\s]+)\)")
START, END = "<!-- news:start -->", "<!-- news:end -->"


def news_lines(index: dict) -> list[str]:
    lines = []
    for item in [item for item in index["highlights"] if item.get("kind") == "product"][:ITEMS]:  # newest first
        link = LINK.search(item.get("text", ""))
        title = f"[{item['title']}]({link[1]})" if link else item["title"]
        day = date.fromisoformat(item["date"])
        lines.append(" ".join(["-", *filter(None, [item.get("emoji"), title]), f"<sub>{day:%b} {day.day}</sub>"]))
    return lines


def main() -> None:
    index_path, readme_path = map(Path, sys.argv[1:])
    readme = readme_path.read_text(encoding="utf-8")
    start, end = readme.index(START) + len(START), readme.index(END)
    lines = news_lines(json.loads(index_path.read_text(encoding="utf-8")))
    readme_path.write_text(readme[:start] + "\n" + "\n".join(lines) + "\n" + readme[end:], encoding="utf-8")


if __name__ == "__main__":
    main()
