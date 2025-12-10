import os
import sys
import json
import time
import random
import base64
import requests
from typing import Dict, List
from datetime import datetime, timezone

GITHUB_GRAPHQL_API = "https://api.github.com/graphql"
POLLINATIONS_API_BASE = "https://enter.pollinations.ai/api/generate/openai"
MODEL = "gemini-large"
CHUNK_SIZE = 50
NEWS_FOLDER = "NEWS"


def get_env(key: str, required: bool = True) -> str:
    value = os.getenv(key)
    if required and not value:
        print(f"Error: {key} environment variable is required")
        sys.exit(1)
    return value


def get_merged_prs_for_range(owner: str, repo: str, start_date: datetime, end_date: datetime, token: str) -> List[Dict]:
    """Fetch merged PRs for a specific date range using GraphQL"""

    query = """
    query($owner: String!, $repo: String!, $cursor: String, $baseRef: String!) {
      repository(owner: $owner, name: $repo) {
        pullRequests(
          states: MERGED
          first: 100
          after: $cursor
          orderBy: {field: UPDATED_AT, direction: DESC}
          baseRefName: $baseRef
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

    print(f"Fetching merged PRs from {start_date.strftime('%Y-%m-%d')} to {end_date.strftime('%Y-%m-%d')}...")

    # Check both main and master branches (repo used master until ~3 weeks ago)
    for base_ref in ["main", "master"]:
        cursor = None
        page = 1
        print(f"  Checking '{base_ref}' branch...")

        while True:
            variables = {
                "owner": owner,
                "repo": repo,
                "cursor": cursor,
                "baseRef": base_ref
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

            print(f"    Page {page}: fetched {len(nodes)} PRs")

            oldest_update_on_page = None

            for pr in nodes:
                merged_at = datetime.fromisoformat(pr["mergedAt"].replace("Z", "+00:00"))
                updated_at = datetime.fromisoformat(pr["updatedAt"].replace("Z", "+00:00"))

                if oldest_update_on_page is None or updated_at < oldest_update_on_page:
                    oldest_update_on_page = updated_at

                # Only include PRs merged within our date range
                if start_date <= merged_at <= end_date:
                    all_prs.append({
                        "number": pr["number"],
                        "title": pr["title"],
                        "body": pr["body"] or "",
                        "author": pr["author"]["login"] if pr["author"] else "ghost",
                        "merged_at": pr["mergedAt"],
                        "html_url": pr["url"]
                    })

            # Stop if we've gone past our date range
            if oldest_update_on_page and oldest_update_on_page < start_date:
                print(f"    Reached PRs before {start_date.strftime('%Y-%m-%d')}, stopping")
                break

            if not page_info["hasNextPage"]:
                print(f"    No more pages")
                break

            cursor = page_info["endCursor"]
            page += 1

    return all_prs


def chunk_prs(prs: List[Dict], chunk_size: int) -> List[List[Dict]]:
    return [prs[i:i + chunk_size] for i in range(0, len(prs), chunk_size)]


def create_news_prompt(prs: List[Dict], entry_date: str, is_final: bool = False, all_changes: List[str] = None) -> tuple:
    """Create prompt to format ALL PRs for NEWS.md"""

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
                json=payload,
                timeout=120
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


def create_news_file_content(news_entry: str, entry_date: str) -> str:
    """Create content for individual news file"""
    return f"""# Weekly Update - {entry_date}

{news_entry}
"""


def main():
    github_token = get_env('GITHUB_TOKEN')
    pollinations_token = get_env('POLLINATIONS_TOKEN')
    repo_full_name = get_env('GITHUB_REPOSITORY')
    week_start_str = get_env('WEEK_START')
    week_end_str = get_env('WEEK_END')
    file_date = get_env('FILE_DATE')

    owner_name, repo_name = repo_full_name.split('/')

    # Parse dates
    start_date = datetime.strptime(week_start_str, '%Y-%m-%d').replace(tzinfo=timezone.utc)
    end_date = datetime.strptime(week_end_str, '%Y-%m-%d').replace(hour=23, minute=59, second=59, tzinfo=timezone.utc)

    print(f"=== Generating NEWS for week: {week_start_str} to {week_end_str} ===")

    # Fetch merged PRs for this week
    merged_prs = get_merged_prs_for_range(owner_name, repo_name, start_date, end_date, github_token)

    print(f"Total merged PRs found for this week: {len(merged_prs)}")

    if not merged_prs:
        print(f"No merged PRs found for {week_start_str} to {week_end_str}. Creating empty placeholder.")
        news_content = "_No PRs merged this week._"
    else:
        # Generate NEWS content using AI
        print(f"Processing {len(merged_prs)} PRs...")

        if len(merged_prs) <= CHUNK_SIZE:
            print("Small batch - using single AI call...")
            system_prompt, user_prompt = create_news_prompt(merged_prs, file_date)
            ai_response = call_pollinations_api(system_prompt, user_prompt, pollinations_token)
            news_content = parse_response(ai_response)
        else:
            print(f"Large batch - chunking into {CHUNK_SIZE} PR batches...")
            pr_chunks = chunk_prs(merged_prs, CHUNK_SIZE)
            all_changes = []

            for i, chunk in enumerate(pr_chunks, 1):
                print(f"Processing chunk {i}/{len(pr_chunks)} ({len(chunk)} PRs)...")
                sys_prompt, usr_prompt = create_news_prompt(chunk, file_date)
                response = call_pollinations_api(sys_prompt, usr_prompt, pollinations_token)
                changes = parse_response(response)
                all_changes.append(changes)
                time.sleep(0.5)

            print("Consolidating all entries...")
            sys_prompt, usr_prompt = create_news_prompt([], file_date, is_final=True, all_changes=all_changes)
            ai_response = call_pollinations_api(sys_prompt, usr_prompt, pollinations_token)
            news_content = parse_response(ai_response)

    # Create the NEWS file locally
    os.makedirs(NEWS_FOLDER, exist_ok=True)
    news_file_path = f"{NEWS_FOLDER}/{file_date}.md"
    news_file_content = create_news_file_content(news_content, file_date)

    with open(news_file_path, 'w', encoding='utf-8') as f:
        f.write(news_file_content)

    print(f"Created {news_file_path} ({len(merged_prs)} PRs)")
    print("=== Done ===")


if __name__ == "__main__":
    main()
