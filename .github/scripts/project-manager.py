import sys
import os
import json
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
            "default_status": "Backlog",
            "status_field_id": "PVTSSF_lADOBS76fs4AwCAMzgmXaAM",
            "status_options": {
                "Backlog": "f75ad846",
                "Blocked": "151d2df4",
                "To Do": "d89ca0b2",
                "In Progress": "47fc9ee4",
                "In Review": "ca6ba6c3",
                "Done": "98236657",
                "Discarded": "3bf36d0a",
            },
            "priority_field_id": "PVTSSF_lADOBS76fs4AwCAMzg2DKDk",
            "priority_options": {
                "Urgent": "0f53228f",
                "High": "dc7fa85f",
                "Medium": "15fd4fac",
                "Low": "7495a981",
            },
        },
        "support": {
            "id": "PVT_kwDOBS76fs4BLr1H",
            "name": "Support",
            "internal_only": False,
            "default_status": "Review",
            "status_field_id": "PVTSSF_lADOBS76fs4BLr1Hzg7L1RQ",
            "status_options": {
                "Review": "f75ad846",
                "Done": "98236657",
                "Discarded": "bc3f7e3a",
            },
            "priority_field_id": "PVTSSF_lADOBS76fs4BLr1Hzg7NAkI",
            "priority_options": {
                "Urgent": "5b4c403c",
                "High": "509f6cf1",
                "Medium": "ce60ee16",
                "Low": "ca5161be",
            },
        },
        "news": {
            "id": "PVT_kwDOBS76fs4BLtD8",
            "name": "News",
            "internal_only": False,
            "default_status": "Todo",
            "status_field_id": "PVTSSF_lADOBS76fs4BLtD8zg7Mrxg",
            "status_options": {
                "Todo": "f75ad846",     
                "In Progress": "47fc9ee4",
                "Done": "98236657",
            },
            "priority_field_id": None,
            "priority_options": {},
        },
        "tier": {
            "id": "PVT_kwDOBS76fs4BLwDf",  
            "name": "Tier",
            "internal_only": False,
            "default_status": None, 
            "status_field_id": None,
            "status_options": {},
            "priority_field_id": None,
            "priority_options": {},
        },
    },
    "org_members": [
        "voodoohop",
        "eulervoid",
        "ElliotEtag",
        "Circuit-Overtime",
        "Itachi-1824"
    ],
}

def is_org_member(username: str) -> bool:
    if not username:
        return False
    if username.lower() in [m.lower() for m in CONFIG["org_members"]]:
        log_debug(f"Found {username} in org_members list")
        return True
    try:
        r = requests.get(
            f"{GITHUB_API}/orgs/{REPO_OWNER}/members/{username}",
            headers=GITHUB_HEADERS,
            timeout=10,
        )
        is_member = r.status_code == 204
        log_debug(f"Checked {username} org membership: {is_member}")
        return is_member
    except requests.RequestException as e:
        log_error(f"Failed to check org membership for {username}: {e}")
        return False

def normalize_labels(project: str, labels: list) -> list:
    project = project.lower()

    if project == "dev":
        valid_labels = {"DEV-BUG", "DEV-FEATURE", "DEV-QUEST", "DEV-TRACKING"}
        incoming = [l.upper() for l in labels]
        label = next((l for l in incoming if l in valid_labels), None)
        return [label] if label else []
    
    if project == "support":
        valid_labels = {"SUPPORT-HELP", "SUPPORT-BUG", "SUPPORT-FEATURE", 
                       "SUPPORT-BILLING", "SUPPORT-BALANCE", "SUPPORT-API"}
        incoming = [l.upper() for l in labels]
        label = next((l for l in incoming if l in valid_labels), None)
        return [label] if label else []
    
    if project == "news":
        return []
    
    return []


def get_fallback_classification(_: bool) -> dict:
    return {
        "project": None,
        "priority": None,
        "labels": [],
        "reasoning": "AI classification failed; skipping automation"
    }




def classify_with_ai(is_internal: bool) -> dict:
    system_prompt = f"""
You are a strict classifier.
Return ONLY valid JSON.
Do NOT include explanations outside JSON.
Do NOT invent categories.
Schema (must match exactly):
{{
  "project": "dev" | "support" | "news",
  "priority": "Urgent" | "High" | "Medium" | "Low",
  "labels": ["DEV-BUG","DEV-FEATURE","DEV-QUEST","DEV-TRACKING","SUPPORT-HELP","SUPPORT-BUG","SUPPORT-FEATURE","SUPPORT-BILLING","SUPPORT-BALANCE","SUPPORT-API"],
  "reasoning": "short string"
}}
Rules:
- Choose ONLY from the allowed enum values.
- dev is INTERNAL ONLY — use only for internal authors.
- Infrastructure, pipelines, CI/CD, Docker, services → dev (if internal) else support.
- If ambiguous, choose the closest valid option — never invent a new one.
- Author type: {"internal" if is_internal else "external"}
- Priority options:
  * dev: Urgent, High, Medium, Low
  * support: Urgent, High, Medium, Low
  * news: Urgent only
- Label options depend on project:
  * dev: DEV-BUG, DEV-FEATURE, DEV-QUEST, DEV-TRACKING
  * support: SUPPORT-HELP, SUPPORT-BUG, SUPPORT-FEATURE, SUPPORT-BILLING, SUPPORT-BALANCE, SUPPORT-API
  * news: no labels
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
            
            project = raw.get("project", "").lower()
            if project not in ["dev", "support", "news"]:
                log_error(f"AI returned invalid project: {project}")
                return get_fallback_classification(is_internal)
            
            priority = raw.get("priority", "Medium")
            valid_priorities = {
                "dev": {"Urgent", "High", "Medium", "Low"},
                "support": {"Urgent", "High", "Medium", "Low"},
                "news": {"Urgent"},
            }
            allowed_for_project = valid_priorities.get(project, set())
            if priority not in allowed_for_project:
                log_error(f"AI returned invalid priority for {project}: {priority}")
                priority = list(allowed_for_project)[0] if allowed_for_project else "Medium"
            
            labels = raw.get("labels", [])
            if not isinstance(labels, list):
                labels = []
            
            valid_labels_by_project = {
                "dev": {"DEV-BUG", "DEV-FEATURE", "DEV-QUEST", "DEV-TRACKING"},
                "support": {"SUPPORT-HELP", "SUPPORT-BUG", "SUPPORT-FEATURE", 
                           "SUPPORT-BILLING", "SUPPORT-BALANCE", "SUPPORT-API"},
                "news": set(),
            }
            
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
            return {}
        data = r.json()
        if "errors" in data:
            return {}
        return data.get("data", {})
    except requests.RequestException:
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
    
    is_internal = is_org_member(ISSUE_AUTHOR)
    log_debug(f"Author {ISSUE_AUTHOR} is internal: {is_internal}")
    
    classification = classify_with_ai(is_internal)

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
    
    if project.get("default_status") and project.get("status_field_id"):
        status_option = project["status_options"].get(project["default_status"])
        if status_option:
            set_project_field(
                project["id"],
                item_id,
                project["status_field_id"],
                status_option,
            )
    
    priority_option = project["priority_options"].get(priority)
    if priority_option and project.get("priority_field_id"):
        set_project_field(
            project["id"],
            item_id,
            project["priority_field_id"],
            priority_option,
        )
    add_labels(labels)

if __name__ == "__main__":
    main()
