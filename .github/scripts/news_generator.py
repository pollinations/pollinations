import os
import sys
import json
import time
import random
import re
import base64
import requests
from typing import Dict, List
from datetime import datetime, timedelta, timezone

GITHUB_API_BASE = "https://api.github.com"
GITHUB_GRAPHQL_API = "https://api.github.com/graphql"
POLLINATIONS_API_BASE = "https://enter.pollinations.ai/api/generate/openai"
MODEL = "gemini-large"
CHUNK_SIZE = 50
NEWS_FOLDER = "NEWS"
NEWSLIST_PATH = "pollinations.ai/src/config/newsList.js"


def get_env(key: str, required: bool = True) -> str:
    value = os.getenv(key)
    if required and not value:
        print(f"Error: {key} environment variable is required")
        sys.exit(1)
    return value


def get_date_range() -> tuple[datetime, datetime]:
    """Get the date range for PR search - last 7 days"""
    end_date = datetime.now(timezone.utc)
    start_date = end_date - timedelta(days=7)
    return start_date, end_date


def get_merged_prs(owner: str, repo: str, start_date: datetime, token: str) -> List[Dict]:
    """Fetch merged PRs using GraphQL - handles any number of PRs efficiently"""

    # Note: GitHub GraphQL PullRequestOrder only supports CREATED_AT and UPDATED_AT
    # We use UPDATED_AT DESC since merging updates the PR, then filter by mergedAt
    query = """
    query($owner: String!, $repo: String!, $cursor: String) {
      repository(owner: $owner, name: $repo) {
        pullRequests(
          states: MERGED
          first: 100
          after: $cursor
          orderBy: {field: UPDATED_AT, direction: DESC}
          baseRefName: "main"
        ) {
          pageInfo {
            hasNextPage
            endCursor
          }
          nodes {
            number
            title
            body
            url
            mergedAt
            updatedAt
            author {
              login
            }
          }
        }
      }
    }
    """

    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json"
    }

    all_prs = []
    cursor = None
    page = 1

    print(f"Fetching merged PRs since {start_date.strftime('%Y-%m-%d')} using GraphQL...")

    while True:
        variables = {
            "owner": owner,
            "repo": repo,
            "cursor": cursor
        }

        response = requests.post(
            GITHUB_GRAPHQL_API,
            headers=headers,
            json={"query": query, "variables": variables}
        )

        if response.status_code != 200:
            print(f"GraphQL error: {response.status_code} -> {response.text[:500]}")
            sys.exit(1)

        data = response.json()

        if "errors" in data:
            print(f"GraphQL query errors: {data['errors']}")
            sys.exit(1)

        pr_data = data["data"]["repository"]["pullRequests"]
        nodes = pr_data["nodes"]
        page_info = pr_data["pageInfo"]

        print(f"  Page {page}: fetched {len(nodes)} PRs")

        # Track if all PRs on this page are too old (by updatedAt)
        oldest_update_on_page = None

        for pr in nodes:
            # Parse timestamps
            merged_at = datetime.fromisoformat(pr["mergedAt"].replace("Z", "+00:00"))
            updated_at = datetime.fromisoformat(pr["updatedAt"].replace("Z", "+00:00"))

            if oldest_update_on_page is None or updated_at < oldest_update_on_page:
                oldest_update_on_page = updated_at

            # Only include PRs merged within our date range
            if merged_at >= start_date:
                all_prs.append({
                    "number": pr["number"],
                    "title": pr["title"],
                    "body": pr["body"] or "",
                    "author": pr["author"]["login"] if pr["author"] else "ghost",
                    "merged_at": pr["mergedAt"],
                    "html_url": pr["url"]
                })

        # Stop pagination if the oldest updatedAt on this page is before our start_date
        # This means all subsequent pages will also be too old
        if oldest_update_on_page and oldest_update_on_page < start_date:
            print(f"  Reached PRs last updated before {start_date.strftime('%Y-%m-%d')}, stopping")
            break

        # Check if there are more pages
        if not page_info["hasNextPage"]:
            print(f"  No more pages")
            break

        cursor = page_info["endCursor"]
        page += 1

    return all_prs


def chunk_prs(prs: List[Dict], chunk_size: int) -> List[List[Dict]]:
    return [prs[i:i + chunk_size] for i in range(0, len(prs), chunk_size)]


def create_news_prompt(prs: List[Dict], is_final: bool = False, all_changes: List[str] = None) -> tuple:
    """Create prompt to format ALL PRs for NEWS.md - no filtering, this is source of truth"""
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")

    system_prompt = f"""You are creating a weekly changelog entry for NEWS.md.

NEWS.md is the SINGLE SOURCE OF TRUTH for all platform updates. It will be consumed by:
- Discord bot (to post weekly digests)
- Website news section
- Other automated workflows
- Developers and users looking for complete changelog

CRITICAL: Include EVERY PR provided. Do NOT skip or filter any PRs. Do NOT decide what's "important" - that's for downstream consumers to decide. This must be a COMPLETE record.

OUTPUT FORMAT (follow exactly):
```
- **PR Title/Feature Name** — Clear description of the change. Include technical details, endpoints, parameters where relevant. Use `backticks` for code. [PR #{'{number}'}](url)
```

GUIDELINES:
- Include ALL PRs - bug fixes, features, refactors, dependencies, EVERYTHING
- Each bullet = one PR (no exceptions, no skipping)
- Write clear, informative descriptions
- Use `backticks` for technical terms, code, endpoints, parameters
- Include the PR link at the end of each entry
- Be concise but complete - other systems will format/filter as needed

TONE: Professional, factual, comprehensive. This is a historical record that other systems depend on."""

    if is_final:
        combined_changes = "\n\n".join(all_changes)
        user_prompt = f"""Consolidate these PR entries into a final clean list. Remove any duplicates but keep ALL unique entries:

{combined_changes}

Output the complete, deduplicated list."""
    else:
        user_prompt = f"""Format ALL {len(prs)} PRs into changelog entries. Include every single one:

"""
        for pr in prs:
            body_preview = pr['body'][:500] if pr['body'] else 'No description'
            user_prompt += f"""PR #{pr['number']}: {pr['title']}
Author: @{pr['author']}
URL: {pr['html_url']}
Merged: {pr['merged_at']}
Description: {body_preview}

"""

        user_prompt += """Format each PR as a bullet point. Do NOT skip any PRs."""

    return system_prompt, user_prompt


def call_pollinations_api(system_prompt: str, user_prompt: str, token: str, max_retries: int = 3) -> str:
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json"
    }

    last_error = None
    for attempt in range(max_retries):
        seed = random.randint(0, 2147483647)

        payload = {
            "model": MODEL,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt}
            ],
            "temperature": 0.3,
            "seed": seed
        }

        if attempt > 0:
            print(f"Retry {attempt}/{max_retries - 1} with new seed: {seed}")

        try:
            response = requests.post(
                POLLINATIONS_API_BASE,
                headers=headers,
                json=payload
            )

            if response.status_code == 200:
                try:
                    result = response.json()
                    return result['choices'][0]['message']['content']
                except (KeyError, IndexError, json.JSONDecodeError) as e:
                    last_error = f"Error parsing API response: {e}"
                    error_preview = response.text[:500] + "..." if len(response.text) > 500 else response.text
                    print(f"{last_error}")
                    print(f"Response preview: {error_preview}")
            else:
                last_error = f"API error: {response.status_code}"
                error_preview = response.text[:500] + "..." if len(response.text) > 500 else response.text
                print(f"{last_error}")
                print(f"Error preview: {error_preview}")

        except requests.exceptions.RequestException as e:
            last_error = f"Request failed: {e}"
            print(last_error)

        if attempt < max_retries - 1:
            print("Waiting 5 seconds before retry...")
            time.sleep(5)

    print(f"All {max_retries} attempts failed. Last error: {last_error}")
    sys.exit(1)


def parse_response(response: str) -> str:
    message = response.strip()

    if message.startswith('```'):
        lines = message.split('\n')
        if lines[0].strip() == '```' or lines[0].startswith('```'):
            lines = lines[1:]
        if lines and lines[-1].strip() == '```':
            lines = lines[:-1]
        message = '\n'.join(lines)

    return message.strip()


def check_news_file_exists(github_token: str, owner: str, repo: str, file_path: str) -> bool:
    """Check if a news file already exists in the repo"""
    headers = {
        "Accept": "application/vnd.github+json",
        "Authorization": f"Bearer {github_token}"
    }

    response = requests.get(
        f"{GITHUB_API_BASE}/repos/{owner}/{repo}/contents/{file_path}",
        headers=headers
    )

    return response.status_code == 200


def create_news_file_content(news_entry: str, entry_date: str) -> str:
    """Create content for individual news file"""
    return f"""# Weekly Update - {entry_date}

{news_entry}
"""


def get_current_newslist(github_token: str, owner: str, repo: str) -> str:
    """Fetch current newsList.js content from the repo"""
    headers = {
        "Accept": "application/vnd.github+json",
        "Authorization": f"Bearer {github_token}"
    }

    response = requests.get(
        f"{GITHUB_API_BASE}/repos/{owner}/{repo}/contents/{NEWSLIST_PATH}",
        headers=headers
    )

    if response.status_code == 200:
        content = response.json().get("content", "")
        return base64.b64decode(content).decode("utf-8")
    else:
        print(f"Warning: Could not fetch current newsList.js: {response.status_code}")
        return ""


def create_newslist_prompt(news_content: str, current_newslist: str) -> tuple:
    """Create prompt to generate updated newsList.js with only major updates"""
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")

    system_prompt = """You are updating the newsList.js file for the Pollinations website.

This file displays ONLY major, user-facing updates that website visitors care about. This is NOT a complete changelog - it's a curated highlights list.

INCLUDE only:
- New models or model upgrades (e.g., "Seedream upgraded to 4.5")
- New features users can use (e.g., "New Auth Dashboard")
- New integrations (e.g., "Sequa AI Integration")
- New API endpoints or capabilities
- New tools (e.g., "MCP Server now supports audio")

EXCLUDE:
- Bug fixes
- Internal refactors
- Dependency updates
- CI/CD changes
- Documentation-only changes
- Performance improvements (unless dramatic)
- Code cleanup

OUTPUT FORMAT - You must output ONLY valid JavaScript that exports a newsList constant:
```javascript
export const newsList = `- **YYYY-MM-DD** – **Feature Name** Brief description. Use \`backticks\` for code/endpoints. [Link text](url) if relevant.
- **YYYY-MM-DD** – **Another Feature** Description here.`;
```

RULES:
1. Each entry starts with date in **YYYY-MM-DD** format
2. Feature name in **bold** after the date
3. Use en-dash (–) as separator, not hyphen
4. Use \`backticks\` for code, endpoints, parameters
5. Keep entries concise (1-2 lines max)
6. Most recent entries at the TOP
7. Keep ~15-20 most relevant entries total (drop old minor ones if needed)
8. Output ONLY the JavaScript code, no explanations"""

    user_prompt = f"""Here is this week's NEWS changelog (contains ALL changes):

{news_content}

Here is the CURRENT newsList.js content:

{current_newslist}

Generate the updated newsList.js file. Add any NEW major user-facing features from this week's changelog at the TOP. Keep existing important entries. Remove outdated or minor entries if the list gets too long (aim for ~15-20 entries).

Output ONLY the valid JavaScript export statement."""

    return system_prompt, user_prompt


def generate_newslist_content(news_content: str, current_newslist: str, pollinations_token: str) -> str:
    """Generate updated newsList.js content using AI"""
    print("Generating newsList.js content...")

    system_prompt, user_prompt = create_newslist_prompt(news_content, current_newslist)
    ai_response = call_pollinations_api(system_prompt, user_prompt, pollinations_token)

    content = parse_response(ai_response)

    # Ensure it starts with export const newsList
    if not content.strip().startswith("export const newsList"):
        # Try to extract just the export statement
        if "export const newsList" in content:
            start = content.index("export const newsList")
            content = content[start:]

    # Ensure it ends with semicolon
    content = content.strip()
    if not content.endswith(";"):
        content += ";"

    # Add newline at end of file
    content += "\n"

    return content


def get_file_sha(github_token: str, owner: str, repo: str, file_path: str, branch: str = "main") -> str:
    """Get the SHA of an existing file (needed for updates)"""
    headers = {
        "Accept": "application/vnd.github+json",
        "Authorization": f"Bearer {github_token}"
    }

    response = requests.get(
        f"{GITHUB_API_BASE}/repos/{owner}/{repo}/contents/{file_path}?ref={branch}",
        headers=headers
    )

    if response.status_code == 200:
        return response.json().get("sha", "")
    return ""


def create_pr_with_news(news_content: str, newslist_content: str, github_token: str, owner: str, repo: str, pr_count: int):
    """Create a PR with weekly news file and updated newsList.js"""

    entry_date = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    news_file_path = f"{NEWS_FOLDER}/{entry_date}.md"

    # Check if file for this date already exists
    if check_news_file_exists(github_token, owner, repo, news_file_path):
        print(f"News file for {entry_date} already exists. Skipping.")
        return

    # Create content for the news file
    news_file_content = create_news_file_content(news_content, entry_date)

    headers = {
        "Accept": "application/vnd.github+json",
        "Authorization": f"Bearer {github_token}"
    }

    default_branch = "main"

    # Get latest commit SHA
    ref_response = requests.get(
        f"{GITHUB_API_BASE}/repos/{owner}/{repo}/git/ref/heads/{default_branch}",
        headers=headers
    )
    if ref_response.status_code != 200:
        print(f"Error getting ref: {ref_response.text}")
        sys.exit(1)
    base_sha = ref_response.json()['object']['sha']

    # Create new branch
    branch_name = f"news-update-{entry_date}"
    create_branch_response = requests.post(
        f"{GITHUB_API_BASE}/repos/{owner}/{repo}/git/refs",
        headers=headers,
        json={
            "ref": f"refs/heads/{branch_name}",
            "sha": base_sha
        }
    )

    if create_branch_response.status_code not in [200, 201]:
        # Branch might already exist, try to update it
        if "Reference already exists" in create_branch_response.text:
            print(f"Branch {branch_name} already exists, updating...")
        else:
            print(f"Error creating branch: {create_branch_response.text}")
            sys.exit(1)

    print(f"Created branch: {branch_name}")

    # 1. Create/update the NEWS file
    news_api_path = f"{GITHUB_API_BASE}/repos/{owner}/{repo}/contents/{news_file_path}"
    news_encoded = base64.b64encode(news_file_content.encode()).decode()

    # Check if file already exists on branch (from previous failed run)
    news_sha = get_file_sha(github_token, owner, repo, news_file_path, branch_name)

    news_payload = {
        "message": f"docs: add weekly news entry - {entry_date}",
        "content": news_encoded,
        "branch": branch_name
    }

    if news_sha:
        news_payload["sha"] = news_sha

    news_response = requests.put(news_api_path, headers=headers, json=news_payload)

    if news_response.status_code not in [200, 201]:
        print(f"Error creating NEWS file: {news_response.text}")
        sys.exit(1)

    print(f"✅ {'Updated' if news_sha else 'Created'} {news_file_path} on branch {branch_name}")

    # 2. Update newsList.js (existing file, needs SHA)
    newslist_sha = get_file_sha(github_token, owner, repo, NEWSLIST_PATH, branch_name)
    if not newslist_sha:
        # Try getting from main if not on branch yet
        newslist_sha = get_file_sha(github_token, owner, repo, NEWSLIST_PATH, "main")

    newslist_api_path = f"{GITHUB_API_BASE}/repos/{owner}/{repo}/contents/{NEWSLIST_PATH}"
    newslist_encoded = base64.b64encode(newslist_content.encode()).decode()

    newslist_payload = {
        "message": f"docs: update website news highlights - {entry_date}",
        "content": newslist_encoded,
        "branch": branch_name
    }

    # Only include SHA if file exists (required for updates, invalid for new files)
    if newslist_sha:
        newslist_payload["sha"] = newslist_sha

    newslist_response = requests.put(newslist_api_path, headers=headers, json=newslist_payload)

    if newslist_response.status_code not in [200, 201]:
        print(f"Error updating newsList.js: {newslist_response.text}")
        sys.exit(1)

    print(f"✅ Updated {NEWSLIST_PATH} on branch {branch_name}")

    # Create PR
    pr_title = f"📰 Weekly News Update - {entry_date}"
    pr_body = f"""## Weekly News Update

This PR includes:
- New weekly changelog: `{news_file_path}`
- Updated website highlights: `{NEWSLIST_PATH}`

**PRs included:** {pr_count}

### Full Changelog Preview

{news_content}

---
**Note:** When this PR is merged, it will automatically trigger the Discord notification workflow.

🤖 Generated automatically by GitHub Actions
"""

    pr_response = requests.post(
        f"{GITHUB_API_BASE}/repos/{owner}/{repo}/pulls",
        headers=headers,
        json={
            "title": pr_title,
            "body": pr_body,
            "head": branch_name,
            "base": default_branch
        }
    )

    if pr_response.status_code not in [200, 201]:
        # PR might already exist
        if "A pull request already exists" in pr_response.text:
            print("PR already exists for this branch")
            return
        print(f"Error creating PR: {pr_response.text}")
        sys.exit(1)

    pr_data = pr_response.json()
    pr_number = pr_data['number']
    print(f"✅ Created PR #{pr_number}: {pr_data['html_url']}")

    # Add inbox:news label to the PR
    label_response = requests.post(
        f"{GITHUB_API_BASE}/repos/{owner}/{repo}/issues/{pr_number}/labels",
        headers=headers,
        json={"labels": ["inbox:news"]}
    )
    if label_response.status_code in [200, 201]:
        print(f"✅ Added 'inbox:news' label to PR #{pr_number}")
    else:
        print(f"Warning: Could not add label: {label_response.status_code}")


def main():
    github_token = get_env('GITHUB_TOKEN')
    pollinations_token = get_env('POLLINATIONS_TOKEN')
    repo_full_name = get_env('GITHUB_REPOSITORY')
    owner_name, repo_name = repo_full_name.split('/')

    start_date, end_date = get_date_range()
    merged_prs = get_merged_prs(owner_name, repo_name, start_date, github_token)

    print(f"Total merged PRs found: {len(merged_prs)}")

    if not merged_prs:
        print("No merged PRs found for this period. Skipping news update.")
        return

    # Step 1: Generate full NEWS changelog
    print(f"Processing {len(merged_prs)} PRs for NEWS.md (including ALL)...")

    if len(merged_prs) <= CHUNK_SIZE:
        print("Small batch - using single AI call...")
        system_prompt, user_prompt = create_news_prompt(merged_prs)
        ai_response = call_pollinations_api(system_prompt, user_prompt, pollinations_token)
        news_content = parse_response(ai_response)
    else:
        print(f"Large batch - chunking into {CHUNK_SIZE} PR batches...")
        pr_chunks = chunk_prs(merged_prs, CHUNK_SIZE)
        all_changes = []

        for i, chunk in enumerate(pr_chunks, 1):
            print(f"Processing chunk {i}/{len(pr_chunks)} ({len(chunk)} PRs)...")
            sys_prompt, usr_prompt = create_news_prompt(chunk)
            response = call_pollinations_api(sys_prompt, usr_prompt, pollinations_token)
            changes = parse_response(response)
            all_changes.append(changes)
            time.sleep(0.5)

        print("Consolidating all entries...")
        sys_prompt, usr_prompt = create_news_prompt([], is_final=True, all_changes=all_changes)
        ai_response = call_pollinations_api(sys_prompt, usr_prompt, pollinations_token)
        news_content = parse_response(ai_response)

    if not news_content.strip():
        print("Empty NEWS response from AI. This shouldn't happen.")
        sys.exit(1)

    print("✅ NEWS content generated")

    # Step 2: Generate newsList.js with curated highlights
    print("Fetching current newsList.js...")
    current_newslist = get_current_newslist(github_token, owner_name, repo_name)

    newslist_content = generate_newslist_content(news_content, current_newslist, pollinations_token)

    if not newslist_content.strip():
        print("Empty newsList.js response from AI. This shouldn't happen.")
        sys.exit(1)

    print("✅ newsList.js content generated")

    # Step 3: Create PR with both files
    create_pr_with_news(news_content, newslist_content, github_token, owner_name, repo_name, len(merged_prs))
    print("✅ News generation completed!")


if __name__ == "__main__":
    main()
