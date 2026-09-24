import sys
import os
import json
import re
import requests
import time
from typing import Optional
from urllib.parse import quote


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
AI_MODEL = "gpt-5.6-luna"
# Log what would change instead of writing to GitHub (used by the manual dispatch).
DRY_RUN = os.getenv("DRY_RUN") == "1"
# Re-classify items that already have labels, replacing the classifier's older labels.
RELABEL = os.getenv("RELABEL") == "1"

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
                "Urgent": "0a3c2fd1",
                "High": "dc7fa85f",
                "Medium": "e874fe65",
                "Low": "7495a981",
            },
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

def get_script_dir() -> str:
    return os.path.dirname(os.path.abspath(__file__))


def read_prompt_file() -> str:
    with open(os.path.join(get_script_dir(), "project-manager.md"), "r") as f:
        return f.read()


# One label list for issues and pull requests; definitions live in project-manager.md.
# Kinds are listed in tie-break order.
KINDS = ["MODEL", "ECONOMICS", "MONITORING", "APPS", "INFRA", "UI-UX", "API", "DOCS"]
ISSUE_TYPES = ["BUG", "FEATURE", "QUESTION", "OUTAGE", "TRACKING"]
PR_TYPES = ["BUG"]
ISSUE_FLAGS = {"BILLING", "SECURITY", "AUTOMATED"}
# POLLEN-QUEST stays PR-only: on an issue it publishes a rewarded quest.
PR_FLAGS = ISSUE_FLAGS | {"POLLEN-QUEST"}
# Labels the classifier owns; a relabel replaces these and leaves workflow labels alone.
CLASSIFIER_LABELS = set(KINDS) | set(ISSUE_TYPES) | PR_FLAGS
# Types a person set on an issue that the classifier keeps.
PINNED_TYPES = {"TRACKING", "VOTING"}


def parse_labels(raw: dict, types: list, flags: set) -> Optional[list]:
    """The model's kind, type and flags as labels; None when the kind is invalid."""
    kind = str(raw.get("kind", "")).upper()
    if kind not in KINDS:
        log_error(f"AI returned invalid kind: {raw.get('kind')!r}")
        return None
    item_type = str(raw.get("type") or "").upper()
    raw_flags = raw.get("flags") if isinstance(raw.get("flags"), list) else []
    picked = [f.upper() for f in raw_flags if isinstance(f, str) and f.upper() in flags]
    return list(dict.fromkeys([kind, *([item_type] if item_type in types else []), *picked]))


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


def classify_with_ai(
    is_internal: bool,
    tracking_issues: Optional[list] = None,
) -> Optional[dict]:
    tracking_block = ""
    if tracking_issues:
        tracking_lines = "\n".join(f"- #{e['number']}: {e['title']}" for e in tracking_issues)
        tracking_block = (
            "\n\n## Dev Tracking Issues (choose `tracking_issue` from these for team issues)\n"
            f"{tracking_lines}\n"
        )

    system_prompt = f"""{read_prompt_file()}
{tracking_block}
---
**Context:** This is an issue; follow the Issues section. Author type is {"internal" if is_internal else "external"}
"""

    user_prompt = f"""
Author: {ISSUE_AUTHOR} (account type: {ITEM_DATA.get("user", {}).get("type", "User")})
Author Type: {"Internal" if is_internal else "External"}
Title: {ISSUE_TITLE}
Body: {ISSUE_BODY[:2000]}
"""

    raw = ask_ai(system_prompt, user_prompt)
    if raw is None:
        return None

    is_app_submission = raw.get("is_app_submission", False)

    # Team priority is set by hand; community issues get High or Low.
    priority = None
    if not is_internal:
        priority = raw.get("priority")
        if priority not in {"High", "Low"}:
            log_error(f"AI returned invalid priority: {priority}")
            priority = "Low"

    labels = parse_labels(raw, ISSUE_TYPES, ISSUE_FLAGS)
    if labels is None:
        return None

    tracking_raw = raw.get("tracking_issue")
    tracking_number = None
    if isinstance(tracking_raw, bool):
        tracking_number = None
    elif isinstance(tracking_raw, int):
        tracking_number = tracking_raw
    elif isinstance(tracking_raw, str) and tracking_raw.strip().lstrip("#").isdigit():
        tracking_number = int(tracking_raw.strip().lstrip("#"))

    classification = {
        "priority": priority,
        "labels": labels,
        "tracking_issue": tracking_number,
        "reasoning": raw.get("reasoning", ""),
        "is_app_submission": is_app_submission,
    }

    log_debug(f"AI parsed classification: {classification}")
    return classification


def classify_pr(files: list, linked_issues: list) -> dict:
    """Pick the kind, type and flags for the current pull request."""
    listed = "\n".join(files[:300])
    more = f"\n... and {len(files) - 300} more" if len(files) > 300 else ""
    author = ITEM_DATA.get("user", {})
    user_prompt = f"""
Author: {author.get("login", "")} (account type: {author.get("type", "User")})
Title: {ISSUE_TITLE}
Body: {ISSUE_BODY[:2000]}
Linked issues:
{chr(10).join(linked_issues) or "none"}
Changed files ({len(files)}):
{listed}{more}
"""
    system_prompt = f"""{read_prompt_file()}
---
**Context:** This is a pull request; follow the Pull requests section.
"""
    raw = ask_ai(system_prompt, user_prompt)
    if raw is None:
        fail(f"AI classification failed for PR #{ISSUE_NUMBER}")

    labels = parse_labels(raw, PR_TYPES, PR_FLAGS)
    if labels is None:
        fail(f"AI returned no valid kind for PR #{ISSUE_NUMBER}")
    return {"labels": labels, "reasoning": raw.get("reasoning", "")}


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


_TRACKING_ISSUES: Optional[list] = None


def fetch_tracking_issues() -> list:
    """Open Dev tracking issues (labelled TRACKING, opened by the team). Returns
    [{number, title}] so the AI can pick the best-fit parent. Community epics also
    carry TRACKING but live in Support, so they are never parents for Dev issues.
    Cached for the lifetime of the process."""
    global _TRACKING_ISSUES
    if _TRACKING_ISSUES is not None:
        return _TRACKING_ISSUES
    try:
        r = requests.get(
            f"{GITHUB_API}/repos/{REPO_OWNER}/{REPO_NAME}/issues",
            headers=GITHUB_HEADERS,
            params={"labels": "TRACKING", "state": "open", "per_page": 100},
            timeout=15,
        )
        if r.status_code != 200:
            log_error(f"Failed to fetch tracking issues: {r.status_code} - {r.text[:200]}")
            _TRACKING_ISSUES = []
            return _TRACKING_ISSUES
        _TRACKING_ISSUES = [
            {"number": i["number"], "title": i.get("title", "")}
            for i in r.json()
            if "pull_request" not in i
            and i.get("number") != ISSUE_NUMBER
            and i.get("user", {}).get("id") in CONFIG["org_member_ids"]
        ]
        log_debug(f"Loaded {len(_TRACKING_ISSUES)} open tracking issues")
        return _TRACKING_ISSUES
    except (requests.RequestException, ValueError) as e:
        log_error(f"Exception fetching tracking issues: {e}")
        _TRACKING_ISSUES = []
        return _TRACKING_ISSUES


def assign_to_tracking_issue(parent_number: int, child_db_id: int) -> bool:
    """Link the current issue as a native sub-issue of tracking issue #parent_number."""
    if DRY_RUN:
        log_debug(f"[DRY-RUN] Would link #{ISSUE_NUMBER} under tracking issue #{parent_number}")
        return True
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


def add_labels(labels: list):
    if not labels:
        log_debug("No labels to add")
        return
    if DRY_RUN:
        log_debug(f"[DRY-RUN] Would add labels: {labels}")
        return
    try:
        r = requests.post(
            f"{GITHUB_API}/repos/{REPO_OWNER}/{REPO_NAME}/issues/{ISSUE_NUMBER}/labels",
            headers=GITHUB_HEADERS,
            json={"labels": labels},
            timeout=10,
        )
    except requests.RequestException as e:
        fail(f"Exception adding labels to #{ISSUE_NUMBER}: {e}")
    if r.status_code != 200:
        fail(f"Failed to add labels to #{ISSUE_NUMBER}: {r.status_code} - {r.text}")
    log_debug(f"Added labels: {labels}")


def remove_label(label: str):
    if DRY_RUN:
        log_debug(f"[DRY-RUN] Would remove label: {label}")
        return
    try:
        r = requests.delete(
            f"{GITHUB_API}/repos/{REPO_OWNER}/{REPO_NAME}/issues/{ISSUE_NUMBER}/labels/{quote(label)}",
            headers=GITHUB_HEADERS,
            timeout=10,
        )
    except requests.RequestException as e:
        fail(f"Exception removing label {label} from #{ISSUE_NUMBER}: {e}")
    if r.status_code not in (200, 404):
        fail(f"Failed to remove label {label} from #{ISSUE_NUMBER}: {r.status_code} - {r.text}")
    log_debug(f"Removed label: {label}")


def set_labels(labels: list):
    """Apply the classifier's labels; a relabel first drops its older ones."""
    if RELABEL:
        for stale in sorted((set(get_existing_labels()) & CLASSIFIER_LABELS) - set(labels)):
            remove_label(stale)
    add_labels(labels)


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


def get_existing_labels() -> list:
    labels = ITEM_DATA.get("labels", [])
    return [l.get("name", "").upper() for l in labels if isinstance(l, dict)]


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


def fetch_linked_issues() -> list:
    """Title and labels of issues the PR title or body references, for the model."""
    refs = set(re.findall(r"(?:#|/issues/)(\d+)", f"{ISSUE_TITLE}\n{ISSUE_BODY}"))
    refs.discard(str(ISSUE_NUMBER))
    linked = []
    for number in sorted(refs, key=int, reverse=True)[:10]:
        try:
            r = requests.get(
                f"{GITHUB_API}/repos/{REPO_OWNER}/{REPO_NAME}/issues/{number}",
                headers=GITHUB_HEADERS,
                timeout=10,
            )
        except requests.RequestException as e:
            fail(f"Exception fetching referenced issue #{number}: {e}")
        if r.status_code == 404:
            continue
        if r.status_code != 200:
            fail(
                f"Failed to fetch referenced issue #{number}: {r.status_code} - {r.text[:200]}"
            )
        issue = r.json()
        labels = ", ".join(l.get("name", "") for l in issue.get("labels", []))
        linked.append(f"#{number} {issue.get('title', '')} (labels: {labels or 'none'})")
    return linked


def label_pull_request():
    if not RELABEL and set(get_existing_labels()) & set(KINDS):
        log_debug(f"PR #{ISSUE_NUMBER} already has a kind label, skipping")
        return

    classification = classify_pr(fetch_pr_files(), fetch_linked_issues())
    labels = classification["labels"]
    log_debug(f"PR #{ISSUE_NUMBER} labels: {labels} ({classification['reasoning']})")
    if DRY_RUN:
        print(f"DRY-RUN #{ISSUE_NUMBER}\t{','.join(labels)}\t{ISSUE_TITLE}")

    set_labels(labels)
    # Every open PR sits next to the issues in Dev, where views separate them.
    add_to_project(CONFIG["projects"]["dev"]["id"])


def main():
    log_debug(f"Processing issue/PR #{ISSUE_NUMBER}: {ISSUE_TITLE}")
    if not ISSUE_NUMBER or not ISSUE_NODE_ID:
        log_debug("Missing ISSUE_NUMBER or ISSUE_NODE_ID, skipping")
        return

    if IS_PULL_REQUEST:
        label_pull_request()
        return

    existing_labels = get_existing_labels()
    if "APP-SUBMISSION" in existing_labels:
        log_debug("Found APP-SUBMISSION label, routing to Dev project")
        add_to_project(CONFIG["projects"]["dev"]["id"])
        return
    if "POLLEN-QUEST" in existing_labels or "DRAFT-QUEST" in existing_labels:
        log_debug("Found quest label; not project-manager's responsibility, skipping")
        return

    if "NEWS" in existing_labels:
        log_debug("Found NEWS label, skipping (used by social pipeline, no project routing)")
        return

    real_author, real_author_id = get_real_author()
    is_internal = ISSUE_AUTHOR_ID in CONFIG["ci_bot_ids"] or is_org_member(real_author_id)
    log_debug(f"Author {ISSUE_AUTHOR} (real: {real_author}, id={real_author_id}) is internal: {is_internal}")
    
    if real_author != ISSUE_AUTHOR and is_internal:
        assign_issue(real_author)

    tracking_issues = fetch_tracking_issues()
    classification = classify_with_ai(is_internal, tracking_issues)
    if classification is None:
        fail(f"AI classification failed for issue #{ISSUE_NUMBER}")

    if classification.get("is_app_submission"):
        # Not labelled APP-SUBMISSION: a person confirms before the app review starts.
        log_debug("AI detected app submission, routing to Dev project")
        add_to_project(CONFIG["projects"]["dev"]["id"])
        return

    source = "Team" if is_internal else "Community"
    priority = classification["priority"]
    if source == "Community" and is_paid_customer(real_author_id):
        log_debug(f"Author {real_author} (id={real_author_id}) is a paid customer; overriding priority to Urgent")
        priority = "Urgent"
    log_debug(f"Classified: source={source}, priority={priority}")
    project = CONFIG["projects"]["dev"]

    labels = classification["labels"]
    pinned = set(existing_labels) & PINNED_TYPES
    if pinned:
        labels = [l for l in labels if l not in ISSUE_TYPES] + sorted(pinned)
    log_debug(f"Labels: {labels}")
    if DRY_RUN:
        print(f"DRY-RUN #{ISSUE_NUMBER}\t{source}\t{priority}\t{','.join(labels)}\t{ISSUE_TITLE}")

    item_id = add_to_project(project["id"])
    set_project_field(project["id"], item_id, project["source_field_id"], project["source_options"][source])
    if priority:
        set_project_field(project["id"], item_id, project["priority_field_id"], project["priority_options"][priority])
    if RELABEL or not set(existing_labels) & set(KINDS):
        set_labels(labels)
    else:
        log_debug(f"Issue #{ISSUE_NUMBER} already has a kind label; keeping its labels")

    # Parent new team issues under the best-fit tracking issue (skip tracking issues themselves)
    is_tracking_issue = "TRACKING" in existing_labels or "TRACKING" in labels
    if source == "Team" and ISSUE_DB_ID and not is_tracking_issue:
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
