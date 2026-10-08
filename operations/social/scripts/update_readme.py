import os
import re
import json
import argparse

INDEX_PATH = "operations/social/news/index.json"
README_PATH = "README.md"
MAX_README_ENTRIES = 10


def get_top_highlights(index: dict, count: int = MAX_README_ENTRIES) -> list[str]:
    """The newest highlights from index.json as README bullets."""
    return [
        f"- **{item['date']}** – **{item.get('emoji', '✨')} {item['title']}** {item['text']}"
        for item in index.get("highlights", [])[:count]
    ]


def update_readme_news_section(readme_content: str, new_entries: list[str]) -> str:
    """Update the '## 🆕 Latest News' section in README with new entries"""

    # Check if section exists
    if '## 🆕 Latest News' not in readme_content:
        print("Warning: '## 🆕 Latest News' section not found in README")
        return None

    # Pattern to find the Latest News section
    # It starts with "## 🆕 Latest News" and ends before "---", next "##" section, or EOF
    pattern = r'(## 🆕 Latest News\s*\n)(.*?)(---|\n## |$)'

    def replacement(match):
        header = match.group(1)
        ending = match.group(3)
        # Build new content with entries
        new_content = '\n'.join(new_entries) + '\n'
        return header + new_content + ending

    # Use re.DOTALL to match across newlines
    updated_readme = re.sub(pattern, replacement, readme_content, flags=re.DOTALL)

    return updated_readme


def update_readme_local(index_path: str, readme_path: str) -> bool:
    """Read index.json and README.md from disk, update README in place.

    Returns True if README was modified, False otherwise.
    """
    if not os.path.exists(index_path):
        print(f"News index not found: {index_path}")
        return False

    with open(index_path, "r", encoding="utf-8") as f:
        index = json.load(f)

    top_entries = get_top_highlights(index, MAX_README_ENTRIES)
    if not top_entries:
        print("No highlight entries found.")
        return False

    if not os.path.exists(readme_path):
        print(f"README file not found: {readme_path}")
        return False

    with open(readme_path, "r") as f:
        readme_content = f.read()

    updated_readme = update_readme_news_section(readme_content, top_entries)
    if not updated_readme or updated_readme == readme_content:
        print("No changes to README needed.")
        return False

    with open(readme_path, "w") as f:
        f.write(updated_readme)

    print(f"Updated {readme_path} with {len(top_entries)} news entries.")
    return True


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Update README Latest News section from the news index")
    parser.add_argument("--repo-root", default=os.path.abspath(os.path.join(os.path.dirname(__file__), "../../..")),
                        help="Repository root directory")
    args = parser.parse_args()

    index = os.path.join(args.repo_root, INDEX_PATH)
    readme = os.path.join(args.repo_root, README_PATH)
    update_readme_local(index, readme)
