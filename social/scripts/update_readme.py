import os
import re
import argparse

HIGHLIGHTS_PATH = "social/news/highlights.md"
README_PATH = "README.md"
MAX_README_ENTRIES = 10


def get_top_highlights(highlights_content: str, count: int = MAX_README_ENTRIES) -> list[str]:
    """Extract top N highlight entries from highlights.md"""
    lines = highlights_content.strip().split('\n')
    entries = []

    for line in lines:
        line = line.strip()
        if line.startswith('- **'):
            entries.append(line)
            if len(entries) >= count:
                break

    return entries


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


def update_readme_local(highlights_path: str, readme_path: str) -> bool:
    """Read highlights.md and README.md from disk, update README in place.

    Returns True if README was modified, False otherwise.
    """
    if not os.path.exists(highlights_path):
        print(f"Highlights file not found: {highlights_path}")
        return False

    with open(highlights_path, "r") as f:
        highlights_content = f.read()

    top_entries = get_top_highlights(highlights_content, MAX_README_ENTRIES)
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
    parser = argparse.ArgumentParser(description="Update README Latest News section from highlights.md")
    parser.add_argument("--repo-root", default=os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")),
                        help="Repository root directory")
    args = parser.parse_args()

    highlights = os.path.join(args.repo_root, HIGHLIGHTS_PATH)
    readme = os.path.join(args.repo_root, README_PATH)
    update_readme_local(highlights, readme)
