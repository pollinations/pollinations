#!/usr/bin/env python3
"""
Backfill labels for issues in a GitHub project.

Usage:
    python project-backfill-labels.py --project support [--dry-run] [--with-priority]
    
Options:
    --project       Project to process: dev, support, news, tier
    --dry-run       Preview changes without applying
    --with-priority Also update priority field (support only)

Environment:
    GITHUB_TOKEN        GitHub token with repo/project access
    POLLINATIONS_TOKEN  pollinations.ai API key
"""

import argparse
import sys
import os
import time
import json
import requests
import importlib.util

# Import shared functions from project-manager.py (hyphen in filename requires special import)
script_dir = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location("project_manager", os.path.join(script_dir, "project-manager.py"))
pm = importlib.util.module_from_spec(spec)
spec.loader.exec_module(pm)

CONFIG = pm.CONFIG
VALID_LABELS = pm.VALID_LABELS
PROTECTED_LABELS = pm.PROTECTED_LABELS
GITHUB_API = pm.GITHUB_API
GITHUB_GRAPHQL = pm.GITHUB_GRAPHQL
GITHUB_HEADERS = pm.GITHUB_HEADERS
REPO_OWNER = pm.REPO_OWNER
REPO_NAME = pm.REPO_NAME
log_debug = pm.log_debug
log_error = pm.log_error
read_prompt_file = pm.read_prompt_file
normalize_labels = pm.normalize_labels
graphql_request = pm.graphql_request
set_project_field = pm.set_project_field

POLLINATIONS_API = "https://gen.pollinations.ai/v1/chat/completions"
POLLINATIONS_TOKEN = os.getenv("POLLINATIONS_TOKEN")


def get_project_issues(project_id: str, include_prs: bool = False) -> list:
    """Fetch all open issues (and optionally PRs) in a project with their project item IDs."""
    query = """
    query($projectId: ID!, $cursor: String) {
        node(id: $projectId) {
            ... on ProjectV2 {
                items(first: 100, after: $cursor) {
                    pageInfo { hasNextPage endCursor }
                    nodes {
                        id
                        content {
                            ... on Issue {
                                __typename
                                id
                                number
                                title
                                body
                                state
                                createdAt
                                author { login }
                                labels(first: 20) {
                                    nodes { name }
                                }
                            }
                            ... on PullRequest {
                                __typename
                                id
                                number
                                title
                                body
                                state
                                createdAt
                                author { login }
                                labels(first: 20) {
                                    nodes { name }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
    """
    
    all_items = []
    cursor = None
    
    while True:
        data = graphql_request(query, {"projectId": project_id, "cursor": cursor})
        node = data.get("node", {})
        items = node.get("items", {})
        
        for item in items.get("nodes", []):
            content = item.get("content")
            if not content or content.get("state") != "OPEN":
                continue
            typename = content.get("__typename")
            if typename == "Issue" or (include_prs and typename == "PullRequest"):
                content["_item_id"] = item.get("id")
                content["_is_pr"] = typename == "PullRequest"
                all_items.append(content)
        
        page_info = items.get("pageInfo", {})
        if not page_info.get("hasNextPage"):
            break
        cursor = page_info.get("endCursor")
    
    return all_items


def remove_project_labels(issue_number: int, project_key: str, dry_run: bool) -> list:
    """Remove project-specific labels from an issue."""
    # Get current labels
    r = requests.get(
        f"{GITHUB_API}/repos/{REPO_OWNER}/{REPO_NAME}/issues/{issue_number}/labels",
        headers=GITHUB_HEADERS,
        timeout=10,
    )
    if r.status_code != 200:
        log_error(f"Failed to get labels for #{issue_number}")
        return []
    
    current_labels = [l["name"] for l in r.json()]
    
    # Determine which labels to remove based on project
    support_labels = {
        # Current TYPE labels (dot prefix)
        ".BUG", ".OUTAGE", ".QUESTION", ".REQUEST", ".DOCS", ".INTEGRATION",
        # Current SERVICE labels
        "IMAGE", "TEXT", "AUDIO", "VIDEO", "API", "WEB", "CREDITS", "BILLING", "ACCOUNT",
        # Old labels to clean up during migration
        "BUG", "OUTAGE", "QUESTION", "REQUEST", "DOCS", "INTEGRATION",
        "S-BUG", "S-OUTAGE", "S-QUESTION", "S-REQUEST", "S-DOCS", "S-INTEGRATION",
        "S-IMAGE", "S-TEXT", "S-AUDIO", "S-VIDEO", "S-API", "S-WEB", "S-CREDITS", "S-BILLING", "S-ACCOUNT",
    }
    if project_key == "dev":
        to_remove = [l for l in current_labels if l.startswith("DEV-")]
    elif project_key == "support":
        # Match both exact and uppercase (for old labels)
        to_remove = [l for l in current_labels if l in support_labels or l.upper() in support_labels]
    else:
        to_remove = []
    
    if not to_remove:
        return current_labels
    
    if dry_run:
        log_debug(f"[DRY-RUN] Would remove labels from #{issue_number}: {to_remove}")
        return [l for l in current_labels if l not in to_remove]
    
    # Remove each label
    for label in to_remove:
        r = requests.delete(
            f"{GITHUB_API}/repos/{REPO_OWNER}/{REPO_NAME}/issues/{issue_number}/labels/{label}",
            headers=GITHUB_HEADERS,
            timeout=10,
        )
        if r.status_code == 200:
            log_debug(f"Removed label '{label}' from #{issue_number}")
        else:
            log_error(f"Failed to remove label '{label}' from #{issue_number}")
    
    return [l for l in current_labels if l not in to_remove]


def classify_issue(title: str, body: str, author: str, is_internal: bool) -> dict:
    """Classify an issue using the AI (same as project-manager.py)."""
    base_prompt = read_prompt_file()
    
    system_prompt = f"""{base_prompt}

---
**Context:** Author type is {"internal" if is_internal else "external"}
"""

    user_prompt = f"""
Author: {author}
Author Type: {"Internal" if is_internal else "External"}
Title: {title}
Body: {(body or "")[:2000]}
"""

    for attempt in range(3):
        try:
            r = requests.post(
                POLLINATIONS_API,
                headers={
                    "content-type": "application/json",
                    "Authorization": f"Bearer {POLLINATIONS_TOKEN}"
                },
                json={
                    "model": "openai-large",
                    "messages": [
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": user_prompt},
                    ],
                    "response_format": {"type": "json_object"},
                    "max_tokens": 400,
                },
                timeout=120,
            )

            if r.status_code != 200:
                log_error(f"AI HTTP {r.status_code}: {r.text}")
                time.sleep(2 ** attempt)
                continue

            data = r.json()
            content = data.get("choices", [{}])[0].get("message", {}).get("content", "{}")
            
            return json.loads(content)
        except Exception as e:
            log_error(f"Classification error: {e}")
            time.sleep(2 ** attempt)
    
    return {}


def set_date_field(project_id: str, item_id: str, field_id: str, date_value: str):
    """Set a date field on a project item."""
    mutation = """
    mutation($projectId: ID!, $itemId: ID!, $fieldId: ID!, $date: Date!) {
        updateProjectV2ItemFieldValue(input: {
            projectId: $projectId,
            itemId: $itemId,
            fieldId: $fieldId,
            value: { date: $date }
        }) {
            projectV2Item { id }
        }
    }
    """
    # Extract just the date part (YYYY-MM-DD) from ISO timestamp
    date_only = date_value[:10] if date_value else None
    if not date_only:
        return
    data = graphql_request(mutation, {
        "projectId": project_id,
        "itemId": item_id,
        "fieldId": field_id,
        "date": date_only,
    })
    return data.get("updateProjectV2ItemFieldValue", {}).get("projectV2Item", {}).get("id")


def add_labels(issue_number: int, labels: list, dry_run: bool):
    """Add labels to an issue."""
    if not labels:
        return
    
    if dry_run:
        log_debug(f"[DRY-RUN] Would add labels to #{issue_number}: {labels}")
        return
    
    r = requests.post(
        f"{GITHUB_API}/repos/{REPO_OWNER}/{REPO_NAME}/issues/{issue_number}/labels",
        headers=GITHUB_HEADERS,
        json={"labels": labels},
        timeout=10,
    )
    if r.status_code == 200:
        log_debug(f"Added labels to #{issue_number}: {labels}")
    else:
        log_error(f"Failed to add labels to #{issue_number}: {r.status_code}")


def get_real_author(author: str, body: str) -> str:
    """Extract real author from Discord UID if issue was created by bot."""
    import re
    if author and "pollinations-ai" in author.lower():
        uid_match = re.search(r'\(UID:\s*`?(\d+)`?\)', body or "")
        if uid_match:
            discord_uid = uid_match.group(1)
            github_user = CONFIG.get("discord_uid_to_github", {}).get(discord_uid)
            if github_user:
                log_debug(f"Mapped Discord UID {discord_uid} to GitHub user {github_user}")
                return github_user
    return author


def is_org_member(username: str) -> bool:
    """Check if user is an org member."""
    org_members = CONFIG.get("org_members", [])
    if username.lower() in [m.lower() for m in org_members]:
        return True
    return False


def main():
    parser = argparse.ArgumentParser(description="Backfill labels for project issues")
    parser.add_argument("--project", required=True, choices=["dev", "support", "news", "tier"],
                        help="Project to process")
    parser.add_argument("--dry-run", action="store_true", help="Preview without applying")
    parser.add_argument("--with-priority", action="store_true", help="Also update priority (support only)")
    parser.add_argument("--prs-only", action="store_true", help="Process only PRs, not issues")
    parser.add_argument("--include-prs", action="store_true", help="Include PRs along with issues")
    args = parser.parse_args()
    
    project_key = args.project
    project = CONFIG["projects"].get(project_key)
    
    if not project:
        log_error(f"Unknown project: {project_key}")
        sys.exit(1)
    
    include_prs = args.include_prs or args.prs_only
    log_debug(f"Fetching open items from {project['name']} project (include_prs={include_prs})...")
    items = get_project_issues(project["id"], include_prs=include_prs)
    
    if args.prs_only:
        items = [i for i in items if i.get("_is_pr")]
        log_debug(f"Found {len(items)} open PRs")
    else:
        log_debug(f"Found {len(items)} open items")
    
    for issue in items:
        issue_number = issue["number"]
        title = issue["title"]
        body = issue.get("body", "") or ""
        author = issue.get("author", {}).get("login", "")
        
        log_debug(f"\n--- Processing #{issue_number}: {title[:50]}...")
        
        # Get current labels and check for protected labels
        r = requests.get(
            f"{GITHUB_API}/repos/{REPO_OWNER}/{REPO_NAME}/issues/{issue_number}/labels",
            headers=GITHUB_HEADERS,
            timeout=10,
        )
        current_labels = [l["name"].upper() for l in r.json()] if r.status_code == 200 else []
        protected = PROTECTED_LABELS.get(project_key, set())
        has_protected = protected & set(current_labels)
        
        if has_protected:
            log_debug(f"Issue has protected labels {has_protected}, skipping label update")
        else:
            # Remove existing project labels
            remove_project_labels(issue_number, project_key, args.dry_run)
            
            # Classify - resolve real author from Discord UID if bot-created
            real_author = get_real_author(author, body)
            is_internal = is_org_member(real_author)
            log_debug(f"Author: {author} -> Real: {real_author}, Internal: {is_internal}")
            classification = classify_issue(title, body, real_author, is_internal)
            
            if not classification:
                log_error(f"Failed to classify #{issue_number}")
            else:
                # Normalize and add labels
                labels = normalize_labels(project_key, classification.get("labels", []))
                add_labels(issue_number, labels, args.dry_run)
                
                # Update priority (support only, if requested)
                if args.with_priority and project_key == "support":
                    priority = classification.get("priority")
                    priority_option = project.get("priority_options", {}).get(priority)
                    item_id = issue.get("_item_id")
                    if priority_option and project.get("priority_field_id") and item_id:
                        if args.dry_run:
                            log_debug(f"[DRY-RUN] Would set priority to {priority} for #{issue_number}")
                        else:
                            set_project_field(
                                project["id"],
                                item_id,
                                project["priority_field_id"],
                                priority_option
                            )
                            log_debug(f"Set priority to {priority} for #{issue_number}")
        
        # Set Opened date field
        item_id = issue.get("_item_id")
        created_at = issue.get("createdAt")
        opened_field_id = project.get("opened_field_id")
        if item_id and created_at and opened_field_id:
            if args.dry_run:
                log_debug(f"[DRY-RUN] Would set Opened to {created_at[:10]} for #{issue_number}")
            else:
                set_date_field(project["id"], item_id, opened_field_id, created_at)
                log_debug(f"Set Opened to {created_at[:10]} for #{issue_number}")
        
        # Rate limit
        time.sleep(1)
    
    log_debug(f"\nDone! Processed {len(items)} items.")


if __name__ == "__main__":
    main()
