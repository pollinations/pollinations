#!/usr/bin/env python3
"""Post each PR a production deploy shipped to Discord, once.

    python deploy_posts.py SHA

SHA is the production commit a successful deploy shipped. Its PRs are those merged
into main since the previous successful deploy. Each post is recorded in
news/discord/<merge month>/delivery.json, so a rerun or the next deploy never posts
a PR twice. When a PR fails the run fails, and rerunning it tries that PR again.
"""

import argparse
import re
import sys
import time
from datetime import datetime

from common import (
    DISCORD_CHAR_LIMIT,
    GITHUB_API_BASE,
    NEWS_REL_DIR,
    _github_headers,
    call_pollinations_api,
    generate_image,
    get_env,
    github_api_request,
    load_prompt,
    parse_json_response,
    prompt_text,
    safe_truncate,
)
from deliver import deliver, send_discord
from posts import POSTS_DIR, fill, read_post
from prs import app_for, fetch_pr_files

# The merge-time posts stopped here; PRs merged earlier were posted when they merged.
START = "2026-10-20T00:00:00Z"
DEPLOY_WORKFLOW = "deploy-cloudflare-production.yml"
SQUASHED = re.compile(r"\(#(\d+)\)$")
POST = read_post(POSTS_DIR / "discord-pr.md")


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


def previous_deploy(sha: str) -> str:
    """The production commit of the last successful deploy before SHA's."""
    runs = github(f"actions/workflows/{DEPLOY_WORKFLOW}/runs", branch="production",
                  status="success", per_page=50)["workflow_runs"]
    shas = [run["head_sha"] for run in runs]  # newest first
    if sha not in shas:
        sys.exit(f"{sha} is not a successful production deploy")
    earlier = [s for s in shas[shas.index(sha):] if s != sha]
    if not earlier:
        sys.exit(f"No successful deploy before {sha} in the last {len(shas)}")
    return earlier[0]


def shipped(since: str, sha: str) -> list[dict]:
    """The PRs merged into main from START that reached production between the two commits."""
    numbers, page = set(), 1
    while True:
        commits = github(f"compare/{since}...{sha}", per_page=100, page=page)["commits"]
        # A squash merge into main is titled "<PR title> (#N)"; promotions are merge commits.
        for commit in commits:
            if match := SQUASHED.search(commit["commit"]["message"].split("\n", 1)[0]):
                numbers.add(int(match[1]))
        if len(commits) < 100:
            break
        page += 1
    prs = [github(f"pulls/{number}") for number in sorted(numbers)]
    return [pr for pr in prs if pr["base"]["ref"] == "main" and (pr["merged_at"] or "") >= START]


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
        load_prompt(f"tone/{POST['tone']}"), fill(prompt_text(POST["text"]), pr=context),
        token, temperature=POST["temperature"], response_format={"type": "json_object"},
    )
    output = parse_json_response(reply) if reply else None
    if not isinstance(output, dict) or not all(output.get(key) for key in POST["required"]):
        raise ValueError("the reply has no text or picture prompt")
    picture, _ = generate_image(output["image_prompt"], token)
    if not picture:
        raise ValueError("the picture failed")
    post = message(pr, output["text"], app)
    return lambda: send_discord(webhook, [post], picture)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("sha", help="the production commit the deploy shipped")
    sha = parser.parse_args().sha
    token, webhook = get_env("POLLINATIONS_TOKEN"), get_env("DISCORD_REALTIME_WEBHOOK_URL")
    since = previous_deploy(sha)
    prs = shipped(since, sha)
    print(f"{len(prs)} PRs shipped from {since[:10]} to {sha[:10]}")
    problems = []
    for index, pr in enumerate(prs):
        if index:
            time.sleep(2)  # one post at a time, well under Discord's webhook rate
        folder = f"{NEWS_REL_DIR}/discord/{pr['merged_at'][:7]}"
        outcome = deliver(folder, f"pr-{pr['number']}", lambda pr=pr: prepare_post(pr, token, webhook))
        print(f"  #{pr['number']}: {outcome}")
        if outcome in ("failed", "stuck"):
            problems.append(f"#{pr['number']} ({outcome})")
    if problems:
        sys.exit(
            f"Not posted: {', '.join(problems)}. A failed post is tried again by a rerun. A stuck "
            "post may have gone out: check the channel, then set its entry in delivery.json to done."
        )


if __name__ == "__main__":
    main()
