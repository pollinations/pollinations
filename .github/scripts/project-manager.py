import sys
import os
import json
import re
import requests
import time
from typing import Optional


GITHUB_TOKEN = os.getenv("GITHUB_TOKEN")
POLLINATIONS_TOKEN = os.getenv("POLLINATIONS_TOKEN")
GITHUB_EVENT_JSON = os.getenv("GITHUB_EVENT", "{}")
try:
    GITHUB_EVENT = json.loads(GITHUB_EVENT_JSON)
except json.JSONDecodeError:
    GITHUB_EVENT = {}
REPO_OWNER = "pollinations"
REPO_NAME = "pollinations"
IS_PULL_REQUEST = "pull_request" in GITHUB_EVENT
ITEM_DATA = (
    GITHUB_EVENT.get("pull_request")
    if IS_PULL_REQUEST
    else GITHUB_EVENT.get("issue", {})
)

ISSUE_NUMBER = ITEM_DATA.get("number")
ISSUE_TITLE = ITEM_DATA.get("title", "")
ISSUE_BODY = ITEM_DATA.get("body", "") or ""
ISSUE_AUTHOR = ITEM_DATA.get("user", {}).get("login", "")
ISSUE_NODE_ID = ITEM_DATA.get("node_id", "")
ISSUE_CREATED_AT = ITEM_DATA.get("created_at", "")
GITHUB_API = "https://api.github.com"
GITHUB_GRAPHQL = "https://api.github.com/graphql"
POLLINATIONS_API = "https://gen.pollinations.ai/v1/chat/completions"
GITHUB_HEADERS = {
    "Authorization": f"Bearer {GITHUB_TOKEN}",
    "Accept": "application/vnd.github+json",
    "Content-Type": "application/json",
}


def log_debug(msg: str):
    print(f"[DEBUG] {msg}", file=sys.stderr)


def log_error(msg: str):
    print(f"[ERROR] {msg}", file=sys.stderr)


CONFIG = {
    "projects": {
        "dev": {
            "id": "PVT_kwDOBS76fs4AwCAM",
            "name": "Dev",
            "internal_only": True,
        },
        "support": {
            "id": "PVT_kwDOBS76fs4BLr1H",
            "name": "Support",
            "internal_only": False,
            "priority_field_id": "PVTSSF_lADOBS76fs4BLr1Hzg7NAkI",
            "priority_options": {
                "Urgent": "5b4c403c",
                "High": "509f6cf1",
                "Medium": "ce60ee16",
                "Low": "ca5161be",
            },
            "opened_field_id": "PVTF_lADOBS76fs4BLr1Hzg7WCHY",
        },
        "news": {
            "id": "PVT_kwDOBS76fs4BLtD8",
            "name": "News",
            "internal_only": False,
        },
        "tier": {
            "id": "PVT_kwDOBS76fs4BLtE_",  
            "name": "Tier",
            "internal_only": False,
        },
    },
    "org_members": [
        "voodoohop",
        "eulervoid",
        "ElliotEtag",
        "Circuit-Overtime",
        "Itachi-1824"
    ],
    "discord_uid_to_github": {
        "304378879705874432": "voodoohop",
        "884468469452656732": "ElliotEtag",
        "1085433243102347354": "eulervoid",
        "859708931478388767": "Itachi-1824",
        "738661669332320287": "Circuit-Overtime",
    },
}

def get_real_author() -> str:
    """Extract real author from Discord bot issues or return GitHub author."""
    if ISSUE_AUTHOR and "pollinations-ai" in ISSUE_AUTHOR.lower():
        # Extract UID from format: **Author:** `username` (UID: `123456789`)
        uid_match = re.search(r'\(UID:\s*`?(\d+)`?\)', ISSUE_BODY)
        if uid_match:
            discord_uid = uid_match.group(1)
            log_debug(f"Extracted Discord UID: {discord_uid}")
            github_user = CONFIG["discord_uid_to_github"].get(discord_uid)
            if github_user:
                log_debug(f"Mapped Discord UID {discord_uid} to GitHub user {github_user}")
                return github_user
            log_debug(f"No GitHub mapping for Discord UID {discord_uid}")
    return ISSUE_AUTHOR


def is_org_member(username: str) -> bool:
    if not username:
        return False
    is_member = username.lower() in [m.lower() for m in CONFIG["org_members"]]
    log_debug(f"Checked {username} org membership: {is_member}")
    return is_member

def get_script_dir() -> str:
    """Get the directory where this script is located."""
    return os.path.dirname(os.path.abspath(__file__))


def read_prompt_file() -> str:
    """Read the AI prompt from prompts/project-manager.md."""
    prompt_path = os.path.join(get_script_dir(), "..", "prompts", "project-manager.md")
    try:
        with open(prompt_path, "r") as f:
            return f.read()
    except FileNotFoundError:
        log_error(f"Prompt file not found at {prompt_path}")
        return ""


# Valid labels per project (kept in sync with prompts/project-manager.md)
VALID_LABELS = {
    "dev": {"DEV-BUG", "DEV-FEATURE", "DEV-QUEST", "DEV-TRACKING"},
    "support": {
        # TYPE labels (exactly 1, blue) - dot prefix for sorting
        ".BUG", ".OUTAGE", ".QUESTION", ".REQUEST", ".DOCS", ".INTEGRATION",
        # SERVICE labels (1 or more, violet)
        "IMAGE", "TEXT", "AUDIO", "VIDEO", "API", "WEB", "CREDITS", "BILLING", "ACCOUNT",
    },
    "news": set()
}


def normalize_labels(project: str, labels: list) -> list:
    project = project.lower()
    valid_labels = VALID_LABELS.get(project, set())
    
    if not valid_labels:
        return []
    
    incoming = [l.upper() for l in labels]
    
    if project == "dev":
        # Dev: pick ONE label
        label = next((l for l in incoming if l in valid_labels), None)
        return [label] if label else []
    
    if project == "support":
        # Support: allow multiple labels (TYPE + SVC)
        return [l for l in incoming if l in valid_labels]
    
    return []


def get_fallback_classification(_: bool) -> dict:
    return {
        "project": None,
        "priority": None,
        "labels": [],
        "reasoning": "AI classification failed; skipping automation"
    }




def classify_with_ai(is_internal: bool) -> dict:
    # Read prompt from prompts/project-manager.md
    base_prompt = read_prompt_file()
    
    system_prompt = f"""{base_prompt}

---
**Context:** Author type is {"internal" if is_internal else "external"}
"""

    user_prompt = f"""
Author: {ISSUE_AUTHOR}
Author Type: {"Internal" if is_internal else "External"}
Title: {ISSUE_TITLE}
Body: {ISSUE_BODY[:2000]}
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

            content = r.json()["choices"][0]["message"]["content"]
            log_debug(f"AI raw response: {content}")

            raw = json.loads(content)
            
            is_app_submission = raw.get("is_app_submission", False)
            
            project = raw.get("project", "").lower()
            if project not in ["dev", "support", "news"]:
                log_error(f"AI returned invalid project: {project}")
                return get_fallback_classification(is_internal)
            
            priority = raw.get("priority")
            # Priority only valid for support project
            if project == "support":
                valid_priorities = {"Urgent", "High", "Medium", "Low"}
                if priority not in valid_priorities:
                    log_error(f"AI returned invalid priority: {priority}")
                    priority = "Medium"
            else:
                priority = None
            
            labels = raw.get("labels", [])
            if not isinstance(labels, list):
                labels = []
            
            valid_labels_by_project = VALID_LABELS
            
            valid_for_project = valid_labels_by_project.get(project, set())
            filtered_labels = [l.upper() for l in labels if l.upper() in valid_for_project]
            if len(filtered_labels) < len(labels):
                invalid = [l for l in labels if l.upper() not in valid_for_project]
                log_error(f"AI returned invalid labels for {project}: {invalid}")
            
            classification = {
                "project": project,
                "priority": priority,
                "labels": filtered_labels,
                "reasoning": raw.get("reasoning", ""),
                "is_app_submission": is_app_submission,
            }

            log_debug(f"AI parsed classification: {classification}")
            return classification

        except Exception as e:
            log_error(f"AI exception: {e}")
            time.sleep(2 ** attempt)

    return get_fallback_classification(is_internal)


def graphql_request(query: str, variables: dict = None) -> dict:
    try:
        r = requests.post(
            GITHUB_GRAPHQL,
            headers=GITHUB_HEADERS,
            json={"query": query, "variables": variables or {}},
            timeout=30,
        )
        if r.status_code != 200:
            log_error(f"GraphQL HTTP {r.status_code}: {r.text[:500]}")
            return {}
        data = r.json()
        if "errors" in data:
            log_error(f"GraphQL errors: {data['errors']}")
            return {}
        return data.get("data", {})
    except requests.RequestException as e:
        log_error(f"GraphQL request failed: {e}")
        return {}


def add_to_project(project_id: str) -> Optional[str]:
    mutation = """
    mutation($projectId: ID!, $contentId: ID!) {
        addProjectV2ItemById(input: {
            projectId: $projectId,
            contentId: $contentId
        }) {
            item { id }
        }
    }
    """
    data = graphql_request(mutation, {
        "projectId": project_id,
        "contentId": ISSUE_NODE_ID
    })
    item_id = data.get("addProjectV2ItemById", {}).get("item", {}).get("id")
    if item_id:
        log_debug(f"Added to project {project_id}: item_id={item_id}")
    else:
        log_error(f"Failed to add to project {project_id}")
    return item_id


def set_project_field(project_id: str, item_id: str, field_id: str, option_id: str):
    mutation = """
    mutation($projectId: ID!, $itemId: ID!, $fieldId: ID!, $optionId: String!) {
        updateProjectV2ItemFieldValue(input: {
            projectId: $projectId,
            itemId: $itemId,
            fieldId: $fieldId,
            value: { singleSelectOptionId: $optionId }
        }) {
            projectV2Item { id }
        }
    }
    """
    data = graphql_request(mutation, {
        "projectId": project_id,
        "itemId": item_id,
        "fieldId": field_id,
        "optionId": option_id,
    })
    if data.get("updateProjectV2ItemFieldValue"):
        log_debug(f"Set project field: field_id={field_id}, option_id={option_id}")
    else:
        log_error(f"Failed to set project field: field_id={field_id}")


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
    date_only = date_value[:10] if date_value else None
    if not date_only:
        return
    data = graphql_request(mutation, {
        "projectId": project_id,
        "itemId": item_id,
        "fieldId": field_id,
        "date": date_only,
    })
    if data.get("updateProjectV2ItemFieldValue"):
        log_debug(f"Set date field: field_id={field_id}, date={date_only}")
    else:
        log_error(f"Failed to set date field: field_id={field_id}")


def add_labels(labels: list):
    if not labels:
        log_debug("No labels to add")
        return
    try:
        r = requests.post(
            f"{GITHUB_API}/repos/{REPO_OWNER}/{REPO_NAME}/issues/{ISSUE_NUMBER}/labels",
            headers=GITHUB_HEADERS,
            json={"labels": labels},
            timeout=10,
        )
        if r.status_code == 200:
            log_debug(f"Added labels: {labels}")
        else:
            log_error(f"Failed to add labels: {r.status_code} - {r.text}")
    except requests.RequestException as e:
        log_error(f"Exception adding labels: {e}")


def assign_issue(assignee: str):
    """Assign the issue to a GitHub user."""
    if not assignee:
        return
    try:
        r = requests.post(
            f"{GITHUB_API}/repos/{REPO_OWNER}/{REPO_NAME}/issues/{ISSUE_NUMBER}/assignees",
            headers=GITHUB_HEADERS,
            json={"assignees": [assignee]},
            timeout=10,
        )
        if r.status_code == 201:
            log_debug(f"Assigned issue to: {assignee}")
        else:
            log_error(f"Failed to assign issue: {r.status_code} - {r.text}")
    except requests.RequestException as e:
        log_error(f"Exception assigning issue: {e}")



def get_existing_labels() -> list:
    labels = ITEM_DATA.get("labels", [])
    return [l.get("name", "").upper() for l in labels if isinstance(l, dict)]



def main():
    log_debug(f"Processing issue/PR #{ISSUE_NUMBER}: {ISSUE_TITLE}")
    if not ISSUE_NUMBER or not ISSUE_NODE_ID:
        log_debug("Missing ISSUE_NUMBER or ISSUE_NODE_ID, skipping")
        return
    
    existing_labels = get_existing_labels()
    tier_labels = [l for l in existing_labels if l.startswith("TIER-")]
    if tier_labels:
        log_debug(f"Found TIER labels: {tier_labels}, routing to Tier project")
        project = CONFIG["projects"].get("tier")
        if project:
            item_id = add_to_project(project["id"])
            if item_id:
                log_debug(f"Added to Tier project successfully")
            return
        else:
            log_error("Tier project not configured")
            return
    
    # Skip AI if NEWS label is present - route directly to News project
    if "NEWS" in existing_labels:
        log_debug("Found NEWS label, routing to News project (skipping AI)")
        project = CONFIG["projects"].get("news")
        if project:
            item_id = add_to_project(project["id"])
            if item_id:
                log_debug("Added to News project successfully")
            return
        else:
            log_error("News project not configured")
            return
    
    real_author = get_real_author()
    is_internal = is_org_member(real_author)
    log_debug(f"Author {ISSUE_AUTHOR} (real: {real_author}) is internal: {is_internal}")
    
    # Auto-assign Discord-created issues to the real author if they're internal
    if real_author != ISSUE_AUTHOR and is_internal:
        assign_issue(real_author)
    
    classification = classify_with_ai(is_internal)
    
    # Check if AI detected app submission
    if classification.get("is_app_submission"):
        log_debug("AI detected app submission, routing to Tier project")
        project = CONFIG["projects"].get("tier")
        if project:
            item_id = add_to_project(project["id"])
            if item_id:
                log_debug("Added to Tier project successfully")
            else:
                log_error("Failed to add app submission to Tier project")
            return
        else:
            log_error("Tier project not configured")
            return

    if not classification.get("project"):
        log_debug("AI did not classify project, skipping")
        return
    
    project_key = classification["project"].lower()
    
    if project_key == "dev" and not is_internal:
        log_debug(f"Project 'dev' is internal-only, but author {ISSUE_AUTHOR} is external. Reassigning to support.")
        project_key = "support"
    
    priority = classification.get("priority", "Medium")
    log_debug(f"Classified: project={project_key}, priority={priority}")
    project = CONFIG["projects"].get(project_key)
    if not project:
        log_error(f"Unknown project key: {project_key}")
        return
    
    labels = normalize_labels(project_key, classification.get("labels", []))
    log_debug(f"Normalized labels: {labels}")

    item_id = add_to_project(project["id"])
    if not item_id:
        return
    
    # Only set priority and opened date for support project
    if project_key == "support":
        priority_option = project.get("priority_options", {}).get(priority)
        if priority_option and project.get("priority_field_id"):
            set_project_field(
                project["id"],
                item_id,
                project["priority_field_id"],
                priority_option,
            )
        if project.get("opened_field_id") and ISSUE_CREATED_AT:
            set_date_field(
                project["id"],
                item_id,
                project["opened_field_id"],
                ISSUE_CREATED_AT,
            )
    add_labels(labels)

if __name__ == "__main__":
    main()
