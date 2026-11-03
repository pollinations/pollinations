"""GitHub project manager: puts every new issue and pull request on the Dev project.

project-manager.md is the brief: the only definition of areas, types and priorities.
"""

import sys
import os
import json
import hashlib
import hmac
import math
import re
import requests
import time
from decimal import Decimal
from functools import cache
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
PR_TYPES = ["Bug", "Feature", "Task"]
PRIORITIES = ["High", "Medium", "Low"]
SOURCES = ["Team", "Community", "Agent", "Apps", "Quests"]
# Workflow sources, in order: an issue with the label, or a PR that closes one.
LABEL_SOURCES = [("Apps", "APP-SUBMISSION"), ("Quests", "POLLEN-QUEST")]
NOT_WORK_LABELS = {"BEE-CENSUS", "HONEY-CENSUS"}
APP_SUBMISSION_AREA = "App catalog & showcase"
REWARD_COMMENT_MARKER = "<!-- pollinations-reward -->"
REWARD_BOT_ID = 247793354
CONTRIBUTION_REWARD_KEY = os.getenv("CONTRIBUTION_REWARD_KEY")
# Same date as REWARDS_START in enter.pollinations.ai/src/services/quests/groups/github-contributions.ts.
REWARDS_START = "2026-11-02T00:00:00Z"
MAX_REWARD = 100
MAX_PATCH_CHARS = 20_000


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
    expected = [("Area", areas), ("Priority", PRIORITIES), ("Source", SOURCES)]
    if IS_PULL_REQUEST:
        expected.append(("Work type", PR_TYPES))
    for name, values in expected:
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


@cache
def closing_issues() -> list:
    """Linked issues provide Source labels and work-type hints."""
    data = graphql_request(
        """query($id: ID!) { node(id: $id) { ... on PullRequest { closingIssuesReferences(first: 30) { nodes {
            number issueType { name } labels(first: 20) { nodes { name } }
        } } } } }""",
        {"id": ISSUE_NODE_ID},
    )
    node = data.get("node")
    if node is None:
        fail(f"Failed to fetch linked issues for PR #{ISSUE_NUMBER}")
    return node["closingIssuesReferences"]["nodes"]


def item_source(labels: set) -> str:
    """Exactly one source: Apps, then Quests, then who opened it."""
    linked = {
        label["name"].upper()
        for issue in closing_issues()
        for label in issue["labels"]["nodes"]
    } if IS_PULL_REQUEST else set()
    for name, label in LABEL_SOURCES:
        if label in labels or label in linked:
            return name
    return author_source()


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
        batch = r.json()
        files.extend(batch)
        if len(batch) < 100:
            return files
        page += 1


def classify(brief: str, areas: list) -> dict:
    """Classify and quote the same item with one model call; the quote is validated when it is written."""
    if IS_PULL_REQUEST:
        files = fetch_pr_files()
        facts = f"Changed files ({len(files)}):\n" + "\n".join(file["filename"] for file in files[:300])
        if len(files) > 300:
            facts += f"\n... and {len(files) - 300} more"
        linked = [{"number": issue["number"], "type": (issue.get("issueType") or {}).get("name")} for issue in closing_issues()]
        facts += "\nLinked issue types (hints, verify against PR scope):\n" + json.dumps(linked)
        patches = "\n".join(
            f"File: {file['filename']}\n{file.get('patch') or '[patch unavailable]'}"
            for file in files
        )
        facts += "\nUntrusted diff excerpts (may be incomplete):\n" + patches[:MAX_PATCH_CHARS]
    else:
        facts = ""
    author = "a person, relayed from Discord" if is_relayed() else ITEM_DATA.get("user", {}).get("type", "User")
    raw = ask_ai(brief, f"""This is {"a pull request" if IS_PULL_REQUEST else "an issue"}.
Author: {ISSUE_AUTHOR} ({author})
Title: {ISSUE_TITLE}
Body: {ISSUE_BODY[:2000]}
Labels: {json.dumps([label.get('name') for label in ITEM_DATA.get('labels', [])])}
{facts}
""")
    if raw is None:
        fail(f"AI classification failed for #{ISSUE_NUMBER}")
    try:
        return {**classification_answer(raw, areas, IS_PULL_REQUEST),
                "reward": raw.get("reward"), "reward_reason": raw.get("reward_reason")}
    except ValueError as error:
        fail(f"Invalid classification for #{ISSUE_NUMBER}: {error}")


def classification_answer(raw: dict, areas: list, is_pr: bool) -> dict:
    area = raw.get("area")
    if area is not None and area not in areas:
        raise ValueError(f"invalid area: {area!r}")
    # Promotions and census responses have no type or priority.
    if area is None:
        return {"area": None, "type": None, "priority": None}
    allowed_types = PR_TYPES if is_pr else TYPES
    if raw.get("type") not in allowed_types:
        raise ValueError(f"invalid type: {raw.get('type')!r}")
    if not is_pr and raw.get("priority") not in PRIORITIES:
        raise ValueError(f"invalid priority: {raw.get('priority')!r}")
    return {"area": area, "type": raw["type"], "priority": None if is_pr else raw["priority"]}


def reward_answer(raw: dict) -> dict:
    amount = raw.get("reward")
    if type(amount) not in (int, float) or not 0 <= amount <= MAX_REWARD or not math.isfinite(amount):
        raise ValueError("reward must be a finite number between 0 and 100")
    reason = raw.get("reward_reason")
    if not isinstance(reason, str) or not reason.strip() or len(reason) > 400:
        raise ValueError("reward_reason must be a non-empty sentence of at most 400 characters")
    return {"reward": amount, "reward_reason": " ".join(reason.split())}


def sign_reward(line: str) -> str:
    """Enter pays a bot quote only with this signature, so other bot comments can't pose as one."""
    message = f"{REPO_OWNER}/{REPO_NAME}#{ISSUE_NUMBER}\n{line}"
    return hmac.new(CONTRIBUTION_REWARD_KEY.encode(), message.encode(), hashlib.sha256).hexdigest()


def write_reward_comment(answer: dict):
    """Post the item's one signed quote. This job never grants or claims pollen, and never re-prices."""
    # Bots earn nothing, and items opened before REWARDS_START keep the old fixed quest rewards.
    if (ITEM_DATA.get("user", {}).get("type") == "Bot" or ITEM_DATA.get("state") != "open"
            or ITEM_DATA.get("created_at", "") < REWARDS_START):
        return
    try:
        reward = reward_answer(answer)
    except ValueError as error:
        fail(f"Invalid reward for #{ISSUE_NUMBER}: {error}")
    if not CONTRIBUTION_REWARD_KEY:
        fail("CONTRIBUTION_REWARD_KEY is required to sign reward quotes")
    line = f"Reward: {Decimal(str(reward['reward'])):f} quest"
    eligibility = "This assessment offers no contribution reward." if reward["reward"] == 0 else (
        "The PR author can claim this after merge. If the PR closes a POLLEN-QUEST issue, that quest's bounty is paid instead." if IS_PULL_REQUEST
        else "The issue author can claim this after a merged PR closes this issue.")
    body = "\n".join([REWARD_COMMENT_MARKER, line, f"<!-- signature: {sign_reward(line)} -->", "",
                      f"Reason: {reward['reward_reason']}", "", eligibility,
                      "Claim at https://enter.pollinations.ai/quests. Elliot or Thomas can change it with a separate comment containing only `Reward: 3` (Quest) or `Reward: 3 paid`, from 0 to 100 pollen."])
    if DRY_RUN:
        print(f"DRY-RUN reward comment for #{ISSUE_NUMBER}:\n{body}")
        return

    # One quote per item: a re-run, such as the manual dispatch, leaves it as it is.
    base = f"{GITHUB_API}/repos/{REPO_OWNER}/{REPO_NAME}"
    page = 1
    while True:
        response = requests.get(f"{base}/issues/{ISSUE_NUMBER}/comments", headers=GITHUB_HEADERS,
                                params={"per_page": 100, "page": page}, timeout=30)
        response.raise_for_status()
        comments = response.json()
        if any(comment.get("user", {}).get("id") == REWARD_BOT_ID
               and (comment.get("body") or "").startswith(REWARD_COMMENT_MARKER + "\n") for comment in comments):
            log_debug(f"#{ISSUE_NUMBER} already has a reward quote; leaving it unchanged")
            return
        if len(comments) < 100:
            break
        page += 1
    requests.post(f"{base}/issues/{ISSUE_NUMBER}/comments", headers=GITHUB_HEADERS,
                  json={"body": body}, timeout=30).raise_for_status()


def main():
    if not GITHUB_TOKEN or not POLLINATIONS_TOKEN:
        fail("GITHUB_TOKEN and POLLINATIONS_TOKEN are required")
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

    # A workflow label added after opening only changes the Source.
    if GITHUB_EVENT.get("action") == "labeled":
        source = item_source(labels)
        print(f"{'DRY-RUN ' if DRY_RUN else ''}#{ISSUE_NUMBER}\t{source}\t(label added)\t{ISSUE_TITLE}")
        set_field(add_to_dev(), fields["Source"], source)
        return

    if not IS_PULL_REQUEST and "APP-SUBMISSION" in labels:
        # App listings have their own fixed reward, so they get no model call and no quote.
        answer = {"area": APP_SUBMISSION_AREA, "type": None, "priority": None}
    else:
        answer = classify(brief, areas)
        if not IS_PULL_REQUEST and answer["area"] is None:
            log_debug(f"#{ISSUE_NUMBER} is not work (census response); skipping")
            return

    source = item_source(labels)
    # A priority that is already set (by a person, an earlier run or the Express job) is kept.
    existing = current_priority() if answer["priority"] else None
    priority = existing or answer["priority"]
    print(f"{'DRY-RUN ' if DRY_RUN else ''}#{ISSUE_NUMBER}\t{source}\t{answer['area']}\t{answer['type']}\t{priority}{' (kept)' if existing else ''}\t{ISSUE_TITLE}")

    item_id = add_to_dev()
    set_field(item_id, fields["Area"], answer["area"])
    set_field(item_id, fields["Source"], source)
    if answer["priority"] and not existing:
        set_field(item_id, fields["Priority"], answer["priority"])
    if IS_PULL_REQUEST:
        set_field(item_id, fields["Work type"], answer["type"])
    elif answer["type"]:
        set_issue_type(answer["type"])

    # The gist pipeline consumes the same classification after the project update.
    if output := os.getenv("CLASSIFICATION_OUTPUT"):
        with open(output, "w") as stream:
            json.dump({"area": answer["area"], "type": answer["type"], "source": source}, stream)

    # The quote comes last, so a reward problem never blocks the classification.
    if "reward" in answer:
        write_reward_comment(answer)


if __name__ == "__main__":
    main()
