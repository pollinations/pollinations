#!/usr/bin/env python3
"""Post each PR a production deploy shipped to Discord, once.

    python deploy_posts.py --production CHECKOUT [--preview]

PRs reaching production are saved in posts/discord/prs/held.json with the scan cursor before
sending. Each stays held until every affected service has successfully deployed a
commit containing it. A rerun skips sent PRs through the existing delivery record.
Use --preview to inspect readiness without writing records or sending anything.
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
    parse_json_response,
    prompt_text,
    safe_truncate,
)
from deliver import deliver, send_discord, read_news, github as write_news
from posts import fill, read_post
from prs import app_for, fetch_pr_files

# The PR that replaced the merge-time posts: PRs merged before it were posted when they merged.
CUTOVER_PR = 17666
WORKFLOWS = {
    "deploy-cloudflare-production.yml": None,
    "deploy-website-cloudflare.yml": "deploy",
    "deploy-applications.yml": None,
    "deploy-e2b-templates.yml": "build",
    "deploy-portkey-cloudflare.yml": "deploy",
}
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


def discover(state: dict, head: str, cutover: dict, rules: Path) -> None:
    """Advance the cursor and hold new PRs atomically; failed sends never lose a PR."""
    since = state.get("production") or cutover["merge_commit_sha"]
    if not includes(since, head):
        if not state.get("production"):
            return  # the cutover is on main but hasn't reached production
        raise ValueError("Production no longer contains the saved news cursor; inspect the rollback")
    commits = pages(f"compare/{since}...{head}", "commits") if since != head else []
    # GitHub links every commit to the PR that brought it, whether it was squashed, rebased or
    # merged; the base check leaves out production promotions.
    numbers = {pr["number"] for commit in commits for pr in github(f"commits/{commit['sha']}/pulls")
               if pr["base"]["ref"] == "main" and pr["merged_at"]}
    for number in sorted(numbers):
        pr = github(f"pulls/{number}")
        if pr["base"]["ref"] != "main" or (pr["merged_at"] or "") < cutover["merged_at"]:
            continue
        _, files = fetch_pr_files(get_env("GITHUB_REPOSITORY"), str(number), get_env("GITHUB_TOKEN"))
        state["held"][str(number)] = {
            "merge_sha": pr["merge_commit_sha"], "merged_at": pr["merged_at"],
            "required": required_targets(files, rules),
        }
    state["production"] = head


def waiting_for(held: dict) -> dict[str, list[str]]:
    """Find successful deployment jobs containing each held PR, without an age cutoff."""
    waiting = {number: set(pr["required"]) for number, pr in held.items()}
    for workflow in WORKFLOWS:
        pending = {number for number, targets in waiting.items()
                   if any(target.startswith(workflow + ":") for target in targets)}
        if not pending:
            continue
        earliest = min(held[number]["merged_at"] for number in pending)
        for run in pages(f"actions/workflows/{workflow}/runs", "workflow_runs",
                         branch="production", status="completed"):
            # An older run's commit cannot contain a PR merged later. There is no age limit.
            if run["created_at"] < earliest:
                break
            jobs = list(pages(f"actions/runs/{run['id']}/jobs", "jobs", filter="latest"))
            targets = {f"{workflow}:{job['name']}" for job in jobs if job["conclusion"] == "success"}
            targets.update(f"{workflow}:{step['name']}" for job in jobs if job["conclusion"] == "success"
                           for step in job.get("steps", []) if step["conclusion"] == "success"
                           and step["name"].startswith("Deploy "))
            for number in list(pending):
                if waiting[number] & targets and includes(held[number]["merge_sha"], run["head_sha"]):
                    waiting[number] -= targets
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
    """Write the post and its picture, and return the call that sends it."""
    repository = get_env("GITHUB_REPOSITORY")
    changes, files = fetch_pr_files(repository, str(pr["number"]), get_env("GITHUB_TOKEN"))
    app = app_for(pr["head"]["ref"], files)
    # Trust boundary: the body comes from a merged PR (repo write access). Capped as a size guard.
    context = "\n".join([
        f"PR #{pr['number']}: {pr['title']}",
        f"App: {app['app_name']} ({app['app_url']})" if app else "",
        f"\nDescription:\n{(pr['body'] or 'No description provided.')[:6000]}",
        f"\nChanged files and their diff:\n{changes}",
    ])
    reply = call_pollinations_api(
        load_prompt(f"posts/{POST['tone']}/tone"), fill(prompt_text(POST["text"]), pr=context),
        token, temperature=POST["temperature"], response_format={"type": "json_object"},
    )
    output = parse_json_response(reply) if reply else None
    if not isinstance(output, dict) or output.get("publish_tier") not in ("none", "discord_only", "daily"):
        raise ValueError("the reply has no valid publish tier")
    if output["publish_tier"] == "none":
        return lambda: ("done", {"skipped": "none"})
    if not all(output.get(key) for key in POST["required"]):
        raise ValueError("the reply has no text or picture prompt")
    picture, _ = generate_image(output["image_prompt"], token)
    if not picture:
        raise ValueError("the picture failed")
    post = message(pr, output["text"], app)
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
    discover(state, head, cutover, args.production)
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
