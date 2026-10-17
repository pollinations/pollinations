#!/usr/bin/env python3
"""Write the newest news highlights into README.md, between its news markers.

    python readme.py INDEX README

INDEX is the news branch's data/index.json. The list is the 12 newest model, API and product
highlights as one-liners: a category badge, the title linked where the highlight links, and the
date. Apps are left out because the README's Recent Apps table already lists them.
"""

import json
import re
import sys
from datetime import date
from pathlib import Path

ITEMS = 12
LINK = re.compile(r"\[[^\]]+\]\(([^)\s]+)\)")
START, END = "<!-- news:start -->", "<!-- news:end -->"
BADGES = {"model": ("Model", "8b5cf6"), "api": ("API", "0ea5e9"), "product": ("Feature", "f59e0b")}
BADGE = '<img src="https://img.shields.io/badge/{0}-{1}?style=flat-square" alt="{0}" align="top">'


def news_lines(index: dict) -> list[str]:
    lines = []
    for item in [item for item in index["highlights"] if item.get("kind") in BADGES][:ITEMS]:  # newest first
        title = f"{BADGE.format(*BADGES[item['kind']])} {item['title']}"
        link = LINK.search(item.get("text", ""))
        day = date.fromisoformat(item["date"])
        lines.append(f"- {f'[{title}]({link[1]})' if link else title} <sub>{day:%b} {day.day}</sub>")
    return lines


def main() -> None:
    index_path, readme_path = map(Path, sys.argv[1:])
    readme = readme_path.read_text(encoding="utf-8")
    start, end = readme.index(START) + len(START), readme.index(END)
    lines = news_lines(json.loads(index_path.read_text(encoding="utf-8")))
    readme_path.write_text(readme[:start] + "\n" + "\n".join(lines) + "\n" + readme[end:], encoding="utf-8")


if __name__ == "__main__":
    main()
