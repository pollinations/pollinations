import os
import json
import requests
import time
from typing import Optional


GITHUB_TOKEN = os.getenv("GITHUB_TOKEN")
POLLINATIONS_TOKEN = os.getenv("POLLINATIONS_TOKEN")
GITHUB_EVENT_PATH = os.getenv("GITHUB_EVENT_PATH")
if not GITHUB_EVENT_PATH or not os.path.exists(GITHUB_EVENT_PATH):
    GITHUB_EVENT = {}
else:
    with open(GITHUB_EVENT_PATH, "r") as f:
        GITHUB_EVENT = json.load(f)
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
                "To Do": "d89ca0b2",
                "In Progress": "47fc9ee4",
                "In Review": "ca6ba6c3",
                "Done": "98236657",
                "Discarded": "bc3f7e3a",
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
            "default_status": "To do",
            "status_field_id": "PVTSSF_lADOBS76fs4BLr1Hzg7L1RQ",
            "status_options": {
                "To do": "f75ad846",
                "In progress": "47fc9ee4",
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
            "default_status": "Review",
            "status_field_id": "PVTSSF_lADOBS76fs4BLtD8zg7Mrxg",
            "status_options": {
                "Review": "f75ad846",
                "Done": "98236657",
            },
            "priority_field_id": None,
            "priority_options": {},
        }
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
        return True
    try:
        r = requests.get(
            f"{GITHUB_API}/orgs/{REPO_OWNER}/members/{username}",
            headers=GITHUB_HEADERS,
            timeout=10,
        )
        return r.status_code == 204
    except requests.RequestException:
        return False

def normalize_labels(project: str, labels: list) -> list:
    project = project.lower()

    HIERARCHY = {
        "dev": {
            "TOP": "DEV",
            "TYPE": {"BUG", "FEATURE", "QUEST", "TRACKING"},
            "TAG": set(),
        },
        "support": {
            "TOP": "SUPPORT",
            "TYPE": {"BUG", "FEATURE", "HELP"},
            "TAG": {"BALANCE", "BILLING", "API"},
        },
        "news": {
            "TOP": "NEWS",
            "TYPE": set(),
            "TAG": set(),
        },
    }

    rules = HIERARCHY.get(project)
    if not rules:
        return []
    incoming = [l.upper() for l in labels]
    top = rules["TOP"]
    type_label = next((l for l in incoming if l in rules["TYPE"]), None)
    tag_label = next((l for l in incoming if l in rules["TAG"]), None)
    final = [top]
    if type_label:
        final.append(type_label)

    if tag_label and len(final) < 3:
        final.append(tag_label)

    return final


def get_fallback_classification(_: bool) -> dict:
    return {
        "project": None,
        "priority": None,
        "labels": [],
        "assignee": None,
        "reasoning": "AI classification failed; skipping automation"
    }



def classify_with_ai(is_internal: bool) -> dict:
    system_prompt = """
    Return ONLY valid JSON with this exact schema:

    {
    "project": "dev|support|news|null",
    "priority": "Urgent|High|Medium|Low",
    "labels": ["BUG","FEATURE","HELP","QUEST","TRACKING","BALANCE","BILLING","API"],
    "assignee": "string|null",
    "reasoning": "string"
    }

    Rules:
    - Do NOT invent new labels
    - Use null if unsure
    - dev is internal-only
    """

    user_prompt = f"""
    Author: {ISSUE_AUTHOR}
    Title: {ISSUE_TITLE}
    Body: {ISSUE_BODY[:2000]}
    """

    for attempt in range(3):
        try:
            r = requests.post(
                POLLINATIONS_API,
                headers={"Authorization": f"Bearer {POLLINATIONS_TOKEN}"},
                json={
                    "model": "openai",
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
                time.sleep(2 ** attempt)
                continue

            content = r.json()["choices"][0]["message"]["content"]
            raw = json.loads(content)
            return {
                "project": raw.get("project"),
                "priority": raw.get("priority", "Medium"),
                "labels": raw.get("labels", []) if isinstance(raw.get("labels"), list) else [],
                "assignee": raw.get("assignee"),
                "reasoning": raw.get("reasoning", "")
            }


        except Exception:
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
    return data.get("addProjectV2ItemById", {}).get("item", {}).get("id")


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
    graphql_request(mutation, {
        "projectId": project_id,
        "itemId": item_id,
        "fieldId": field_id,
        "optionId": option_id,
    })


def add_labels(labels: list):
    if not labels:
        return
    requests.post(
        f"{GITHUB_API}/repos/{REPO_OWNER}/{REPO_NAME}/issues/{ISSUE_NUMBER}/labels",
        headers=GITHUB_HEADERS,
        json={"labels": labels},
        timeout=10,
    )


def assign_issue(assignee: str):
    if IS_PULL_REQUEST:
        return
    requests.patch(
        f"{GITHUB_API}/repos/{REPO_OWNER}/{REPO_NAME}/issues/{ISSUE_NUMBER}",
        headers=GITHUB_HEADERS,
        json={"assignees": [assignee]},
        timeout=10,
    )


def main():
    if not ISSUE_NUMBER or not ISSUE_NODE_ID:
        return
    is_internal = is_org_member(ISSUE_AUTHOR)
    classification = classify_with_ai(is_internal)

    if not classification.get("project"):
        return
    project_key = classification["project"].lower()
    priority = classification.get("priority", "Medium")

    project = CONFIG["projects"].get(project_key)
    if not project:
        return

    if project.get("internal_only") and not is_internal:
        project_key = "support"
        project = CONFIG["projects"]["support"]
    labels = normalize_labels(project_key, classification.get("labels", []))

    item_id = add_to_project(project["id"])
    if not item_id:
        return
    priority_option = project["priority_options"].get(priority)
    if priority_option and project.get("priority_field_id"):
        set_project_field(
            project["id"],
            item_id,
            project["priority_field_id"],
            priority_option,
        )
    add_labels(labels)

    assignee = classification.get("assignee")
    if assignee in CONFIG["org_members"]:
        assign_issue(assignee)

if __name__ == "__main__":
    main()
