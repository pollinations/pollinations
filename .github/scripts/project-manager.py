import sys
import os
import json
import re
import requests
import time
from typing import Optional


GITHUB_TOKEN = os.getenv("GITHUB_TOKEN")
POLLINATIONS_TOKEN = os.getenv("POLLINATIONS_TOKEN")
TINYBIRD_READ_TOKEN = os.getenv("TINYBIRD_READ_TOKEN")
TINYBIRD_API = "https://api.europe-west2.gcp.tinybird.co"
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
ISSUE_DB_ID = ITEM_DATA.get("id")
ISSUE_TITLE = ITEM_DATA.get("title", "")
ISSUE_BODY = ITEM_DATA.get("body", "") or ""
ISSUE_AUTHOR = ITEM_DATA.get("user", {}).get("login", "")
ISSUE_AUTHOR_ID = ITEM_DATA.get("user", {}).get("id")
ISSUE_NODE_ID = ITEM_DATA.get("node_id", "")
PR_HEAD_REF = ITEM_DATA.get("head", {}).get("ref", "") if IS_PULL_REQUEST else ""
GITHUB_API = "https://api.github.com"
GITHUB_GRAPHQL = "https://api.github.com/graphql"
POLLINATIONS_API = "https://gen.pollinations.ai/v1/chat/completions"

# Validate required tokens at startup
if not GITHUB_TOKEN:
    print("GITHUB_TOKEN environment variable not set")
    sys.exit(1)
if not POLLINATIONS_TOKEN:
    print("POLLINATIONS_TOKEN environment variable not set")
    sys.exit(1)

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
            "priority_field_id": "PVTSSF_lADOBS76fs4BLr1Hzg7NAkI",
            "priority_options": {
                "Urgent": "5b4c403c",
                "High": "509f6cf1",
                "Low": "ca5161be",
            },
        },
        "apps": {
            "id": "PVT_kwDOBS76fs4BLtE_",
            "name": "Apps",
            "internal_only": False,
        },
    },
    "org_members": [
        "voodoohop",
        "ElliotEtag",
        "Circuit-Overtime",
        "Itachi-1824",
        "fisventurous"
    ],
    "discord_uid_to_github": {
        "304378879705874432": "voodoohop",
        "884468469452656732": "ElliotEtag",
        "738661669332320287": "Circuit-Overtime",
        "859708931478388767": "Itachi-1824",
    },
}

def get_real_author() -> str:
    if ISSUE_AUTHOR and "pollinations-ai" in ISSUE_AUTHOR.lower():
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


_PAID_CUSTOMER_IDS: Optional[set] = None


def fetch_paid_customer_ids() -> set:
    """Return the set of GitHub numeric user IDs that have ever completed a paid
    Stripe checkout. Cached for the lifetime of the process."""
    global _PAID_CUSTOMER_IDS
    if _PAID_CUSTOMER_IDS is not None:
        return _PAID_CUSTOMER_IDS
    if not TINYBIRD_READ_TOKEN:
        log_debug("TINYBIRD_READ_TOKEN not set; skipping paid-customer lookup")
        _PAID_CUSTOMER_IDS = set()
        return _PAID_CUSTOMER_IDS
    try:
        r = requests.get(
            f"{TINYBIRD_API}/v0/pipes/paid_customers.json",
            headers={"Authorization": f"Bearer {TINYBIRD_READ_TOKEN}"},
            timeout=15,
        )
        if r.status_code != 200:
            log_error(f"Tinybird paid_customers HTTP {r.status_code}: {r.text[:200]}")
            _PAID_CUSTOMER_IDS = set()
            return _PAID_CUSTOMER_IDS
        rows = r.json().get("data", [])
        _PAID_CUSTOMER_IDS = {row["github_id"] for row in rows if row.get("github_id") is not None}
        log_debug(f"Loaded {len(_PAID_CUSTOMER_IDS)} paid-customer GitHub IDs from Tinybird")
        return _PAID_CUSTOMER_IDS
    except (requests.RequestException, ValueError) as e:
        log_error(f"Failed to fetch paid customers: {e}")
        _PAID_CUSTOMER_IDS = set()
        return _PAID_CUSTOMER_IDS


def is_paid_customer(github_id) -> bool:
    if github_id is None:
        return False
    return github_id in fetch_paid_customer_ids()

def get_script_dir() -> str:
    return os.path.dirname(os.path.abspath(__file__))


def read_prompt_file() -> str:
    prompt_path = os.path.join(get_script_dir(), "..", "prompts", "project-manager.md")
    try:
        with open(prompt_path, "r") as f:
            return f.read()
    except FileNotFoundError:
        log_error(f"Prompt file not found at {prompt_path}")
        return ""


VALID_LABELS = {
    "dev": {"DEV-BUG", "DEV-FEATURE", "DEV-TRACKING", "DEV-DOCS", "DEV-INFRA", "DEV-CHORE", "DEV-APP", "DEV-UI-UX"},
    "support": {
        ".BUG", ".OUTAGE", ".QUESTION", ".REQUEST", ".DOCS", ".INTEGRATION",
        "IMAGE", "TEXT", "AUDIO", "VIDEO", "API", "WEB", "CREDITS", "BILLING", "ACCOUNT", "TIER",
    },
}

SUPPORT_TYPE_LABELS = {".BUG", ".OUTAGE", ".QUESTION", ".REQUEST", ".DOCS", ".INTEGRATION"}
SUPPORT_SERVICE_LABELS = {"IMAGE", "TEXT", "AUDIO", "VIDEO", "API", "WEB", "CREDITS", "BILLING", "ACCOUNT", "TIER"}

PROTECTED_LABELS = {
    "dev": {"DEV-TRACKING", "DEV-VOTING"},
}


def normalize_labels(project: str, labels: list) -> list:
    project = project.lower()
    valid_labels = VALID_LABELS.get(project, set())
    
    if not valid_labels:
        return []
    
    incoming = [l.upper() for l in labels]
    
    if project == "dev":
        label = next((l for l in incoming if l in valid_labels), None)
        return [label] if label else []
    
    if project == "support":
        type_label = next((l for l in incoming if l in SUPPORT_TYPE_LABELS), None)
        service_label = next((l for l in incoming if l in SUPPORT_SERVICE_LABELS), None)
        return [l for l in (type_label, service_label) if l]

    return []


def get_fallback_classification(_: bool) -> dict:
    return {
        "project": None,
        "priority": None,
        "labels": [],
        "tracking_issue": None,
        "reasoning": "AI classification failed; skipping automation"
    }


def classify_with_ai(is_internal: bool, tracking_issues: Optional[list] = None) -> dict:
    base_prompt = read_prompt_file()
    item_kind = "pull request" if IS_PULL_REQUEST else "issue"

    tracking_block = ""
    if tracking_issues:
        tracking_lines = "\n".join(f"- #{e['number']}: {e['title']}" for e in tracking_issues)
        tracking_block = (
            "\n\n## Dev Tracking Issues (choose `tracking_issue` from these for dev issues)\n"
            f"{tracking_lines}\n"
        )

    system_prompt = f"""{base_prompt}
{tracking_block}
---
**Context:** This is a {item_kind}. Author type is {"internal" if is_internal else "external"}
"""

    user_prompt = f"""
Item Type: {item_kind}
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
            try:
                resp_json = r.json()
                if not isinstance(resp_json, dict) or "choices" not in resp_json:
                    log_error(f"AI response missing 'choices' key: {resp_json}")
                    time.sleep(2 ** attempt)
                    continue
                if not resp_json["choices"] or not isinstance(resp_json["choices"][0], dict):
                    log_error(f"AI response 'choices' is empty or malformed")
                    time.sleep(2 ** attempt)
                    continue
                if "message" not in resp_json["choices"][0]:
                    log_error(f"AI response missing 'message' in choice: {resp_json['choices'][0]}")
                    time.sleep(2 ** attempt)
                    continue
                if "content" not in resp_json["choices"][0]["message"]:
                    log_error(f"AI response missing 'content' in message")
                    time.sleep(2 ** attempt)
                    continue
                content = resp_json["choices"][0]["message"]["content"]
            except (KeyError, TypeError, IndexError) as e:
                log_error(f"AI response structure error: {e}")
                time.sleep(2 ** attempt)
                continue
            
            log_debug(f"AI raw response: {content}")

            raw = json.loads(content)

            is_app_submission = raw.get("is_app_submission", False)

            project = raw.get("project", "").lower()
            if project not in ["dev", "support"]:
                log_error(f"AI returned invalid project: {project}")
                return get_fallback_classification(is_internal)

            priority = raw.get("priority")
            if project == "support":
                valid_priorities = {"High", "Low"}
                if priority not in valid_priorities:
                    log_error(f"AI returned invalid priority: {priority}")
                    priority = "Low"
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

            tracking_raw = raw.get("tracking_issue")
            tracking_number = None
            if isinstance(tracking_raw, bool):
                tracking_number = None
            elif isinstance(tracking_raw, int):
                tracking_number = tracking_raw
            elif isinstance(tracking_raw, str) and tracking_raw.strip().lstrip("#").isdigit():
                tracking_number = int(tracking_raw.strip().lstrip("#"))

            classification = {
                "project": project,
                "priority": priority,
                "labels": filtered_labels,
                "tracking_issue": tracking_number,
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


_TRACKING_ISSUES: Optional[list] = None


def fetch_tracking_issues() -> list:
    """Open Dev tracking issues (labelled DEV-TRACKING). Returns [{number, title}] so the
    AI can pick the best-fit parent. Cached for the lifetime of the process."""
    global _TRACKING_ISSUES
    if _TRACKING_ISSUES is not None:
        return _TRACKING_ISSUES
    try:
        r = requests.get(
            f"{GITHUB_API}/repos/{REPO_OWNER}/{REPO_NAME}/issues",
            headers=GITHUB_HEADERS,
            params={"labels": "DEV-TRACKING", "state": "open", "per_page": 100},
            timeout=15,
        )
        if r.status_code != 200:
            log_error(f"Failed to fetch tracking issues: {r.status_code} - {r.text[:200]}")
            _TRACKING_ISSUES = []
            return _TRACKING_ISSUES
        _TRACKING_ISSUES = [
            {"number": i["number"], "title": i.get("title", "")}
            for i in r.json()
            if "pull_request" not in i and i.get("number") != ISSUE_NUMBER
        ]
        log_debug(f"Loaded {len(_TRACKING_ISSUES)} open tracking issues")
        return _TRACKING_ISSUES
    except (requests.RequestException, ValueError) as e:
        log_error(f"Exception fetching tracking issues: {e}")
        _TRACKING_ISSUES = []
        return _TRACKING_ISSUES


def assign_to_tracking_issue(parent_number: int, child_db_id: int) -> bool:
    """Link the current issue as a native sub-issue of tracking issue #parent_number."""
    try:
        r = requests.post(
            f"{GITHUB_API}/repos/{REPO_OWNER}/{REPO_NAME}/issues/{parent_number}/sub_issues",
            headers={**GITHUB_HEADERS, "X-GitHub-Api-Version": "2026-03-10"},
            json={"sub_issue_id": child_db_id},
            timeout=15,
        )
        if r.status_code in (200, 201):
            log_debug(f"Linked #{ISSUE_NUMBER} as sub-issue of tracking issue #{parent_number}")
            return True
        log_error(f"Failed to link #{ISSUE_NUMBER} under tracking issue #{parent_number}: {r.status_code} - {r.text[:200]}")
        return False
    except requests.RequestException as e:
        log_error(f"Exception linking sub-issue under #{parent_number}: {e}")
        return False


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


def assign_issue(assignee: str):
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
        log_debug(f"Found TIER labels: {tier_labels}, routing to Apps project")
        project = CONFIG["projects"].get("apps")
        if project:
            item_id = add_to_project(project["id"])
            if item_id:
                log_debug(f"Added to Apps project successfully")
            return
        else:
            log_error("Apps project not configured")
            return
    if "POLLEN-QUEST" in existing_labels or "DRAFT-QUEST" in existing_labels:
        log_debug("Found quest label; not project-manager's responsibility, skipping")
        return

    if "NEWS" in existing_labels:
        log_debug("Found NEWS label, skipping (used by social pipeline, no project routing)")
        return

    if IS_PULL_REQUEST and re.match(r"^auto/app-\d+-", PR_HEAD_REF):
        log_debug(f"App-submission PR (branch {PR_HEAD_REF}), routing to Apps project")
        project = CONFIG["projects"].get("apps")
        if project:
            item_id = add_to_project(project["id"])
            if item_id:
                log_debug("Added to Apps project successfully")
        else:
            log_error("Apps project not configured")
        return

    real_author = get_real_author()
    is_internal = is_org_member(real_author)
    log_debug(f"Author {ISSUE_AUTHOR} (real: {real_author}) is internal: {is_internal}")
    
    if real_author != ISSUE_AUTHOR and is_internal:
        assign_issue(real_author)

    tracking_issues = [] if IS_PULL_REQUEST else fetch_tracking_issues()
    classification = classify_with_ai(is_internal, tracking_issues)
    
    if classification.get("is_app_submission"):
        log_debug("AI detected app submission, routing to Apps project")
        project = CONFIG["projects"].get("apps")
        if project:
            item_id = add_to_project(project["id"])
            if item_id:
                log_debug("Added to Apps project successfully")
            else:
                log_error("Failed to add app submission to Apps project")
            return
        else:
            log_error("Apps project not configured")
            return

    if not classification.get("project"):
        log_debug("AI did not classify project, skipping")
        return
    
    project_key = classification["project"].lower()

    if IS_PULL_REQUEST:
        if project_key != "dev":
            log_debug(f"PR #{ISSUE_NUMBER}: overriding project '{project_key}' -> 'dev' (PRs always route to dev)")
        project_key = "dev"
    elif project_key == "dev" and not is_internal:
        log_debug(f"Project 'dev' is internal-only, but author {ISSUE_AUTHOR} is external. Reassigning to support.")
        project_key = "support"
    
    priority = classification.get("priority", "Low")
    if project_key == "support" and is_paid_customer(ISSUE_AUTHOR_ID):
        log_debug(f"Author {ISSUE_AUTHOR} (id={ISSUE_AUTHOR_ID}) is a paid customer; overriding priority to Urgent")
        priority = "Urgent"
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
    
    if project_key == "support":
        priority_option = project.get("priority_options", {}).get(priority)
        if priority_option and project.get("priority_field_id"):
            set_project_field(
                project["id"],
                item_id,
                project["priority_field_id"],
                priority_option,
            )
    protected = PROTECTED_LABELS.get(project_key, set())
    if protected & set(existing_labels):
        log_debug(f"Issue has protected labels {protected & set(existing_labels)}, skipping label update")
    else:
        add_labels(labels)

    # Parent new Dev issues under the best-fit tracking issue (skip PRs and tracking issues themselves)
    is_tracking_issue = "DEV-TRACKING" in existing_labels or "DEV-TRACKING" in labels
    if project_key == "dev" and not IS_PULL_REQUEST and ISSUE_DB_ID and not is_tracking_issue:
        parent = classification.get("tracking_issue")
        valid_parents = {e["number"] for e in tracking_issues}
        if parent in valid_parents:
            assign_to_tracking_issue(parent, ISSUE_DB_ID)
        elif parent is not None:
            log_debug(f"AI returned tracking issue #{parent} not in current list; leaving #{ISSUE_NUMBER} unparented")
        else:
            log_debug(f"No tracking issue selected for #{ISSUE_NUMBER}; left unparented")

if __name__ == "__main__":
    main()
