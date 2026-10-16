#!/usr/bin/env python3
"""The day's merged PRs, read from GitHub: one note per PR, summarized from its diff.

The daily post writes its summary from these notes, which are not saved. A note also carries
the API changes a docs PR makes and the model retirements a PR description schedules: the
daily keeps those in its summary's `changelog`, for Enter's News page.
"""

import json
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Optional

import requests
from common import (
    GITHUB_API_BASE,
    call_pollinations_api,
    get_repo_root,
    github_api_request,
    load_prompt,
    parse_json_response,
)
from contributors import MERGED_BASES, search_prs

# The Dev project, where the project manager sets each PR's Area, Work type and Source.
DEV_PROJECT_ID = "PVT_kwDOBS76fs4AwCAM"
DAY_QUERY = """
query($q: String!, $after: String) {
  search(query: $q, type: ISSUE, first: 50, after: $after) {
    issueCount
    pageInfo { hasNextPage endCursor }
    nodes {
      ... on PullRequest {
        number title url body mergedAt baseRefName headRefName
        author { login }
        labels(first: 30) { nodes { name } }
        mergeCommit { oid parents(first: 1) { nodes { oid } } }
        projectItems(first: 10) { nodes {
          project { id }
          area: fieldValueByName(name: "Area") { ... on ProjectV2ItemFieldSingleSelectValue { name } }
          type: fieldValueByName(name: "Work type") { ... on ProjectV2ItemFieldSingleSelectValue { name } }
          source: fieldValueByName(name: "Source") { ... on ProjectV2ItemFieldSingleSelectValue { name } }
        } }
      }
    }
  }
}"""


# ── API changes: the post-deploy docs PR's APIDOCS.md diff ──────────

API_DOCS = "APIDOCS.md"
HEADING = re.compile(r"^#### `(\w+)` `([^`]+)`(?: — (.*))?")
NAME = re.compile(r"^`([^`]+)`( \*)?$")


def api_surface(markdown: str) -> Dict:
    """Each endpoint's summary, parameters and top-level body fields: {"POST /x": {"summary", "parameters", "body"}}."""
    surface, endpoint, section = {}, None, None
    for line in markdown.splitlines():
        if heading := HEADING.match(line):
            endpoint, section = f"{heading[1].upper()} {heading[2]}", None
            surface[endpoint] = {"summary": heading[3] or "", "parameters": {}, "body": {}}
        elif line.startswith(("## ", "### ")):
            endpoint = section = None
        elif endpoint and "**Parameters**" in line:
            section = "parameters"
        elif endpoint and "**Request body**" in line:
            section = "body"
        elif endpoint and section == "body" and line.startswith("**Alternative "):
            # Alternative requirements cannot be flattened into one body contract.
            surface[endpoint]["body"] = {}
            section = None
        elif endpoint and line.startswith(("📤", "💻", "🔎")):
            section = None
        elif endpoint and section and line.startswith("| `"):
            cells = [cell.strip() for cell in re.split(r"(?<!\\)\|", line)[1:-1]]
            name = NAME.match(cells[0])
            if not name or (section == "body" and "." in name[1]):
                continue  # nested body fields follow their parent
            key = f"{cells[1].strip('`')}:{name[1]}" if section == "parameters" else name[1]
            type_ = cells[2] if section == "parameters" else cells[1]
            type_ = re.sub(r"enum \(\d+\) — .*", "enum", type_.replace("\\|", "|").replace("`", ""))
            surface[endpoint][section][key] = {"type": "|".join(t.strip() for t in type_.split("|")),
                                               "required": bool(name[2])}
    return surface


def _types(field: Optional[Dict]) -> set:
    return set(field["type"].split("|")) if field else set()


def _field_change(name: str, before: Optional[Dict], after: Optional[Dict]) -> Optional[Dict]:
    """One parameter or body field; None when nothing a client relies on changed."""
    # "any" means the docs lost the schema: the change is unknown, not a change.
    if before == after or "any" in _types(before) | _types(after):
        return None
    breaking = (
        (before is not None and after is None)  # removed
        or (after is not None and after["required"] and not (before or {}).get("required"))  # newly required
        or (before is not None and after is not None and not _types(before) <= _types(after))  # narrowed
    )
    return {"field": name, "before": before, "after": after, "breaking": breaking}


def api_changes(before: Dict, after: Dict, pr: Dict) -> List[Dict]:
    """ADD / REMOVE / CHANGE per endpoint (`METHOD /path`), with breaking flags."""
    events = []
    for endpoint in sorted(before.keys() | after.keys()):
        old, new = before.get(endpoint), after.get(endpoint)
        changes = []
        if old and new:
            for kind in ("parameters", "body"):
                # A body documented on one side only is a documentation gap, not an API change.
                if kind == "body" and (not old[kind] or not new[kind]):
                    continue
                for name in sorted(old[kind].keys() | new[kind].keys()):
                    if change := _field_change(f"{kind}:{name}", old[kind].get(name), new[kind].get(name)):
                        changes.append(change)
            if not changes:
                continue
        action = "ADD" if not old else "REMOVE" if not new else "CHANGE"
        events.append({
            "id": f"pr-{pr['number']}:{endpoint}",
            "endpoint": endpoint,
            "summary": (new or old).get("summary", ""),
            "action": action,
            "breaking": action == "REMOVE" or any(change["breaking"] for change in changes),
            "changes": changes,
        })
    return events


def file_at(repository: str, ref: str, path: str) -> str:
    response = requests.get(f"https://raw.githubusercontent.com/{repository}/{ref}/{path}", timeout=60)
    response.raise_for_status()
    return response.text


def api_changes_for_pr(pr: Dict, repository: str) -> List[Dict]:
    """API changes of a merged PR that regenerates APIDOCS.md (the post-deploy docs PR)."""
    merge = pr["mergeCommit"]
    refs = (merge["parents"]["nodes"][0]["oid"], merge["oid"])
    return api_changes(*(api_surface(file_at(repository, ref, API_DOCS)) for ref in refs), pr)


# ── Retirements a PR description announces ──────────────────────────

RETIRE_ROW = re.compile(r"^\|\s*`?([\w./:-]+)`?\s*\|\s*RETIRE\s*\|(?:[^|\n]*\|){3}\s*([^|\n]*?)\s*\|\s*$",
                        re.MULTILINE | re.IGNORECASE)
WHEN = re.compile(r"(\d{4}-\d{2}-\d{2})(?:[ T](\d{2}:\d{2}))?\s*(UTC|Z|[+-]\d{2}:\d{2})?")


def announced_retirements(pr, catalog):
    """Dated or cancelled retirements a merged PR announces in its model-change table.

    A RETIRE row whose Effective cell is a future date schedules a retirement; "Cancelled"
    withdraws one. Rows without a date (the removal itself) and unknown or removed model IDs
    are skipped: the removal is reported by the registry diff.
    """
    models = {model["name"]: model for model in catalog}
    merged_at = datetime.fromisoformat(pr["merged_at"].replace("Z", "+00:00"))
    events = []
    for model_id, effective in RETIRE_ROW.findall(pr.get("body") or ""):
        model = models.get(model_id)
        when = WHEN.search(effective)
        if not model:
            continue
        if effective.lower() == "cancelled":
            status, effective_at = "cancelled", None
        elif when:
            zone = (when[3] or "UTC").replace("UTC", "+00:00").replace("Z", "+00:00")
            at = datetime.fromisoformat(f"{when[1]}T{when[2] or '00:00'}{zone}").astimezone(timezone.utc)
            if at <= merged_at:
                continue
            status, effective_at = "scheduled", at.strftime("%Y-%m-%dT%H:%M:%SZ")
        else:
            continue
        events.append({"id": f"pr-{pr['number']}:{model_id}:retirement", "model_id": model_id,
                       "title": model.get("title", model_id), "action": "RETIRE",
                       "category": model.get("category"),
                       "changes": {"availability": {"before": "Available", "after": "Retired"}},
                       "effective_at": effective_at, "effective_status": status, "official": True,
                       "source": "pr_description"})
    return events




# ── The PR's diff ────────────────────────────────────────────────────

# Files whose diff says nothing about what a PR does: they are listed without one.
DIFF_SKIPPED = re.compile(
    r"(^|/)(package-lock\.json|yarn\.lock|pnpm-lock\.yaml|uv\.lock|Cargo\.lock)$"
    r"|(^|/)(__snapshots__|snapshots)/|\.snap$"
)
FILE_DIFF_CHARS = 3000
DIFF_CHARS = 40000


def changes_text(files: list) -> str:
    """Each changed file with its diff. Lockfiles and test snapshots are listed without
    one, each diff is capped, and past the total cap files are listed only."""
    lines, budget, unshown = [], DIFF_CHARS, 0
    for f in files:
        name = f.get("filename", "")
        lines.append(f"  {f.get('status', 'modified')}: {name} (+{f.get('additions', 0)}/-{f.get('deletions', 0)})")
        patch = f.get("patch")
        if not patch or DIFF_SKIPPED.search(name):
            continue
        if budget <= 0:
            unshown += 1
            continue
        shown = patch[: min(FILE_DIFF_CHARS, budget)]
        budget -= len(shown)
        cut = "\n… (cut)" if len(shown) < len(patch) else ""
        lines.append("\n".join("    " + line for line in (shown + cut).splitlines()))
    if unshown:
        lines.append(f"  (diffs of {unshown} more files not shown)")
    return "\n".join(lines) if lines else "(no files changed)"


def fetch_pr_files(repo: str, pr_number: str, token: str) -> tuple:
    """The changed files with their diff, and their names."""
    headers = {
        "Authorization": f"Bearer {token}",
        "Accept": "application/vnd.github+json",
    }
    all_files = []
    page = 1
    while True:
        url = f"{GITHUB_API_BASE}/repos/{repo}/pulls/{pr_number}/files?per_page=100&page={page}"
        resp = github_api_request("GET", url, headers=headers)
        resp.raise_for_status()
        files = resp.json()
        if not files:
            break
        all_files.extend(files)
        if len(files) < 100:
            break
        page += 1
    return changes_text(all_files), [f.get("filename", "") for f in all_files]



# ── One note per PR ──────────────────────────────────────────────────

def app_for(branch: str, files: List[str]) -> Optional[Dict]:
    """The app an app-submission PR adds: its branch is auto/app-<issue>-<slug>."""
    issue = re.match(r"auto/app-(\d+)-", branch)
    if not issue or "operations/app-management/app.json" not in files:
        return None
    apps = json.loads((Path(get_repo_root()) / "operations/app-management/app.json").read_text(encoding="utf-8"))
    app = next((app for app in apps if (app.get("issueUrl") or "").endswith(f"/issues/{issue[1]}")), None)
    url = app and (app.get("url") or app.get("repositoryUrl"))
    return {"app_name": app["name"], "app_url": url} if url else None


def publish_tier(labels: List[str], analysis: Dict) -> str:
    """The writer's tier, with the label rules applied."""
    labels = [label.lower() for label in labels]
    if ("deps" in labels or "chore" in labels) and not analysis.get("user_facing", False):
        return "discord_only"
    if "feature" in labels:
        return "daily"
    return analysis.get("publish_tier", "daily")


def analyze_pr(pr: Dict, changes: str, token: str) -> Optional[Dict]:
    """The writer's reading of one PR: summary, category, importance and tier."""
    # Trust boundary: the body comes from a merged PR (repo write access). Capped as a size guard.
    body = pr.get("body") or ""
    user_prompt = f"""PR #{pr['number']}: {pr['title']}

Author: {pr['author']}
Labels: {', '.join(pr['labels']) or 'none'}
Branch: {pr['branch']} → {pr['base']}
Area: {pr['area']} · Type: {pr['type']} · Source: {pr['source']}

Description:
{body[:6000] if body else 'No description provided.'}

Changed files and their diff:
{changes}"""
    response = call_pollinations_api(
        load_prompt("summaries/pr"), user_prompt, token, temperature=0.2, response_format={"type": "json_object"}
    )
    return parse_json_response(response) if response else None


def dev_fields(node: Dict) -> Dict:
    item = next((i for i in node["projectItems"]["nodes"] if i["project"]["id"] == DEV_PROJECT_ID), {})
    return {field: (item.get(field) or {}).get("name") for field in ("area", "type", "source")}


def merged_on(day: str, token: str, repository: str) -> List[Dict]:
    """Every PR merged into main or master on the day (UTC)."""
    window = f"{day}T00:00:00Z..{day}T23:59:59Z"
    return [
        node
        for base in MERGED_BASES
        for node in search_prs(f"repo:{repository} is:pr is:merged base:{base} merged:{window}", token, DAY_QUERY)
    ]


def note(node: Dict, token: str, github_token: str, repository: str, catalog: List[Dict]) -> Dict:
    """One PR: what it is, what the writer read in its diff, and what Enter's News page needs."""
    pr = {
        "number": node["number"], "title": node["title"], "body": node.get("body") or "",
        "author": (node.get("author") or {}).get("login") or "ghost",
        "labels": [label["name"] for label in node["labels"]["nodes"]],
        "branch": node["headRefName"], "base": node["baseRefName"],
        "merged_at": node["mergedAt"], **dev_fields(node),
    }
    files = fetch_pr_files(repository, str(pr["number"]), github_token)
    analysis = analyze_pr(pr, files[0], token)
    if not analysis or not analysis.get("summary"):
        raise SystemExit(f"PR #{pr['number']}: no summary in the reply")
    analysis.pop("image_prompt", None)
    result = {
        "pr_number": pr["number"], "title": pr["title"], "author": pr["author"], "url": node["url"],
        "merged_at": pr["merged_at"], "base": pr["base"], "labels": pr["labels"],
        "area": pr["area"], "type": pr["type"], "source": pr["source"],
        **{key: analysis.get(key) for key in ("summary", "category", "importance", "user_facing", "keywords")},
        "publish_tier": publish_tier(pr["labels"], analysis),
        **(app_for(pr["branch"], files[1]) or {}),
    }
    if API_DOCS in files[1]:
        result["api_changes"] = api_changes_for_pr({**pr, "mergeCommit": node["mergeCommit"]}, repository)
    if announcements := announced_retirements(pr, catalog):
        result["announcements"] = announcements
    return result


def day_notes(day: str, token: str, github_token: str, repository: str, catalog: List[Dict]) -> List[Dict]:
    """A note for each PR merged on the day, in PR order."""
    nodes = sorted(merged_on(day, github_token, repository), key=lambda node: node["number"])
    print(f"  {len(nodes)} PRs merged on {day}")
    return [note(node, token, github_token, repository, catalog) for node in nodes]
