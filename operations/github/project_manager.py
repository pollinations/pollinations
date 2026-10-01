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
GITHUB_API = "https://api.github.com"
GITHUB_GRAPHQL = "https://api.github.com/graphql"
POLLINATIONS_API = "https://gen.pollinations.ai/v1/chat/completions"
AI_MODEL = "openai/gpt-6-luna"
# Log what would change instead of writing to GitHub (used by the manual dispatch).
DRY_RUN = os.getenv("DRY_RUN") == "1"

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


def fail(msg: str):
    """Log and exit non-zero so a broken run shows up red in Actions."""
    log_error(msg)
    sys.exit(1)


CONFIG = {
    "projects": {
        "dev": {
            "id": "PVT_kwDOBS76fs4AwCAM",
            "name": "Dev",
            # Team vs Community; the SUPPORT view lists Community issues.
            "source_field_id": "PVTSSF_lADOBS76fs4AwCAMzhjSPy4",
            "source_options": {"Team": "00bb2074", "Community": "55f6f20d"},
            "priority_field_id": "PVTSSF_lADOBS76fs4AwCAMzg2DKDk",
            "priority_options": {
                "High": "dc7fa85f",
                "Medium": "e874fe65",
                "Low": "7495a981",
            },
            # Options are read from GitHub by name; the names live in project-manager.md.
            "area_field_name": "Area",
        },
    },
    "discord_relay_bot_id": 247793354,
    # CI bots whose issues report our own failures (github-actions[bot]).
    "ci_bot_ids": {41898282},
    "org_member_ids": {5099901, 36901823, 74301576, 158852059, 34513273},
    "discord_uid_to_github": {
        "304378879705874432": {"id": 5099901, "login": "voodoohop"},
        "884468469452656732": {"id": 36901823, "login": "ElliotEtag"},
        "738661669332320287": {"id": 74301576, "login": "Circuit-Overtime"},
        "859708931478388767": {"id": 158852059, "login": "Itachi-1824"},
    },
}

# The relay bot appends "**Author:** `name` (UID: `123`)" after the relayed message,
# so only whole Author lines count and the last one is the relay's own.
RELAY_AUTHOR_LINE = re.compile(r"^\*\*Author:\*\* .*\(UID:\s*`?(\d+)`?\)\s*$", re.MULTILINE)


def get_real_author() -> tuple[str, Optional[int]]:
    if ISSUE_AUTHOR_ID == CONFIG["discord_relay_bot_id"]:
        uids = RELAY_AUTHOR_LINE.findall(ISSUE_BODY)
        if uids:
            discord_uid = uids[-1]
            log_debug(f"Extracted Discord UID: {discord_uid}")
            github_user = CONFIG["discord_uid_to_github"].get(discord_uid)
            if github_user:
                log_debug(f"Mapped Discord UID {discord_uid} to GitHub user {github_user['login']} (id={github_user['id']})")
                return github_user["login"], github_user["id"]
            log_debug(f"No GitHub mapping for Discord UID {discord_uid}")
    return ISSUE_AUTHOR, ISSUE_AUTHOR_ID


def is_org_member(github_id: Optional[int]) -> bool:
    if github_id is None:
        return False
    is_member = github_id in CONFIG["org_member_ids"]
    log_debug(f"Checked GitHub ID {github_id} org membership: {is_member}")
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


BRIEF_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "project-manager.md")
TYPES = ["Bug", "Feature", "Question", "Task"]
PRIORITIES = ["High", "Medium", "Low"]
APP_SUBMISSION_AREA = "App catalog & showcase"
SKIPPED_LABELS = {"BEE-CENSUS", "HONEY-CENSUS"}


def read_brief() -> str:
    with open(BRIEF_PATH, "r") as f:
        return f.read()


def area_names(brief: str) -> list:
    """The areas, as listed in the brief's overview table."""
    return re.findall(r"^\| \[(.+?)\]\(#.+?\) \| .+? \|$", brief, re.MULTILINE)


def ask_ai(system_prompt: str, user_prompt: str) -> Optional[dict]:
    """Ask the model for a JSON object, retrying transport and parse errors."""
    for attempt in range(3):
        try:
            r = requests.post(
                POLLINATIONS_API,
                headers={
                    "content-type": "application/json",
                    "Authorization": f"Bearer {POLLINATIONS_TOKEN}",
                },
                json={
                    "model": AI_MODEL,
                    "messages": [
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": user_prompt},
                    ],
                    "response_format": {"type": "json_object"},
                    # Reasoning tokens count toward max_tokens; keep headroom for the answer.
                    "reasoning_effort": "low",
                    "max_tokens": 2000,
                },
                timeout=120,
            )
            if r.status_code != 200:
                log_error(f"AI HTTP {r.status_code}: {r.text[:500]}")
            else:
                content = r.json()["choices"][0]["message"]["content"]
                log_debug(f"AI raw response: {content}")
                parsed = json.loads(content)
                if isinstance(parsed, dict):
                    return parsed
                log_error(f"AI returned non-object JSON: {content[:200]}")
        except (
            requests.RequestException,
            KeyError,
            IndexError,
            TypeError,
            ValueError,
        ) as e:
            log_error(f"AI request failed: {e}")
        time.sleep(2**attempt)
    return None


def describe_author() -> str:
    """How the model sees the author; issues relayed from Discord come from people."""
    user = ITEM_DATA.get("user", {})
    if user.get("id") == CONFIG["discord_relay_bot_id"]:
        return f"{user.get('login', '')} (a person, relayed from Discord)"
    return f"{user.get('login', '')} (account type: {user.get('type', 'User')})"


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
    if DRY_RUN:
        log_debug(f"[DRY-RUN] Would add #{ISSUE_NUMBER} to project {project_id}")
        return "dry-run"
    data = graphql_request(mutation, {
        "projectId": project_id,
        "contentId": ISSUE_NODE_ID
    })
    item_id = data.get("addProjectV2ItemById", {}).get("item", {}).get("id")
    if not item_id:
        fail(f"Failed to add #{ISSUE_NUMBER} to project {project_id}")
    log_debug(f"Added to project {project_id}: item_id={item_id}")
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
    if DRY_RUN:
        log_debug(f"[DRY-RUN] Would set project field {field_id} to {option_id}")
        return
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


def assign_issue(assignee: str):
    if not assignee or DRY_RUN:
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


def fetch_pr_files() -> list:
    files = []
    page = 1
    while True:
        try:
            r = requests.get(
                f"{GITHUB_API}/repos/{REPO_OWNER}/{REPO_NAME}/pulls/{ISSUE_NUMBER}/files",
                headers=GITHUB_HEADERS,
                params={"per_page": 100, "page": page},
                timeout=15,
            )
        except requests.RequestException as e:
            fail(f"Exception fetching files for PR #{ISSUE_NUMBER}: {e}")
        if r.status_code != 200:
            fail(
                f"Failed to fetch files for PR #{ISSUE_NUMBER}: {r.status_code} - {r.text[:200]}"
            )
        batch = [f["filename"] for f in r.json()]
        files.extend(batch)
        if len(batch) < 100:
            return files
        page += 1


def fetch_area_options(names: list) -> dict:
    """Area option IDs from the Dev project, by name; fails when the brief and the field differ."""
    project = CONFIG["projects"]["dev"]
    query = """
    query($projectId: ID!, $name: String!) {
        node(id: $projectId) {
            ... on ProjectV2 {
                field(name: $name) {
                    ... on ProjectV2SingleSelectField { id options { id name } }
                }
            }
        }
    }
    """
    field = graphql_request(query, {"projectId": project["id"], "name": project["area_field_name"]})
    field = field.get("node", {}).get("field") or {}
    options = {o["name"]: o["id"] for o in field.get("options", [])}
    missing = [n for n in names if n not in options]
    if not field or missing:
        fail(f"Dev Area field does not match project-manager.md; missing options: {missing}")
    return {"field_id": field["id"], "options": options}


def classify(brief: str, areas: list, facts: str) -> dict:
    """The project manager's answer for the current issue or PR."""
    item = "a pull request" if IS_PULL_REQUEST else "an issue"
    user_prompt = f"""This is {item}.
Author: {describe_author()}
Title: {ISSUE_TITLE}
Body: {ISSUE_BODY[:2000]}
{facts}
"""
    raw = ask_ai(brief, user_prompt)
    if raw is None:
        fail(f"AI classification failed for #{ISSUE_NUMBER}")
    log_debug(f"AI answer: {raw}")
    area = raw.get("area")
    if area not in areas and not (IS_PULL_REQUEST and area is None):
        fail(f"AI returned invalid area for #{ISSUE_NUMBER}: {area!r}")
    if IS_PULL_REQUEST:
        return {"area": area}
    if raw.get("type") not in TYPES or raw.get("priority") not in PRIORITIES:
        fail(f"AI returned invalid type or priority for #{ISSUE_NUMBER}: {raw.get('type')!r}, {raw.get('priority')!r}")
    return {"area": area, "type": raw["type"], "priority": raw["priority"]}


def set_area(item_id: str, area_field: dict, area: Optional[str]):
    if area is None:
        log_debug(f"No area for #{ISSUE_NUMBER}")
        return
    project = CONFIG["projects"]["dev"]
    set_project_field(project["id"], item_id, area_field["field_id"], area_field["options"][area])


def set_issue_type(issue_type: str):
    if DRY_RUN:
        log_debug(f"[DRY-RUN] Would set issue type: {issue_type}")
        return
    try:
        r = requests.patch(
            f"{GITHUB_API}/repos/{REPO_OWNER}/{REPO_NAME}/issues/{ISSUE_NUMBER}",
            headers=GITHUB_HEADERS,
            json={"type": issue_type},
            timeout=10,
        )
    except requests.RequestException as e:
        fail(f"Exception setting issue type on #{ISSUE_NUMBER}: {e}")
    if r.status_code != 200:
        fail(f"Failed to set issue type {issue_type} on #{ISSUE_NUMBER}: {r.status_code} - {r.text[:200]}")
    log_debug(f"Set issue type: {issue_type}")


def label_names() -> set:
    return {l.get("name", "").upper() for l in ITEM_DATA.get("labels", []) if isinstance(l, dict)}


def organize_pull_request(brief: str, areas: list, area_field: dict):
    # Every PR sits next to the issues in Dev, where views separate them.
    item_id = add_to_project(CONFIG["projects"]["dev"]["id"])
    files = fetch_pr_files()
    listed = "\n".join(files[:300]) + (f"\n... and {len(files) - 300} more" if len(files) > 300 else "")
    answer = classify(brief, areas, f"Changed files ({len(files)}):\n{listed}")
    if DRY_RUN:
        print(f"DRY-RUN #{ISSUE_NUMBER}\t{answer['area']}\t{ISSUE_TITLE}")
    set_area(item_id, area_field, answer["area"])


def organize_issue(brief: str, areas: list, area_field: dict):
    project = CONFIG["projects"]["dev"]
    real_author, real_author_id = get_real_author()
    is_internal = ISSUE_AUTHOR_ID in CONFIG["ci_bot_ids"] or is_org_member(real_author_id)
    log_debug(f"Author {ISSUE_AUTHOR} (real: {real_author}, id={real_author_id}) is internal: {is_internal}")
    if real_author != ISSUE_AUTHOR and is_internal:
        assign_issue(real_author)

    answer = classify(brief, areas, f"Author type: {'Internal' if is_internal else 'External'}")
    source = "Team" if is_internal else "Community"
    priority = answer["priority"]
    if source == "Community" and is_paid_customer(real_author_id):
        log_debug(f"Author {real_author} (id={real_author_id}) is a paying customer; raising priority to High")
        priority = "High"
    if DRY_RUN:
        print(f"DRY-RUN #{ISSUE_NUMBER}\t{source}\t{priority}\t{answer['type']}\t{answer['area']}\t{ISSUE_TITLE}")

    item_id = add_to_project(project["id"])
    set_project_field(project["id"], item_id, project["source_field_id"], project["source_options"][source])
    set_project_field(project["id"], item_id, project["priority_field_id"], project["priority_options"][priority])
    set_area(item_id, area_field, answer["area"])
    set_issue_type(answer["type"])


def main():
    log_debug(f"Processing #{ISSUE_NUMBER}: {ISSUE_TITLE}")
    if not ISSUE_NUMBER or not ISSUE_NODE_ID:
        log_debug("Missing ISSUE_NUMBER or ISSUE_NODE_ID, skipping")
        return
    labels = label_names()
    if not IS_PULL_REQUEST and labels & SKIPPED_LABELS:
        log_debug("Survey response; skipping")
        return

    brief = read_brief()
    areas = area_names(brief)
    area_field = fetch_area_options(areas)

    if IS_PULL_REQUEST:
        organize_pull_request(brief, areas, area_field)
    elif "APP-SUBMISSION" in labels:
        log_debug("App submission; routing to Dev without classification")
        set_area(add_to_project(CONFIG["projects"]["dev"]["id"]), area_field, APP_SUBMISSION_AREA)
    else:
        organize_issue(brief, areas, area_field)


if __name__ == "__main__":
    main()
