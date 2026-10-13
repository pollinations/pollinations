#!/usr/bin/env python3
"""
News / Create PR gist: the gist of each merged PR.

On PR merge:
  Step 1: AI analyzes the PR → structured gist JSON, with the PR's exact official
          model changes (from the registry revisions it merged) and API changes
          (from the APIDOCS.md the post-deploy docs PR regenerates)
  Step 2: Generate pixel art image → commit image + gist to news branch

Discord posting is handled separately by discord_pr.py.
See operations/social/PIPELINE.md for full architecture.
"""

import json
import os
import re
import sys
import subprocess
import tempfile
from pathlib import Path
from datetime import datetime, timezone
from typing import Dict, List, Optional

from common import (
    load_prompt,
    get_env,
    get_repo_root,
    call_pollinations_api,
    generate_image,
    commit_image_to_branch,
    validate_gist,
    apply_publish_tier_rules,
    commit_gist,
    parse_json_response,
    github_api_request,
    GITHUB_API_BASE,
    GISTS_BRANCH,
    MODEL,
)


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


def api_changes_for_pr(pr: Dict, root) -> List[Dict]:
    """API changes of a merged PR that regenerates APIDOCS.md (the post-deploy docs PR)."""
    def surface(ref):
        return api_surface(subprocess.run(["git", "show", f"{ref}:{API_DOCS}"], cwd=root,
                                          capture_output=True, text=True, check=True).stdout)

    return api_changes(*(surface(ref) for ref in pr_comparison_refs(pr, root)), pr)


# ── Model changes: exact official changes from merged registry revisions ──

ROOT = Path(__file__).resolve().parents[3]
IGNORED = {"health", "pending_change", "name", "title", "description", "publisher",
           "brand_url", "brand_icon_url", "added_date", "community", "agent"}


def model_changes(before, after, pr):
    old = {m["name"]: m for m in before if not m.get("community")}
    new = {m["name"]: m for m in after if not m.get("community")}
    aliases = {alias for model in new.values() for alias in model.get("aliases", [])}
    removed = old.keys() - new.keys()
    renamed = {name: next((alias for alias in model.get("aliases", []) if alias in removed), None)
               for name, model in new.items() if name not in old}
    events = []
    for name in sorted(old.keys() | new.keys()):
        if name in removed and name in aliases:
            continue  # This ID still works through an alias; it is not retired.
        previous, current = old.get(renamed.get(name) or name), new.get(name)
        changes = {}
        for field in sorted((previous or {}).keys() | (current or {}).keys()):
            if field in IGNORED:
                continue
            a, b = (previous or {}).get(field), (current or {}).get(field)
            if field == "paid_only" and previous and current:
                a, b = bool(a), bool(b)
            if a != b:
                changes[field] = {"before": a, "after": b}
        if renamed.get(name):
            # The old ID keeps working as an alias, but the model behind it changed.
            changes["model_id"] = {"before": renamed[name], "after": name}
        if previous is None or current is None:
            changes["availability"] = {"before": "Available" if previous else "Unavailable",
                                       "after": "Available" if current else "Retired"}
        kind = "added" if previous is None else "removed" if current is None else "changed"
        if changes or previous is None or current is None:
            events.append({"id": f"pr-{pr['number']}:{name}", "model_id": name,
                           "title": (current or previous).get("title", name), "action": {"added": "NEW", "removed": "RETIRE", "changed": "UPDATE"}[kind],
                           "category": (current or previous).get("category"),
                           "pricing_units": {"before": (previous or {}).get("pricing_units"), "after": (current or {}).get("pricing_units")},
                           "changes": changes, "effective_at": None, "effective_status": "unconfirmed", "official": True,
                           **({"previous_title": previous.get("title", renamed[name])} if renamed.get(name) else {})})
    return events


def export_at(ref, root=ROOT):
    # Only tracked files enter the temporary checkout; local credentials are never copied.
    with tempfile.TemporaryDirectory(prefix="news-catalog-") as directory:
        target = Path(directory)
        archive = subprocess.run(["git", "archive", ref], cwd=root, check=True, capture_output=True)
        subprocess.run(["tar", "-x", "-C", directory], input=archive.stdout, check=True)
        (target / "node_modules").symlink_to(root / "node_modules", target_is_directory=True)
        result = subprocess.run(["node", "--import", "tsx", str(ROOT / "operations/social/scripts/model_catalog.ts"), directory],
                                cwd=root, check=True, capture_output=True, text=True)
        return json.loads(result.stdout)


def pr_comparison_refs(pr, root=ROOT):
    sha = pr["merge_commit_sha"]
    parents = subprocess.run(["git", "rev-list", "--parents", "-n", "1", sha], cwd=root,
                             check=True, capture_output=True, text=True).stdout.split()
    before = f"{sha}^1"
    # For rebases, match the complete PR commit sequence by stable patch ID.
    # Squashes and merge commits compare the actual first-parent merged trees.
    if len(parents) == 2 and pr.get("commits", 1) > 1:
        count = pr["commits"]
        originals = pr.get("_commit_shas")
        if not originals or len(originals) != count:
            raise ValueError("Multi-commit PR requires its commit list to distinguish squash from rebase")
        merged = subprocess.run(["git", "rev-list", f"--max-count={count}", sha], cwd=root, check=True, capture_output=True, text=True).stdout.splitlines()[::-1]
        def patch_id(*refs):
            command = (["git", "diff", "--no-ext-diff", *refs] if len(refs) == 2
                       else ["git", "show", "--pretty=format:", "--no-ext-diff", refs[0]])
            patch = subprocess.run(command, cwd=root, check=True, capture_output=True).stdout
            result = subprocess.run(["git", "patch-id", "--stable"], input=patch, check=True, capture_output=True).stdout.decode().split()
            return result[0] if result else None
        expected = [patch_id(commit) for commit in originals]
        if all(expected) and expected == [patch_id(commit) for commit in merged]:
            before = f"{sha}~{count}"
        else:
            source_base = subprocess.run(["git", "merge-base", before, originals[-1]], cwd=root,
                                         check=True, capture_output=True, text=True).stdout.strip()
            combined = patch_id(source_base, originals[-1])
            if not combined or combined != patch_id(before, sha):
                raise ValueError("Cannot verify the full PR range as a rebase or squash")
    return before, sha


# A RETIRE row of the model-change table in a PR description (model-management skill):
# | `model` | RETIRE | Availability | Available | Retired | 2026-11-02 00:00 UTC |
RETIRE_ROW = re.compile(r"^\|\s*`?([\w./:-]+)`?\s*\|\s*RETIRE\s*\|(?:[^|\n]*\|){3}\s*([^|\n]*?)\s*\|\s*$",
                        re.MULTILINE | re.IGNORECASE)
WHEN = re.compile(r"(\d{4}-\d{2}-\d{2})(?:[ T](\d{2}:\d{2}))?\s*(UTC|Z|[+-]\d{2}:\d{2})?")


def announces_retirement(pr):
    return bool(RETIRE_ROW.search(pr.get("body") or ""))


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


def announcements_for_pr(pr, files, root=ROOT, refs=None):
    changed = any(path.startswith("shared/") for path in files)
    if not changed and not announces_retirement(pr):
        return []
    # Announcement-only PRs need just the merged catalog to check the model IDs.
    before, after = (refs or pr_comparison_refs(pr, root)) if changed else (None, pr["merge_commit_sha"])
    catalog = export_at(after, root)
    events = model_changes(export_at(before, root), catalog, pr) if changed else []
    return events + announced_retirements(pr, catalog)


# ── GitHub helpers ───────────────────────────────────────────────────

def fetch_pr_data(repo: str, pr_number: str, token: str) -> Dict:
    """Fetch full PR data from GitHub REST API."""
    headers = {
        "Authorization": f"Bearer {token}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
    }
    url = f"{GITHUB_API_BASE}/repos/{repo}/pulls/{pr_number}"
    resp = github_api_request("GET", url, headers=headers)
    if resp.status_code != 200:
        print(f"GitHub API error: {resp.status_code} {resp.text[:300]}")
        sys.exit(1)
    return resp.json()


def fetch_pr_files(repo: str, pr_number: str, token: str) -> tuple:
    """Fetch list of changed files. Returns (formatted_string, list_of_filenames)."""
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

    filenames = [f.get("filename", "") for f in all_files]
    lines = []
    for f in all_files:
        status = f.get("status", "modified")
        filename = f.get("filename", "")
        lines.append(f"  {status}: {filename} (+{f.get('additions', 0)}/-{f.get('deletions', 0)})")
    summary = "\n".join(lines) if lines else "(no files changed)"
    return summary, filenames


def enrich_gist(gist: Dict, pr: Dict, files: list, token: str) -> None:
    """Classification and the PR's exact model and API changes. Any failure stops the gist:
    nothing is saved or posted, and a person reruns it."""
    root = Path(get_repo_root())
    gist.update({"area": None, "type": None, "source": None,
                 "merge_commit_sha": pr["merge_commit_sha"], "announcements": []})
    with tempfile.TemporaryDirectory(prefix="gist-classification-") as directory:
        output = Path(directory) / "classification.json"
        subprocess.run(
            [sys.executable, str(root / "operations/github/project_manager.py")],
            env={**os.environ, "GITHUB_TOKEN": token,
                 "GITHUB_EVENT": json.dumps({"action": "closed", "pull_request": pr}),
                 "CLASSIFICATION_OUTPUT": str(output)}, check=True,
        )
        gist.update(json.loads(output.read_text()))
    changed = any(path.startswith("shared/") for path in files)
    if changed or announces_retirement(pr):
        if not (root / "node_modules/tsx").is_dir():
            subprocess.run(["npm", "ci", "--ignore-scripts"], cwd=root, check=True)
        # Rebase detection needs original commits as well as the merged history.
        if changed and pr.get("commits", 1) > 1:
            commits = []
            page = 1
            while True:
                response = github_api_request("GET",
                    f"{GITHUB_API_BASE}/repos/{os.environ['REPO_FULL_NAME']}/pulls/{pr['number']}/commits",
                    headers={"Authorization": f"Bearer {token}"},
                    params={"per_page": 100, "page": page})
                response.raise_for_status()
                batch = response.json()
                commits.extend(commit["sha"] for commit in batch)
                if len(batch) < 100:
                    break
                page += 1
            pr = {**pr, "_commit_shas": commits}
            subprocess.run(["git", "fetch", "origin", f"pull/{pr['number']}/head"], cwd=root, check=True)
        refs = pr_comparison_refs(pr, root) if changed else None
        gist["announcements"] = announcements_for_pr(pr, files, root, refs)
        if refs:
            gist["announcement_evidence"] = {"before_ref": refs[0], "after_ref": refs[1]}
    # The docs PR regenerated after each production deploy carries the live API changes.
    if API_DOCS in files:
        gist["api_changes"] = api_changes_for_pr(pr, root)

# ── App catalog lookup ──────────────────────────────────────────────

def lookup_newest_app() -> Optional[Dict]:
    """Read operations/app-management/app.json and return the newest app's name and URL.

    The catalog is sorted newest-first, so the first entry is the newest app.
    Returns {"app_name": str, "app_url": str} or None.
    """
    repo_root = get_repo_root()
    apps_path = os.path.join(repo_root, "operations", "app-management", "app.json")
    if not os.path.exists(apps_path):
        return None

    with open(apps_path, "r", encoding="utf-8") as f:
        apps = json.load(f)

    if not apps:
        return None

    newest = apps[0]
    name = newest.get("name")

    if not name:
        return None

    # Prefer Web_URL, fall back to Github_Repository_URL
    app_url = newest.get("url") or newest.get("repositoryUrl")
    if not app_url:
        return None

    return {"app_name": name, "app_url": app_url}


# ── Step 1: AI analysis ─────────────────────────────────────────────

def analyze_pr(pr_data: Dict, files_summary: str, token: str, enrichment: Dict) -> Optional[Dict]:
    """Call AI to analyze a PR and return structured gist JSON."""
    system_prompt = load_prompt("gist")

    # Build user prompt with PR context
    # Trust boundary: PR body comes from merged PRs (requires repo write access),
    # not arbitrary user input. Truncated to 2000 chars as a size guard.
    labels = [l["name"] for l in pr_data.get("labels", [])]
    body = pr_data.get("body") or ""
    context = {key: enrichment.get(key) for key in ("area", "type", "source", "announcements")}
    user_prompt = f"""PR #{pr_data['number']}: {pr_data['title']}

Author: {pr_data.get('user', {}).get('login', 'unknown')}
Labels: {', '.join(labels) if labels else 'none'}
Branch: {pr_data.get('head', {}).get('ref', 'unknown')} → {pr_data.get('base', {}).get('ref', 'main')}

Description:
{body[:2000] if body else 'No description provided.'}

Changed files:
{files_summary}

Classification and exact model changes already recorded:
{json.dumps(context, indent=2)}"""

    response = call_pollinations_api(
        system_prompt, user_prompt, token,
        temperature=0.2,
        response_format={"type": "json_object"},
    )
    return parse_json_response(response) if response else None


def build_full_gist(pr_data: Dict, ai_analysis: Dict, changed_files: list) -> Dict:
    """Build the complete gist object from PR data + AI analysis."""
    labels = [l["name"] for l in pr_data.get("labels", [])]
    author = pr_data.get("user", {}).get("login", "unknown")

    analysis = dict(ai_analysis)
    image_prompt = analysis.pop("image_prompt", None)

    gist = {
        "pr_number": pr_data["number"],
        "title": pr_data["title"],
        "author": author,
        "url": pr_data["html_url"],
        "merged_at": pr_data.get("merged_at", datetime.now(timezone.utc).isoformat()),
        "labels": labels,
        "gist": analysis,
        "image": {"url": None, "prompt": image_prompt},
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }

    # Apply hard rules for publish_tier
    gist["gist"]["publish_tier"] = apply_publish_tier_rules(gist)

    # Detect app submissions: only add app link when a new app was actually added
    # App submission branches are "auto/app-{issue}-{slug}", metrics are "auto/app-metrics-{date}"
    branch = pr_data.get("head", {}).get("ref", "")
    is_app_pr = "operations/app-management/app.json" in changed_files and re.match(r"auto/app-\d+", branch)
    if is_app_pr:
        app_info = lookup_newest_app()
        if app_info:
            gist["app_name"] = app_info["app_name"]
            gist["app_url"] = app_info["app_url"]
            print(f"  App detected: {app_info['app_name']} → {app_info['app_url']}")

    return gist


# ── Step 2: Image generation ────────────────────────────────────────

def generate_gist_image(gist: Dict, pollinations_token: str,
                        github_token: str, owner: str, repo: str) -> Optional[str]:
    """Generate pixel art image for a gist. Returns image URL or None."""
    image_prompt = gist["image"].get("prompt", "")
    if not image_prompt:
        print("  FATAL: No image prompt in gist")
        return None

    print(f"  Image prompt: {image_prompt[:100]}...")

    image_bytes, _ = generate_image(image_prompt, pollinations_token)
    if not image_bytes:
        print("  FATAL: Image generation failed")
        return None

    # Commit image to repo on news branch
    date_str = gist["merged_at"][:10]
    image_path = f"operations/social/news/gists/{date_str}/PR-{gist['pr_number']}.jpg"
    image_url = commit_image_to_branch(
        image_bytes, image_path, GISTS_BRANCH,
        github_token, owner, repo,
    )

    return image_url


# ── Main ─────────────────────────────────────────────────────────────

def main():
    print("=== Tier 1: News / Create PR gist ===")

    # Environment
    github_token = get_env("GITHUB_TOKEN")
    pollinations_token = get_env("POLLINATIONS_TOKEN")
    pr_number = get_env("PR_NUMBER")
    repo_full_name = get_env("REPO_FULL_NAME")

    owner, repo = repo_full_name.split("/")

    # ── Fetch PR data ────────────────────────────────────────────────
    print(f"\n[1/2] Analyzing PR #{pr_number}...")
    pr_data = fetch_pr_data(repo_full_name, pr_number, github_token)
    files_summary, changed_files = fetch_pr_files(repo_full_name, pr_number, github_token)

    # ── Step 1: Enrichment + AI analysis → gist JSON ─────────────────
    enrichment = {}
    enrich_gist(enrichment, pr_data, changed_files, github_token)
    ai_analysis = analyze_pr(pr_data, files_summary, pollinations_token, enrichment)
    if not ai_analysis:
        print(f"  FATAL: PR analysis failed with model {MODEL}")
        sys.exit(1)

    gist = build_full_gist(pr_data, ai_analysis, changed_files)

    gist.update(enrichment)

    errors = validate_gist(gist)
    if errors:
        print(f"  FATAL: Schema validation failed: {errors}")
        sys.exit(1)

    print(f"  Gist ready: publish_tier={gist['gist']['publish_tier']}, "
          f"importance={gist['gist']['importance']}")

    # ── Step 2: Generate image → update gist ─────────────────────────
    print("\n[2/2] Generating image...")
    image_url = generate_gist_image(gist, pollinations_token, github_token, owner, repo)
    if not image_url:
        print("  FATAL: Could not generate or commit gist image")
        sys.exit(1)

    gist["image"]["url"] = image_url

    if not commit_gist(gist, github_token, owner, repo):
        print("  FATAL: Could not commit gist to news branch")
        sys.exit(1)

    print(f"  Gist committed: publish_tier={gist['gist']['publish_tier']}, "
          f"importance={gist['gist']['importance']}")
    print(f"  Image URL: {image_url}")

    print("\n=== Done ===")


if __name__ == "__main__":
    main()
