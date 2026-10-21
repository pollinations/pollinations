#!/usr/bin/env python3
"""Post every PR merged into main or master to Discord once it ships, once.

    python deploy_posts.py --production CHECKOUT [--preview]

PRs reaching production, and PRs merged into master, are saved in posts/discord/prs/held.json
with their branch's scan cursor before sending. Each stays held until every affected service
has successfully deployed it: a production deployment of a commit containing it, or for master
the legacy cache deployment of each Worker it changes. Production promotions are not posted.
A rerun skips sent PRs through the existing delivery record. Use --preview to inspect
readiness without writing records or sending anything.
"""

import argparse
import base64
import json
import subprocess
import sys
import time
from datetime import datetime
from fnmatch import fnmatchcase
from functools import cache
from pathlib import Path

import yaml

from common import (
    DISCORD_CHAR_LIMIT,
    GITHUB_API_BASE,
    NEWS_BRANCH,
    POSTS_REL_DIR,
    PROMPTS_DIR,
    _github_headers,
    call_pollinations_api,
    generate_image,
    get_env,
    get_repo_root,
    github_api_request,
    load_prompt,
    pr_context,
    prompt_text,
    safe_truncate,
)
from deliver import deliver, send_discord, read_news, github as write_news
from posts import fill, read_post
from prs import analyze_pr, app_for, fetch_pr_files

# The PR that replaced the merge-time posts: PRs merged before it were posted when they merged.
CUTOVER_PR = 17666
WORKFLOWS = {
    "deploy-cloudflare-production.yml": None,
    "deploy-website-cloudflare.yml": "deploy",
    "deploy-applications.yml": None,
    "deploy-e2b-templates.yml": "build",
    "deploy-portkey-cloudflare.yml": "deploy",
}
# Deploys master's two cache Workers when run by hand; each job checks out master as it starts.
LEGACY = "deploy-legacy-caches.yml"
PRS_DIR = f"{POSTS_REL_DIR}/discord/prs"
HELD_PATH = f"{PRS_DIR}/held.json"
POST = read_post(PROMPTS_DIR / "posts/discord/pr.md")


def github(path: str, **params):
    repository = get_env("GITHUB_REPOSITORY")
    response = github_api_request(
        "GET",
        f"{GITHUB_API_BASE}/repos/{repository}/{path}",
        headers=_github_headers(get_env("GITHUB_TOKEN")),
        params=params,
    )
    response.raise_for_status()
    return response.json()


def pages(path: str, key: str, **params):
    page = 1
    while True:
        items = github(path, per_page=100, page=page, **params)[key]
        yield from items
        if len(items) < 100:
            break
        page += 1


@cache
def includes(commit: str, head: str) -> bool:
    return commit == head or github(f"compare/{commit}...{head}")["status"] in ("ahead", "identical")


def required_targets(files: list[str], root: Path | None = None) -> list[str]:
    """Use the deployment workflows' filters and the applications' own discovery."""
    root = root or Path(get_repo_root())
    required = []
    for workflow, job in WORKFLOWS.items():
        config = yaml.load((root / ".github/workflows" / workflow).read_text(), Loader=yaml.BaseLoader)
        filters = {job: config["on"]["push"]["paths"]} if job else {}
        if workflow == "deploy-cloudflare-production.yml":
            step = next(step for step in config["jobs"]["changes"]["steps"] if step.get("id") == "filter")
            filters = {f"deploy-{service}": patterns for service, patterns in
                       yaml.safe_load(step["with"]["filters"]).items()}
        for target, patterns in filters.items():
            if any(fnmatchcase(file, pattern) for file in files for pattern in patterns):
                required.append(f"{workflow}:{target}")
    # Reuse the exact manifest/watch matching that deploy-applications and Cloudflare run.
    script = """const {discover, selectChanged} = require('./operations/deployment/discover.cjs');
const files = JSON.parse(require('node:fs').readFileSync(0, 'utf8'));
process.stdout.write(JSON.stringify(selectChanged(discover('all'), files)));"""
    apps = json.loads(subprocess.run(["node", "-e", script], input=json.dumps(files),
                                    text=True, capture_output=True, check=True, cwd=root).stdout)
    for app in apps:
        if app["path"] == "apps/polli":
            continue  # deploys from main, outside the production workflows
        workflow = ("deploy-cloudflare-production.yml" if app["name"].endswith("-mcp")
                    else "deploy-applications.yml")
        required.append(f"{workflow}:Deploy {app['path']}")
    return sorted(required)


def legacy_targets(files: list[str]) -> list[str]:
    """The master cache Workers a PR changes; both bundle shared/."""
    return [f"{LEGACY}:deploy ({worker})" for worker in ("image", "text")
            if any(file.startswith((f"{worker}.pollinations.ai/cloudflare-cache/", "shared/")) for file in files)]


def discover(state: dict, cursor: str, base: str, head: str, start: str, cutover: dict, targets) -> None:
    """Advance one branch's cursor and hold its new PRs atomically; failed sends never lose a PR."""
    since = state.get(cursor) or start
    if not includes(since, head):
        if not state.get(cursor):
            return  # the cutover is on main but hasn't reached production
        raise ValueError(f"{cursor} no longer contains the saved news cursor; inspect the rollback")
    commits = pages(f"compare/{since}...{head}", "commits") if since != head else []
    # GitHub links every commit to the PR that brought it, whether it was squashed, rebased or
    # merged; the base check leaves out production promotions.
    numbers = {pr["number"] for commit in commits for pr in github(f"commits/{commit['sha']}/pulls")
               if pr["base"]["ref"] == base and pr["merged_at"]}
    for number in sorted(numbers):
        pr = github(f"pulls/{number}")
        if pr["base"]["ref"] != base or (pr["merged_at"] or "") < cutover["merged_at"]:
            continue
        _, files = fetch_pr_files(get_env("GITHUB_REPOSITORY"), str(number), get_env("GITHUB_TOKEN"))
        state["held"][str(number)] = {
            "merge_sha": pr["merge_commit_sha"], "merged_at": pr["merged_at"], "required": targets(files),
        }
    state[cursor] = head


def deployed(workflow: str, jobs: list[dict]) -> dict[str, str]:
    """The targets a run deployed, each with when its job started."""
    succeeded = [job for job in jobs if job["conclusion"] == "success"]
    if workflow == LEGACY:
        # A rollback run deploys an old version: only "Deploy master" ships master.
        return {f"{workflow}:{job['name']}": job["started_at"] for job in succeeded
                if any(step["name"] == "Deploy master" and step["conclusion"] == "success"
                       for step in job.get("steps", []))}
    targets = {f"{workflow}:{job['name']}": job.get("started_at") for job in succeeded}
    targets.update({f"{workflow}:{step['name']}": job.get("started_at") for job in succeeded
                    for step in job.get("steps", []) if step["conclusion"] == "success"
                    and step["name"].startswith("Deploy ")})
    return targets


def waiting_for(held: dict) -> dict[str, list[str]]:
    """Find successful deployment jobs containing each held PR, without an age cutoff."""
    waiting = {number: set(pr["required"]) for number, pr in held.items()}
    for workflow in [*WORKFLOWS, LEGACY]:
        pending = {number for number, targets in waiting.items()
                   if any(target.startswith(workflow + ":") for target in targets)}
        if not pending:
            continue
        earliest = min(held[number]["merged_at"] for number in pending)
        # Production deploys run on production; the legacy one is dispatched from main or production.
        branch = {} if workflow == LEGACY else {"branch": "production"}
        for run in pages(f"actions/workflows/{workflow}/runs", "workflow_runs", status="completed", **branch):
            # An older run's commit cannot contain a PR merged later. There is no age limit.
            if run["created_at"] < earliest:
                break
            targets = deployed(workflow, list(pages(f"actions/runs/{run['id']}/jobs", "jobs", filter="latest")))
            for number in list(pending):
                pr = held[number]
                if workflow == LEGACY:
                    # Master is checked out when the job starts, so a job started after the merge ships it.
                    waiting[number] -= {target for target, started in targets.items() if started >= pr["merged_at"]}
                elif waiting[number] & targets.keys() and includes(pr["merge_sha"], run["head_sha"]):
                    waiting[number] -= targets.keys()
                if not any(target.startswith(workflow + ":") for target in waiting[number]):
                    pending.remove(number)
            if not pending:
                break
    return {number: sorted(targets) for number, targets in waiting.items()}


def save_state(state: dict, sha: str | None) -> str:
    """One queued workflow owns this file; a conflicting writer must not be overwritten."""
    response = write_news("PUT", HELD_PATH, json={
        "message": "news: update held deployment posts",
        "content": base64.b64encode(json.dumps(state, indent=2).encode()).decode(),
        "branch": NEWS_BRANCH, **({"sha": sha} if sha else {}),
    })
    response.raise_for_status()
    return response.json()["content"]["sha"]


def message(pr: dict, text: str, app: dict | None) -> dict:
    """The post: a heading line, the text, the app's link and the PR footer."""
    head, _, rest = text.strip().partition("\n")
    body = f"### {head}" + (f"\n\n{rest.strip()}" if rest.strip() else "")
    if app:
        body += f"\n\n🔗 [{app['app_name']}](<{app['app_url']}>)"
    author = pr["user"]["login"]
    merged = int(datetime.fromisoformat(pr["merged_at"].replace("Z", "+00:00")).timestamp())
    footer = (f"\n\n[PR #{pr['number']}](<{pr['html_url']}>) | "
              f"By [{author}](<https://github.com/{author}>) <t:{merged}:F>")
    return {"content": safe_truncate(body, DISCORD_CHAR_LIMIT - len(footer)) + footer,
            "allowed_mentions": {"parse": []}}


def prepare_post(pr: dict, token: str, webhook: str):
    """Write the PR's note, the post from the note and the picture from the note's prompt,
    and return the call that sends it."""
    repository = get_env("GITHUB_REPOSITORY")
    changes, files = fetch_pr_files(repository, str(pr["number"]), get_env("GITHUB_TOKEN"))
    app = app_for(pr["head"]["ref"], files)
    author = pr["user"]["login"]
    note = analyze_pr({
        "number": pr["number"], "title": pr["title"], "body": pr["body"], "author": author,
        "labels": [label["name"] for label in pr["labels"]], "branch": pr["head"]["ref"],
        "base": pr["base"]["ref"], "area": None, "type": None, "source": None,
    }, changes, token)
    if not note or not note.get("summary") or not note.get("image_prompt"):
        raise ValueError("the note has no summary or picture prompt")
    gist = pr_context({**note, "pr_number": pr["number"], "title": pr["title"], "author": author,
                       "url": pr["html_url"], **(app or {})})
    text = call_pollinations_api(
        load_prompt(f"posts/{POST['tone']}/tone"), fill(prompt_text(POST["text"]), gist=json.dumps(gist, indent=2)),
        token, temperature=POST["temperature"],
    )
    if not text:
        raise ValueError("the reply has no text")
    picture, _ = generate_image(note["image_prompt"], token)
    if not picture:
        raise ValueError("the picture failed")
    post = message(pr, text, app)
    return lambda: send_discord(webhook, [post], picture)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--production", type=Path, required=True, help="checkout of production for deployment rules")
    parser.add_argument("--preview", action="store_true", help="show held PR readiness; never write or send")
    args = parser.parse_args()
    cutover = github(f"pulls/{CUTOVER_PR}")
    if not cutover["merged_at"]:
        sys.exit(f"#{CUTOVER_PR} is not merged yet: PRs are still posted when they merge")
    content, sha = read_news(HELD_PATH)
    state = json.loads(content) if content else {"held": {}}
    head = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=args.production, text=True).strip()
    discover(state, "production", "main", head, cutover["merge_commit_sha"], cutover,
             lambda files: required_targets(files, args.production))
    master = github("branches/master")["commit"]["sha"]
    # Master's scan starts at its last commit before the cutover; later merges were never posted.
    start = state.get("master") or github("commits", sha="master", until=cutover["merged_at"], per_page=1)[0]["sha"]
    discover(state, "master", "master", master, start, cutover, legacy_targets)
    waiting = waiting_for(state["held"])
    for number, targets in waiting.items():
        print(f"  #{number}: waiting for {', '.join(targets) if targets else 'nothing; ready'}")
    if args.preview:
        return
    for number, targets in waiting.items():
        state["held"][number]["required"] = targets  # never forget a successful deployment while another is held
    sha = save_state(state, sha)  # persist the cursor AND every pending PR before any send
    token, webhook = get_env("POLLINATIONS_TOKEN"), get_env("DISCORD_REALTIME_WEBHOOK_URL")
    problems = []
    for number, targets in waiting.items():
        if targets:
            continue
        pr = github(f"pulls/{number}")
        folder = f"{PRS_DIR}/{pr['merged_at'][:7]}"
        outcome = deliver(folder, f"pr-{number}", lambda pr=pr: prepare_post(pr, token, webhook))
        print(f"  #{number}: {outcome}")
        if outcome in ("done", "already done"):
            del state["held"][number]
        else:
            problems.append(f"#{number} ({outcome})")
        time.sleep(2)
    save_state(state, sha)
    if problems:
        sys.exit(f"Not posted: {', '.join(problems)}. Failed posts stay held for the next run. "
                 "For a stuck post, check Discord, then run `deliver.py mark prs MONTH PR done|failed`.")


if __name__ == "__main__":
    main()
