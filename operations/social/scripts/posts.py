#!/usr/bin/env python3
"""Write and save the scheduled news posts: daily, weekly, monthly, the model post
and the community post.

    python posts.py write JOB DATE --news NEWS --work WORK [--overwrite]
    python posts.py save  JOB DATE --news NEWS --work WORK [--overwrite]

JOB is daily, weekly, monthly, models or community. DATE is the day, the Sunday,
the month (YYYY-MM) or the Wednesday. NEWS is a checkout of the news branch. write makes
the job's model calls and pictures into WORK; save turns WORK into today's files
under NEWS. Neither commits, and save never touches delivery.json.

Each post is one file in prompts/posts/: `key: value` settings between `---`
lines (JSON values where they parse), then its text. The job's post without a
tone is its summary: its text is the system prompt, and its output is the recap
the other posts are written from.
"""

import argparse
import json
import os
import re
import sys
import time
from datetime import UTC, datetime, timedelta
from pathlib import Path

from common import (
    DAILY_REL_DIR,
    GISTS_BRANCH,
    IMAGE_SIZE,
    MODELS_NEWS_DIR,
    MONTHLY_REL_DIR,
    NEWS_REL_DIR,
    OWNER,
    PROMPTS_DIR,
    REPO,
    WEEKLY_REL_DIR,
    _migrate_old_snapshot,
    build_daily_summary_artifact,
    build_linkedin_post_text,
    build_monthly_summary_artifact,
    build_weekly_summary_artifact,
    call_pollinations_api,
    daily_summary_input,
    diff_models,
    discord_payload,
    fetch_all_snapshots,
    filter_daily_gists,
    generate_image,
    get_env,
    get_week_dates,
    load_prompt,
    models_md,
    models_report_input,
    month_dates,
    monthly_digest_input,
    normalize_platform_post,
    parse_json_response,
    post_recap,
    prompt_text,
    read_daily_summaries,
    read_gists_for_date,
    read_gists_for_week,
    weekly_digest_input,
)
from contributors import month_counts

POSTS_DIR = PROMPTS_DIR / "posts"
JOB_DIRS = {
    "daily": DAILY_REL_DIR,
    "weekly": WEEKLY_REL_DIR,
    "monthly": MONTHLY_REL_DIR,
    "models": MODELS_NEWS_DIR,
    "community": f"{NEWS_REL_DIR}/community",
}
# Posts written from a comparison of /models snapshots: official models weekly,
# community models daily.
CATALOG_JOBS = ("models", "community")
# Every public community model, including the ones the reliability filter hides,
# so a model leaving or rejoining the default list is no news.
COMMUNITY_CATALOG = {"community": "true", "reliability": "all"}
# Text an owner writes freely; it never reaches the writer of a public post.
OWNER_TEXT = ("description", "brand_url")
DATES = {
    "daily": "a day (YYYY-MM-DD)",
    "weekly": "a Sunday (YYYY-MM-DD)",
    "monthly": "a month (YYYY-MM)",
    "models": "a day (YYYY-MM-DD)",
    "community": "a day (YYYY-MM-DD)",
}


def read_post(path: Path) -> dict:
    _, header, text = path.read_text(encoding="utf-8").split("---\n", 2)
    post = {"name": path.stem, "text": text.strip()}
    for line in header.splitlines():
        key, _, value = line.partition(":")
        try:
            post[key] = json.loads(value)
        except json.JSONDecodeError:
            post[key] = value.strip()
    return post


def job_posts(job: str) -> list[dict]:
    """The job's posts, its summary first."""
    posts = [read_post(path) for path in sorted(POSTS_DIR.glob("*.md"))]
    return sorted(
        (post for post in posts if post["job"] == job), key=lambda post: "tone" in post
    )


def fill(template: str, **values: str) -> str:
    """Fill {name} placeholders in one pass, so inserted text is never filled again."""
    return re.sub(r"\{(\w+)\}", lambda match: values.get(match[1], match[0]), template)


def period(job: str, date: str) -> tuple[str, str]:
    """The days a post covers: the day, the week before the Sunday, or the month."""
    if job == "weekly":
        start = datetime.strptime(date, "%Y-%m-%d") - timedelta(days=7)
        return get_week_dates(start.strftime("%Y-%m-%d"))[:2]
    if job == "monthly":
        return month_dates(date)
    return date, date


def check_date(job: str, date: str) -> None:
    fmt = "%Y-%m" if job == "monthly" else "%Y-%m-%d"
    try:
        day = datetime.strptime(date, fmt)
        valid = day.strftime(fmt) == date and (job != "weekly" or day.isoweekday() == 7)
    except ValueError:
        valid = False
    if not valid:
        sys.exit(f"{job}: {date} is not {DATES[job]}")


def check(job: str, date: str, news: Path, overwrite: bool) -> None:
    check_date(job, date)
    if not (news / NEWS_REL_DIR).is_dir():
        sys.exit(f"{news} is not a checkout of the news branch")
    saved = f"snapshots/{date}.json" if job in CATALOG_JOBS else f"{date}/summary.json"
    if (news / JOB_DIRS[job] / saved).exists() and not overwrite:
        sys.exit(f"{job} {date} is already saved; pass --overwrite to replace it")
    # A saved model or community post is never replaced, even with --overwrite.
    if job in CATALOG_JOBS and (news / JOB_DIRS[job] / date / "discord.json").exists():
        post = "model" if job == "models" else job
        sys.exit(f"{job} {date} has a saved {post} post; it is never replaced")


def ask(post: dict, system: str, user: str, token: str) -> dict:
    """One model call with the post's temperature; stops unless it returns the post's required fields."""
    print(f"  {post['name']}...")
    response = call_pollinations_api(
        system, user, token, temperature=post["temperature"]
    )
    output = parse_json_response(response) if response else None
    if not output or not isinstance(output, dict):
        sys.exit(f"{post['name']}: no JSON in the reply")
    missing = [key for key in post.get("required", []) if not output.get(key)]
    if missing:
        sys.exit(f"{post['name']}: the reply is missing {', '.join(missing)}")
    return output


def write_post(post: dict, recap: str, date: str, token: str) -> dict:
    """A platform post: its tone is the system prompt, its text with the recap the task."""
    system = load_prompt(f"tone/{post['tone']}")
    retry = ""
    for _ in range(2):
        task = fill(prompt_text(post["text"]), recap=recap, retry=retry, date_str=date)
        output = ask(post, system, task, token)
        if "max_chars" not in post:
            return output
        # LinkedIn: Buffer rejects a longer post, so an overlong draft is rewritten once.
        full_post = build_linkedin_post_text(output)
        if not full_post:
            sys.exit(f"{post['name']}: the post is empty")
        output["full_post"], output["char_count"] = full_post, len(full_post)
        if len(full_post) <= post["max_chars"]:
            return output
        print(
            f"  {post['name']}: {len(full_post)} characters, asking for a shorter draft"
        )
        over = len(full_post) - post["max_chars"]
        retry = post["retry"].format(count=len(full_post), over=over) + json.dumps(
            output
        )
    sys.exit(f"{post['name']}: still {len(full_post)} characters after the rewrite")


def pictures(post: dict, output: dict) -> list[tuple[str, str]]:
    """(file name, prompt) for each picture: one from image_prompt, several from images[i].prompt."""
    names = post["pictures"]
    if len(names) == 1:
        prompt = output.get("image_prompt")
        if post.get("strip_picture_prompt"):
            prompt = str(prompt or "").strip()
        return [(names[0], prompt)]
    return [
        (name, image.get("prompt"))
        for name, image in zip(names, output.get("images") or [])
    ]


def previous_snapshot_date(job: str, news: Path, before: str) -> str | None:
    """The job's latest snapshot before `before`. When its folder exists without any
    snapshot, the baseline was lost: stop rather than silently start a new one."""
    folder = news / JOB_DIRS[job]
    dates = sorted(
        path.stem for path in (folder / "snapshots").glob("*.json") if path.is_file()
    )
    if folder.is_dir() and not dates and not os.environ.get("ALLOW_BASELINE_REBUILD"):
        sys.exit(
            f"{JOB_DIRS[job]}/ has no snapshots: refusing to rebuild the baseline. "
            "Set ALLOW_BASELINE_REBUILD=1 if this is intentional."
        )
    earlier = [date for date in dates if date < before]
    return earlier[-1] if earlier else None


def official(snapshot: dict | None) -> dict | None:
    """The snapshot without community models, which the community post covers."""
    return snapshot and {
        category: [model for model in models if not model.get("community")]
        for category, models in snapshot.items()
    }


def without_owner_text(snapshot: dict | None) -> dict | None:
    """The snapshot without owner-written text: the community post states catalog facts."""
    return snapshot and {
        category: [
            {key: value for key, value in model.items() if key not in OWNER_TEXT}
            for model in models
        ]
        for category, models in snapshot.items()
    }


def job_input(job: str, date: str, news: Path) -> tuple[str | None, dict]:
    """The summary call's user message (None when there is nothing to write) and what save needs."""
    if job in CATALOG_JOBS:
        current = fetch_all_snapshots(COMMUNITY_CATALOG if job == "community" else None)
        previous_date = previous_snapshot_date(job, news, date)
        print(f"  Previous snapshot: {previous_date or '(none)'}")
        previous = previous_date and _migrate_old_snapshot(
            json.loads(
                (
                    news / JOB_DIRS[job] / "snapshots" / f"{previous_date}.json"
                ).read_text(encoding="utf-8")
            )
        )
        if job == "models":
            diff = diff_models(official(previous), official(current))
        else:
            diff = diff_models(
                without_owner_text(previous), without_owner_text(current)
            )
        user = (
            None
            if diff.is_empty()
            else models_report_input(diff.to_json(), date, previous_date)
        )
        return user, {
            "snapshot": current,
            "diff": diff.to_json(),
            "previous_date": previous_date,
        }
    if job == "monthly":
        summaries = read_daily_summaries(date, news)
        repository = os.environ.get("GITHUB_REPOSITORY", f"{OWNER}/{REPO}")
        counts = month_counts(date, get_env("GITHUB_TOKEN"), repository)
        print(
            f"  {counts['merged_prs']} merged PRs, {len(counts['contributors'])} contributors"
        )
        return (monthly_digest_input(summaries, date) if summaries else None), {
            "inputs": summaries,
            "counts": counts,
        }
    if job == "weekly":
        start, end = period(job, date)
        gists = filter_daily_gists(read_gists_for_week(start, end, news))
        return (weekly_digest_input(gists, start, end) if gists else None), {
            "inputs": gists
        }
    gists = filter_daily_gists(read_gists_for_date(date, news))
    return (daily_summary_input(gists, date) if gists else None), {"inputs": gists}


def write(job: str, date: str, news: Path, work: Path, overwrite: bool = False) -> None:
    """Make the job's model calls and pictures into WORK: raw.json and images/."""
    check(job, date, news, overwrite)
    token = get_env("POLLINATIONS_TOKEN")
    (work / "images").mkdir(parents=True, exist_ok=True)
    (work / "raw.json").unlink(missing_ok=True)
    print(f"Writing {job} {date}")
    summary, *posts = job_posts(job)
    user, kept = job_input(job, date, news)
    raw = {"job": job, "date": date, **kept, "outputs": {}}
    outputs = raw["outputs"]
    if user:
        outputs[summary["name"]] = ask(
            summary, prompt_text(summary["text"]), user, token
        )
        raw["generated_at"] = datetime.now(UTC).isoformat()
        recap = post_recap(outputs[summary["name"]])
        for post in posts:
            output = outputs[post["name"]] = write_post(post, recap, date, token)
            found = pictures(post, output)
            if not found or not all(prompt for _, prompt in found):
                sys.exit(f"{post['name']}: the reply is missing a picture prompt")
        for post in posts:
            for index, (name, prompt) in enumerate(
                pictures(post, outputs[post["name"]])
            ):
                if index:
                    time.sleep(3)
                image, _ = generate_image(prompt, token, IMAGE_SIZE, IMAGE_SIZE, index)
                if not image:
                    sys.exit(f"{post['name']}: picture {name} failed")
                (work / "images" / name).write_bytes(image)
    else:
        print("  Nothing new to write")
    (work / "raw.json").write_bytes(json_file(raw))


def json_file(data) -> bytes:
    return json.dumps(data, indent=2, ensure_ascii=False).encode()


def post_files(raw: dict, work: Path) -> dict[str, bytes]:
    """The summary, each post and its pictures."""
    job, date, outputs = raw["job"], raw["date"], raw["outputs"]
    if not outputs:
        return {}
    summary, *posts = job_posts(job)
    base = f"{JOB_DIRS[job]}/{date}"
    start, end = period(job, date)
    generated_at = raw["generated_at"]
    digest = outputs[summary["name"]]
    if job == "daily":
        artifact = build_daily_summary_artifact(
            digest, raw["inputs"], date, generated_at
        )
    elif job == "weekly":
        artifact = build_weekly_summary_artifact(
            digest, raw["inputs"], date, start, end, generated_at
        )
    else:
        artifact = build_monthly_summary_artifact(
            digest, raw["inputs"], date, generated_at
        )
    files = {f"{base}/summary.json": json_file(artifact)}
    repo = os.environ.get("GITHUB_REPOSITORY", f"{OWNER}/{REPO}")
    for post in posts:
        output = outputs[post["name"]]
        for index, (name, prompt) in enumerate(pictures(post, output)):
            path = f"{base}/images/{name}"
            files[path] = (work / "images" / name).read_bytes()
            url = f"https://raw.githubusercontent.com/{repo}/{GISTS_BRANCH}/{path}"
            if len(post["pictures"]) == 1:
                output["image"] = {"url": url, "prompt": prompt}
            else:
                output["images"][index]["url"] = url
        if "file" not in post:
            continue
        if (
            "max_chars" in post
            and len(build_linkedin_post_text(output)) > post["max_chars"]
        ):
            sys.exit(f"{post['name']}: over {post['max_chars']} characters")
        files[f"{base}/{post['file']}"] = json_file(
            normalize_platform_post(
                platform=post["tone"],
                scope=job,
                date=date,
                period_start=start,
                period_end=end,
                generated_at=generated_at,
                raw_post=output,
            )
        )
    return files


def model_post(raw: dict) -> dict | None:
    """The model or community post's discord.json, or None when nothing changed."""
    job = raw["job"]
    report = raw["outputs"].get(job_posts(job)[0]["name"])
    if not report:
        return None
    # Only the weekly model post mentions the model-news role.
    role_id = os.environ.get("DISCORD_MODELS_ROLE_ID") if job == "models" else None
    return discord_payload(
        report["discord_text"],
        raw["date"],
        raw["previous_date"],
        role_id,
        raw["generated_at"],
        "models_weekly" if job == "models" else "community_daily",
    )


def model_files(raw: dict, news: Path) -> dict[str, bytes]:
    """The /models snapshot and, when something changed, the post, the comparison
    and, for the model post, models.md."""
    job, date = raw["job"], raw["date"]
    folder = JOB_DIRS[job]
    files = {f"{folder}/snapshots/{date}.json": json_file(raw["snapshot"])}
    payload = model_post(raw)
    if payload:
        files[f"{folder}/{date}/discord.json"] = json_file(payload)
        files[f"{folder}/diffs/{date}.json"] = json_file(raw["diff"])
    if payload and job == "models":
        changelog = news / MODELS_NEWS_DIR / "models.md"
        existing = changelog.read_text(encoding="utf-8") if changelog.exists() else ""
        files[f"{MODELS_NEWS_DIR}/models.md"] = models_md(
            existing, raw["outputs"]["model-post"]["models_md_section"]
        ).encode()
    return files


def save(job: str, date: str, news: Path, work: Path, overwrite: bool = False) -> None:
    """Write today's files for WORK into NEWS, all built before any is written."""
    check(job, date, news, overwrite)
    raw = json.loads((work / "raw.json").read_text(encoding="utf-8"))
    if (raw["job"], raw["date"]) != (job, date):
        sys.exit(f"{work} holds {raw['job']} {raw['date']}, not {job} {date}")
    files = model_files(raw, news) if job in CATALOG_JOBS else post_files(raw, work)
    if job == "monthly":  # every month has its counts, even one with nothing to write
        files[f"{MONTHLY_REL_DIR}/{date}/contributors.json"] = json_file(raw["counts"])
    for path, content in files.items():
        (news / path).parent.mkdir(parents=True, exist_ok=True)
        (news / path).write_bytes(content)
        print(f"  Saved {path}")
    if not files:
        print(f"  Nothing to save for {job} {date}")


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Write and save the scheduled news posts."
    )
    parser.add_argument("command", choices=("write", "save"))
    parser.add_argument("job", choices=JOB_DIRS)
    parser.add_argument(
        "date", help="the day, the Sunday, the month (YYYY-MM) or the Wednesday"
    )
    parser.add_argument(
        "--news", type=Path, required=True, help="a checkout of the news branch"
    )
    parser.add_argument(
        "--work",
        type=Path,
        required=True,
        help="where write leaves its output for save",
    )
    parser.add_argument(
        "--overwrite", action="store_true", help="replace a date that is already saved"
    )
    args = parser.parse_args()
    command = write if args.command == "write" else save
    command(args.job, args.date, args.news, args.work, args.overwrite)


if __name__ == "__main__":
    main()
