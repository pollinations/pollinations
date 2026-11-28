"""GitHub project manager: puts every new issue and pull request on the Dev project.

Weaver classifies opened items from system-prompt.md. baseline-prompt.md is kept for rollback.
"""

import sys
import os
import json
import re
import requests
import time
from pathlib import Path
from functools import cache
from typing import Optional


GITHUB_TOKEN = os.getenv("GITHUB_TOKEN")
POLLINATIONS_TOKEN = os.getenv("POLLINATIONS_TOKEN")
try:
    if payload := os.getenv("GITHUB_EVENT"):
        GITHUB_EVENT = json.loads(payload)
    elif event_path := os.getenv("PROJECT_MANAGER_EVENT_PATH"):
        with open(event_path) as event_file:
            GITHUB_EVENT = json.load(event_file)
    else:
        GITHUB_EVENT = {}
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

WEAVER_DIR = Path(__file__).resolve().parents[3] / "apps" / "agent-weaver"
DEV_PROJECT_ID = "PVT_kwDOBS76fs4AwCAM"
TEAM_IDS = {5099901, 36901823, 74301576, 158852059, 34513273}
# The Discord relay ends each relayed issue with "**Author:** `name` (UID: `123`)".
RELAY_AUTHOR_LINE = re.compile(r"^\*\*Author:\*\* .*\(UID:\s*`?\d+`?\)\s*$", re.MULTILINE)
TYPES = ["Bug", "Feature", "Question", "Task"]
MODEL_WORK = ["Repair", "Retirement", "Addition", "Update"]
PR_TYPES = ["Bug", "Feature", "Task"]
PRIORITIES = ["High", "Medium", "Low"]
SOURCES = ["Team", "Community", "Agent", "Apps", "Quests"]
# Workflow sources, in order: an issue with the label, or a PR that closes one.
LABEL_SOURCES = [("Apps", "APP-SUBMISSION"), ("Quests", "QUEST")]
NOT_WORK_LABELS = {"BEE-CENSUS", "HONEY-CENSUS"}
APP_SUBMISSION_AREA = "App catalog & showcase"
# Same date as REWARDS_START in enter.pollinations.ai/src/services/quests/groups/github-contributions.ts.
REWARDS_START = "2026-11-05T00:00:00Z"


def log_debug(msg: str):
    print(f"[DEBUG] {msg}", file=sys.stderr)


def log_error(msg: str):
    print(f"[ERROR] {msg}", file=sys.stderr)


def fail(msg: str):
    """Log and exit non-zero so a broken run shows up red in Actions."""
    log_error(msg)
    sys.exit(1)


def read_brief() -> str:
    return (WEAVER_DIR / "baseline-prompt.md").read_text()


def area_names(brief: str) -> list:
    """The areas: the headings of the brief's Areas section."""
    section = brief.split("\n## Areas\n", 1)[1].split("\n## ", 1)[0]
    return re.findall(r"^### (.+)$", section, re.MULTILINE)


def ask_ai(system_prompt: str, user_prompt: str, *, hosted_model=None, metrics=None, fresh=False) -> Optional[dict]:
    """Return an object, or None when inference is temporarily unavailable."""
    messages = [{"role": "user", "content": user_prompt}]
    payload = {
        "model": hosted_model or AI_MODEL,
        "messages": messages,
        "reasoning_effort": "low",
        "max_tokens": 2000,
    }
    if fresh and not hosted_model:
        payload["seed"] = -1  # Agent requests already have an isolated cache partition per run.
    if not hosted_model:
        messages.insert(0, {"role": "system", "content": system_prompt})
        payload["response_format"] = {"type": "json_object"}
    invalid_output = False
    for attempt in range(3):
        record = {}
        if metrics is not None:
            metrics.append(record)
        try:
            response = requests.post(
                POLLINATIONS_API, headers={"Authorization": f"Bearer {POLLINATIONS_TOKEN}"},
                json=payload, timeout=120,
            )
        except requests.RequestException:
            record["error"] = "transport"
            log_error("AI transport failed")
        else:
            status = response.status_code
            if metrics is not None:
                record.update(http_status=status, request_id=response.headers.get("X-Request-Id"), cache=response.headers.get("X-Cache"))
            if 400 <= status < 500 and status != 429:
                raise SystemExit(f"AI rejected request: HTTP {status}")
            if status == 200:
                try:
                    data = response.json()
                    if metrics is not None:
                        usage = data.get("usage") or {}
                        record.update(completion_id=data.get("id"), usage=usage)
                    content = data["choices"][0]["message"]["content"].strip()
                    if hosted_model and (fence := re.fullmatch(r"```(?:json)?\s*(.*?)\s*```", content, re.DOTALL)):
                        content = fence.group(1)
                    parsed = json.loads(content)
                    if not isinstance(parsed, dict):
                        raise ValueError("expected one object")
                    return parsed
                except (ValueError, AttributeError, KeyError, IndexError, TypeError):
                    invalid_output = True
                    record["error"] = "invalid JSON"
                    log_error("AI returned invalid JSON output")
            else:
                log_error(f"AI HTTP {status}")
        if attempt < 2:
            time.sleep(2**attempt)
    if hosted_model and invalid_output:
        raise SystemExit("Weaver returned invalid output and retries were exhausted")
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
    expected = [("Area", areas), ("Priority", PRIORITIES), ("Source", SOURCES), ("Model work", MODEL_WORK)]
    if IS_PULL_REQUEST:
        expected.append(("Work type", PR_TYPES))
    for name, values in expected:
        missing = [v for v in values if v not in fields.get(name, {}).get("options", {})]
        if missing:
            fail(f"Dev field {name} does not match the classification policy; missing options: {missing}")
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


def current_dev_fields() -> dict:
    """Read existing Priority and Model work without confusing read failure with empty fields."""
    query = """
    query($id: ID!, $after: String) {
        node(id: $id) {
            ... on Issue { projectItems(first: 50, after: $after) { ... ProjectItems } }
            ... on PullRequest { projectItems(first: 50, after: $after) { ... ProjectItems } }
        }
    }
    fragment ProjectItems on ProjectV2ItemConnection {
        pageInfo { hasNextPage endCursor }
        nodes {
            project { id }
            priority: fieldValueByName(name: "Priority") { ... on ProjectV2ItemFieldSingleSelectValue { name } }
            modelWork: fieldValueByName(name: "Model work") { ... on ProjectV2ItemFieldSingleSelectValue { name } }
        }
    }
    """
    after = None
    while True:
        data = graphql_request(query, {"id": ISSUE_NODE_ID, "after": after})
        page = (data.get("node") or {}).get("projectItems")
        if page is None:
            fail(f"Failed to read existing Dev fields for #{ISSUE_NUMBER}")
        for item in page["nodes"]:
            if item and item["project"]["id"] == DEV_PROJECT_ID:
                return item
        if not page["pageInfo"]["hasNextPage"]:
            return {}
        after = page["pageInfo"]["endCursor"]


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


def item_prompt(kind, author, author_type, title, body, files, linked):
    facts = ""
    if kind == "pull request":
        facts = f"Changed files ({len(files)}):\n" + "\n".join(files[:300])
        if len(files) > 300:
            facts += f"\n... and {len(files) - 300} more"
        facts += "\nLinked issue types (hints, verify against PR scope):\n" + json.dumps(linked)
    item = "a pull request" if kind == "pull request" else "an issue"
    return f"This is {item}.\nAuthor: {author} ({author_type})\nTitle: {title}\nBody: {body[:2000]}\n{facts}\n"


def classify(brief: str, areas: list) -> Optional[dict]:
    """Use Weaver only on opening events after an explicit release selection."""
    linked = [{"number": i["number"], "type": (i.get("issueType") or {}).get("name")}
              for i in closing_issues()] if IS_PULL_REQUEST else []
    prompt = item_prompt("pull request" if IS_PULL_REQUEST else "issue", ISSUE_AUTHOR,
                         "a person, relayed from Discord" if is_relayed() else ITEM_DATA.get("user", {}).get("type", "User"),
                         ISSUE_TITLE, ISSUE_BODY, fetch_pr_files() if IS_PULL_REQUEST else [], linked)
    hosted = os.getenv("WEAVER_MODEL") if GITHUB_EVENT.get("action") == "opened" else None
    raw = ask_ai(brief, prompt, hosted_model=hosted)
    if raw is None:
        return None
    try:
        return classification_answer(raw, areas, IS_PULL_REQUEST, hosted=bool(hosted))
    except ValueError as error:
        fail(f"Invalid classification for #{ISSUE_NUMBER}: {error}")


def classification_answer(raw: dict, areas: list, is_pr: bool, *, hosted=False) -> dict:
    if hosted:
        if set(raw) != {"area", "type", "priority", "model_work", "reasoning"}:
            raise ValueError("expected precisely the five Weaver response fields")
        if not isinstance(raw["reasoning"], str) or not raw["reasoning"].strip():
            raise ValueError("missing reasoning")
        if is_pr and raw["priority"] is not None:
            raise ValueError("a PR cannot have an issue priority")
        if raw["area"] is None and any(raw[k] is not None for k in ("type", "priority", "model_work")):
            raise ValueError("an unclassified item must have null fields")
    area = raw.get("area")
    if area is not None and area not in areas:
        raise ValueError(f"invalid area: {area!r}")
    model_work = raw.get("model_work")
    if model_work is not None and (area != "Models" or model_work not in MODEL_WORK):
        raise ValueError(f"invalid Model work for {area!r}: {model_work!r}")
    if area == "Models" and "model_work" not in raw:
        raise ValueError("missing model_work for Models")
    # Promotions and census responses have no type or priority.
    if area is None:
        return {"area": None, "type": None, "priority": None}
    allowed_types = PR_TYPES if is_pr else TYPES
    if raw.get("type") not in allowed_types:
        raise ValueError(f"invalid type: {raw.get('type')!r}")
    if not is_pr and raw.get("priority") not in PRIORITIES:
        raise ValueError(f"invalid priority: {raw.get('priority')!r}")
    return {"area": area, "type": raw["type"], "priority": None if is_pr else raw["priority"], "model_work": model_work}


def reward_eligible():
    labels = {label["name"].upper() for label in ITEM_DATA.get("labels", [])}
    excluded_issue = (labels & (NOT_WORK_LABELS | {"APP-SUBMISSION"}) or
                      re.match(r"\[Community(?: Model)? Publisher Access\]", ISSUE_TITLE, re.I))
    return (GITHUB_EVENT.get("action") == "opened" and ITEM_DATA.get("user", {}).get("type") != "Bot"
            and ITEM_DATA.get("created_at", "") >= REWARDS_START and (IS_PULL_REQUEST or not excluded_issue))


def write_reward_comment():
    """Announce the reward. Enter pays it without reading this comment."""
    if not reward_eligible():
        return
    if IS_PULL_REQUEST:
        reward, rule = 5, "The PR author can claim this once it is merged into main. A `reward-N` label on this PR, or else on the community quest it closes, sets the amount instead."
    else:
        reward, rule = 2, "The issue author can claim this once a merged PR closes this issue, also when they wrote the fix."
    body = f"Earns 🌱 ${reward} in Quest balance\n\n{rule} Claim at https://enter.pollinations.ai/quests."
    try:
        r = requests.post(f"{GITHUB_API}/repos/{REPO_OWNER}/{REPO_NAME}/issues/{ISSUE_NUMBER}/comments",
                          headers=GITHUB_HEADERS, json={"body": body}, timeout=10)
    except requests.RequestException as e:
        fail(f"Exception posting the reward comment on #{ISSUE_NUMBER}: {e}")
    if r.status_code != 201:
        fail(f"Failed to post the reward comment on #{ISSUE_NUMBER}: {r.status_code} - {r.text[:200]}")


def report_skipped_classification(reason):
    message = f"{reason} for #{ISSUE_NUMBER}. Skipped project and type writes."
    if reward_eligible():
        message += " Missed opening reward announcement. Rerun the original opening event to recover it."
    print(f"::warning::{message}")
    if summary := os.getenv("GITHUB_STEP_SUMMARY"):
        run_url = f"{os.getenv('GITHUB_SERVER_URL')}/{os.getenv('GITHUB_REPOSITORY')}/actions/runs/{os.getenv('GITHUB_RUN_ID')}"
        with open(summary, "a") as stream:
            print(f"{message} [Original run]({run_url})", file=stream)


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

    brief = ((WEAVER_DIR / "system-prompt.md").read_text().strip() if os.getenv("WEAVER_MODEL") else read_brief())
    areas = area_names(brief)
    fields = dev_fields(areas)

    # A workflow label added after opening only changes the Source.
    if GITHUB_EVENT.get("action") == "labeled":
        source = item_source(labels)
        print(f"{'DRY-RUN ' if DRY_RUN else ''}#{ISSUE_NUMBER}\t{source}\t(label added)\t{ISSUE_TITLE}")
        set_field(add_to_dev(), fields["Source"], source)
        return

    if not IS_PULL_REQUEST and "APP-SUBMISSION" in labels:
        answer = {"area": APP_SUBMISSION_AREA, "type": None, "priority": None}
    else:
        try:
            answer = classify(brief, areas)
        except SystemExit:
            report_skipped_classification("Classification failed")
            raise
        if answer is None:
            report_skipped_classification("Classifier unavailable")
            return
        if not IS_PULL_REQUEST and answer["area"] is None:
            log_debug(f"#{ISSUE_NUMBER} is not work (census response); skipping")
            return

    source = item_source(labels)
    proposed_queue = answer.get("model_work")
    # Preserve choices made by maintainers, the Express job or an earlier run.
    existing = current_dev_fields() if answer["priority"] or proposed_queue else {}
    existing_priority = (existing.get("priority") or {}).get("name")
    existing_queue = (existing.get("modelWork") or {}).get("name")
    priority = existing_priority or answer["priority"]
    queue = existing_queue or proposed_queue
    print(
        f"{'DRY-RUN ' if DRY_RUN else ''}#{ISSUE_NUMBER}\t{source}\t{answer['area']}\t{answer['type']}"
        f"\t{queue}{' (kept)' if existing_queue else ''}\t{priority}{' (kept)' if existing_priority else ''}\t{ISSUE_TITLE}"
    )

    item_id = add_to_dev()
    set_field(item_id, fields["Area"], answer["area"])
    if proposed_queue and not existing_queue:
        set_field(item_id, fields["Model work"], proposed_queue)
    set_field(item_id, fields["Source"], source)
    if answer["priority"] and not existing_priority:
        set_field(item_id, fields["Priority"], answer["priority"])
    if IS_PULL_REQUEST:
        set_field(item_id, fields["Work type"], answer["type"])
    elif answer["type"]:
        set_issue_type(answer["type"])

    # The gist pipeline consumes the same classification after the project update.
    if output := os.getenv("CLASSIFICATION_OUTPUT"):
        with open(output, "w") as stream:
            json.dump({"area": answer["area"], "type": answer["type"], "source": source}, stream)

    # App listings have their own reward; access requests earn none. Same rules as
    # ISSUE_REPORT_EXCLUDED_TITLE in enter.pollinations.ai/src/services/quests/groups/github-contributions.ts.
    write_reward_comment()


if __name__ == "__main__":
    main()
