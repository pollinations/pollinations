"""GitHub project manager: puts every new issue and pull request on the Dev project.

project-manager.md is the brief: the only definition of areas, types and priorities.
"""

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

BRIEF_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "project-manager.md")
DEV_PROJECT_ID = "PVT_kwDOBS76fs4AwCAM"
TEAM_IDS = {5099901, 36901823, 74301576, 158852059, 34513273}
# The Discord relay ends each relayed issue with "**Author:** `name` (UID: `123`)".
RELAY_AUTHOR_LINE = re.compile(r"^\*\*Author:\*\* .*\(UID:\s*`?\d+`?\)\s*$", re.MULTILINE)
TYPES = ["Bug", "Feature", "Question", "Task"]
PRIORITIES = ["High", "Medium", "Low"]
SOURCES = ["Team", "Community", "Agent"]
NOT_WORK_LABELS = {"BEE-CENSUS", "HONEY-CENSUS"}
APP_SUBMISSION_AREA = "App catalog & showcase"


def log_debug(msg: str):
    print(f"[DEBUG] {msg}", file=sys.stderr)


def log_error(msg: str):
    print(f"[ERROR] {msg}", file=sys.stderr)


def fail(msg: str):
    """Log and exit non-zero so a broken run shows up red in Actions."""
    log_error(msg)
    sys.exit(1)


def read_brief() -> str:
    with open(BRIEF_PATH, "r") as f:
        return f.read()


def area_names(brief: str) -> list:
    """The areas: the headings of the brief's Areas section."""
    section = brief.split("\n## Areas\n", 1)[1].split("\n## ", 1)[0]
    return re.findall(r"^### (.+)$", section, re.MULTILINE)


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


def dev_fields(areas: list) -> dict:
    """Dev project fields by name, each {id, options: {name: id}}; fails when one doesn't match."""
    query = """
    query($projectId: ID!) {
        node(id: $projectId) {
            ... on ProjectV2 {
                fields(first: 50) {
                    nodes { ... on ProjectV2SingleSelectField { id name options { id name } } }
                }
            }
        }
    }
    """
    nodes = graphql_request(query, {"projectId": DEV_PROJECT_ID}).get("node", {}).get("fields", {}).get("nodes", [])
    fields = {
        n["name"]: {"id": n["id"], "options": {o["name"]: o["id"] for o in n["options"]}}
        for n in nodes
        if n.get("options")
    }
    for name, values in (("Area", areas), ("Priority", PRIORITIES), ("Source", SOURCES)):
        missing = [v for v in values if v not in fields.get(name, {}).get("options", {})]
        if missing:
            fail(f"Dev field {name} does not match project-manager.md; missing options: {missing}")
    return fields


def is_relayed() -> bool:
    """An issue a bot opened on behalf of a person from Discord."""
    return not IS_PULL_REQUEST and bool(RELAY_AUTHOR_LINE.search(ISSUE_BODY))


def author_source() -> str:
    """Team for our accounts, Agent for bot accounts, Community for everyone else."""
    if ISSUE_AUTHOR_ID in TEAM_IDS:
        return "Team"
    if ITEM_DATA.get("user", {}).get("type") == "Bot" and not is_relayed():
        return "Agent"
    return "Community"


def current_priority() -> Optional[str]:
    """The issue's Priority on Dev, if someone or an earlier run already set it."""
    data = graphql_request(
        """query($id: ID!) { node(id: $id) { ... on Issue { projectItems(first: 10) { nodes {
            project { id }
            fieldValueByName(name: "Priority") { ... on ProjectV2ItemFieldSingleSelectValue { name } }
        } } } } }""",
        {"id": ISSUE_NODE_ID},
    )
    items = data.get("node", {}).get("projectItems", {}).get("nodes", [])
    item = next((i for i in items if i["project"]["id"] == DEV_PROJECT_ID), {})
    return (item.get("fieldValueByName") or {}).get("name")


def add_to_dev() -> str:
    if DRY_RUN:
        return "dry-run"
    mutation = """
    mutation($projectId: ID!, $contentId: ID!) {
        addProjectV2ItemById(input: { projectId: $projectId, contentId: $contentId }) { item { id } }
    }
    """
    data = graphql_request(mutation, {"projectId": DEV_PROJECT_ID, "contentId": ISSUE_NODE_ID})
    item_id = data.get("addProjectV2ItemById", {}).get("item", {}).get("id")
    if not item_id:
        fail(f"Failed to add #{ISSUE_NUMBER} to the Dev project")
    return item_id


def set_field(item_id: str, field: dict, value: Optional[str]):
    """Set a single-select field, or clear it when value is None."""
    if DRY_RUN:
        return
    if value is None:
        mutation = """
        mutation($projectId: ID!, $itemId: ID!, $fieldId: ID!) {
            clearProjectV2ItemFieldValue(input: { projectId: $projectId, itemId: $itemId, fieldId: $fieldId }) {
                projectV2Item { id }
            }
        }
        """
        variables = {}
    else:
        mutation = """
        mutation($projectId: ID!, $itemId: ID!, $fieldId: ID!, $optionId: String!) {
            updateProjectV2ItemFieldValue(input: {
                projectId: $projectId, itemId: $itemId, fieldId: $fieldId,
                value: { singleSelectOptionId: $optionId }
            }) { projectV2Item { id } }
        }
        """
        variables = {"optionId": field["options"][value]}
    data = graphql_request(mutation, {"projectId": DEV_PROJECT_ID, "itemId": item_id, "fieldId": field["id"], **variables})
    if not data:
        fail(f"Failed to set field {field['id']} to {value!r} on #{ISSUE_NUMBER}")


def set_issue_type(issue_type: str):
    if DRY_RUN:
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
            fail(f"Failed to fetch files for PR #{ISSUE_NUMBER}: {r.status_code} - {r.text[:200]}")
        batch = [f["filename"] for f in r.json()]
        files.extend(batch)
        if len(batch) < 100:
            return files
        page += 1


def classify(brief: str, areas: list) -> dict:
    """The project manager's answer: area for everything, plus type and priority for issues."""
    if IS_PULL_REQUEST:
        files = fetch_pr_files()
        facts = f"Changed files ({len(files)}):\n" + "\n".join(files[:300])
        if len(files) > 300:
            facts += f"\n... and {len(files) - 300} more"
    else:
        facts = ""
    author = "a person, relayed from Discord" if is_relayed() else ITEM_DATA.get("user", {}).get("type", "User")
    raw = ask_ai(brief, f"""This is {"a pull request" if IS_PULL_REQUEST else "an issue"}.
Author: {ISSUE_AUTHOR} ({author})
Title: {ISSUE_TITLE}
Body: {ISSUE_BODY[:2000]}
{facts}
""")
    if raw is None:
        fail(f"AI classification failed for #{ISSUE_NUMBER}")
    area = raw.get("area")
    if area is not None and area not in areas:
        fail(f"AI returned invalid area for #{ISSUE_NUMBER}: {area!r}")
    # No area means a promotion PR or an unlabelled census response.
    if IS_PULL_REQUEST or area is None:
        return {"area": area, "type": None, "priority": None}
    if raw.get("type") not in TYPES or raw.get("priority") not in PRIORITIES:
        fail(f"AI returned invalid type or priority for #{ISSUE_NUMBER}: {raw.get('type')!r}, {raw.get('priority')!r}")
    return {"area": area, "type": raw["type"], "priority": raw["priority"]}


def main():
    if not ISSUE_NUMBER or not ISSUE_NODE_ID:
        log_debug("Missing issue or PR number, skipping")
        return
    labels = {l.get("name", "").upper() for l in ITEM_DATA.get("labels", []) if isinstance(l, dict)}
    if not IS_PULL_REQUEST and labels & NOT_WORK_LABELS:
        log_debug(f"#{ISSUE_NUMBER} is a survey response; skipping")
        return

    brief = read_brief()
    areas = area_names(brief)
    fields = dev_fields(areas)

    if not IS_PULL_REQUEST and "APP-SUBMISSION" in labels:
        answer = {"area": APP_SUBMISSION_AREA, "type": None, "priority": None}
    else:
        answer = classify(brief, areas)
        if not IS_PULL_REQUEST and answer["area"] is None:
            log_debug(f"#{ISSUE_NUMBER} is not work (census response); skipping")
            return

    source = author_source()
    # A priority that is already set (by a person, an earlier run or the Express job) is kept.
    existing = current_priority() if answer["priority"] else None
    priority = existing or answer["priority"]
    print(f"{'DRY-RUN ' if DRY_RUN else ''}#{ISSUE_NUMBER}\t{source}\t{answer['area']}\t{answer['type']}\t{priority}{' (kept)' if existing else ''}\t{ISSUE_TITLE}")

    item_id = add_to_dev()
    set_field(item_id, fields["Area"], answer["area"])
    set_field(item_id, fields["Source"], source)
    if answer["priority"] and not existing:
        set_field(item_id, fields["Priority"], answer["priority"])
    if answer["type"]:
        set_issue_type(answer["type"])


if __name__ == "__main__":
    main()
