#!/usr/bin/env python3
"""Write the newest daily items into README.md, between its news markers.

    python readme.py INDEX README

INDEX is the news branch's data/index.json. The list is the 10 newest daily items, each with a
title linked where the item links, its date, and its text below without
the closing link the title already carries. Apps are left out: the README's Recent Apps table,
built from the app catalog, already lists them.
"""

import json
import re
import sys
from datetime import date
from pathlib import Path

ITEMS = 10
LINK = re.compile(r"\[[^\]]+\]\(([^)\s]+)\)")
CLOSING_LINK = re.compile(r"\s*\[[^\]]+\]\([^)\s]+\)\.?$")
START, END = "<!-- news:start -->", "<!-- news:end -->"
NEWS_KINDS = {"model", "api", "product"}


def news_lines(index: dict) -> list[str]:
    lines = []
    for item in [item for item in index["daily"] if item.get("kind") in NEWS_KINDS][:ITEMS]:  # newest first
        title = f"**{item['title']}**"
        link = LINK.search(item["text"])
        day = date.fromisoformat(item["date"])
        text = CLOSING_LINK.sub("", item["text"])
        lines.append(f"- {f'[{title}]({link[1]})' if link else title} <sub>{day:%b} {day.day}</sub><br>{text}")
    return lines


def main() -> None:
    index_path, readme_path = map(Path, sys.argv[1:])
    readme = readme_path.read_text(encoding="utf-8")
    start, end = readme.index(START) + len(START), readme.index(END)
    lines = news_lines(json.loads(index_path.read_text(encoding="utf-8")))
    readme_path.write_text(readme[:start] + "\n" + "\n".join(lines) + "\n" + readme[end:], encoding="utf-8")


if __name__ == "__main__":
    main()
