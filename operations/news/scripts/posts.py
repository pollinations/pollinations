#!/usr/bin/env python3
"""Write and save the scheduled news posts: daily, weekly, monthly, the model post
and the community post.

    python posts.py write JOB DATE --news NEWS --work WORK [--overwrite]
    python posts.py save  JOB DATE --news NEWS --work WORK [--overwrite]

JOB is daily, weekly, monthly, models, community or catalog. DATE is the day, the
Sunday, the month (YYYY-MM) or the Wednesday. NEWS is a checkout of the news branch.
write makes the job's model calls and pictures into WORK; save turns WORK into today's
files under NEWS: data/summaries/<job>/<date>.json and posts/<platform>/<job>/<date>.json.
Neither commits, and save never touches delivery.json. catalog makes no call: write
reads /models, and save records it as data/models/<date>.json when it changed.

Each post is one file, in prompts/summaries/ or prompts/posts/<platform>/: `key: value`
settings between `---` lines (JSON values where they parse), then its text. The job's
post without a tone is its summary: its text is the system prompt, and its output is the
recap the other posts are written from. A post under posts/<platform>/ is saved there.
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
    CONTRIBUTORS_REL_DIR,
    DATA_REL_DIR,
    IMAGE_SIZE,
    MODELS_NEWS_DIR,
    OWNER,
    POSTS_REL_DIR,
    PROMPTS_DIR,
    REPO,
    SUMMARIES_REL_DIR,
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
    generate_image,
    get_env,
    get_week_dates,
    load_prompt,
    models_report_input,
    month_dates,
    monthly_digest_input,
    normalize_platform_post,
    parse_json_response,
    post_recap,
    prompt_text,
    read_daily_summaries,
    weekly_digest_input,
)
from contributors import month_counts
from prs import day_notes

# The weekly posts written from the recorded catalog: official and community models.
CATALOG_JOBS = ("models", "community")
# Every public model, the community ones the reliability filter hides included, so a
# model leaving or rejoining the default list is no news.
FULL_CATALOG = {"reliability": "all"}
# The catalog facts the community post states. Owner-written text (title, publisher,
# description, links) never reaches the writer of a public post; the id names the owner.
CATALOG_FACTS = (
    "name",
    "category",
    "agent",
    "paid_only",
    "pricing",
    "flat_rate",
    "input_modalities",
    "output_modalities",
    "capabilities",
    "tools",
    "reasoning",
    "context_length",
    "base_model",
)
# An agent costs what its base model costs and is paid-only when it is, so the post
# names the base model instead.
BASE_MODEL_FACTS = ("pricing", "flat_rate", "paid_only")
DATES = {
    "daily": "a day (YYYY-MM-DD)",
    "weekly": "a Sunday (YYYY-MM-DD)",
    "monthly": "a month (YYYY-MM)",
    "models": "a day (YYYY-MM-DD)",
    "community": "a day (YYYY-MM-DD)",
    "catalog": "a day (YYYY-MM-DD)",
}


def summary_path(job: str, date: str) -> str:
    return f"{SUMMARIES_REL_DIR}/{job}/{date}.json"


def post_path(platform: str, job: str, date: str) -> str:
    return f"{POSTS_REL_DIR}/{platform}/{job}/{date}.json"


def read_post(path: Path) -> dict:
    _, header, text = path.read_text(encoding="utf-8").split("---\n", 2)
    post = {"name": path.relative_to(PROMPTS_DIR).with_suffix("").as_posix(), "text": text.strip()}
    if path.parent.parent.name == "posts":
        post["platform"] = path.parent.name
    for line in header.splitlines():
        key, _, value = line.partition(":")
        try:
            post[key] = json.loads(value)
        except json.JSONDecodeError:
            post[key] = value.strip()
    return post


def job_posts(job: str) -> list[dict]:
    """The job's posts, its summary first. Files without settings (tone.md, the PR
    note prompt) are system prompts, not posts."""
    paths = sorted([*(PROMPTS_DIR / "summaries").glob("*.md"), *(PROMPTS_DIR / "posts").glob("*/*.md")])
    posts = [read_post(path) for path in paths if path.read_text(encoding="utf-8").startswith("---\n")]
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
    if not (news / DATA_REL_DIR).is_dir():
        sys.exit(f"{news} has no {DATA_REL_DIR}: not a checkout of the converted news branch")
    if job == "catalog" and not overwrite:
        # /models is recorded as it is now, and a recorded day is kept.
        if date != datetime.now(UTC).strftime("%Y-%m-%d"):
            sys.exit(f"catalog {date} is not today: /models is only recorded as it is now")
        if (news / MODELS_NEWS_DIR / f"{date}.json").exists():
            sys.exit(f"catalog {date} is already recorded; pass --overwrite to replace it")
    elif job in CATALOG_JOBS:
        # A saved model or community post is never replaced, even with --overwrite.
        if (news / model_post_path(job, date)).exists():
            post = "model" if job == "models" else job
            sys.exit(f"{job} {date} has a saved {post} post; it is never replaced")
    elif (news / summary_path(job, date)).exists() and not overwrite:
        sys.exit(f"{job} {date} is already saved; pass --overwrite to replace it")


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
    system = load_prompt(f"posts/{post['tone']}/tone")
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
        return [(names[0], output.get("image_prompt"))]
    return [
        (name, image.get("prompt"))
        for name, image in zip(names, output.get("images") or [])
    ]


def snapshot_date(news: Path, until: str) -> str | None:
    """The latest recorded catalog on or before `until`. When models/ exists without any
    snapshot, the record was lost: stop rather than silently start a new one."""
    models = news / MODELS_NEWS_DIR
    dates = sorted(path.stem for path in models.glob("*.json") if path.is_file())
    if models.is_dir() and not dates and not os.environ.get("ALLOW_BASELINE_REBUILD"):
        sys.exit(
            f"{MODELS_NEWS_DIR}/ has no snapshots: refusing to rebuild the baseline. "
            "Set ALLOW_BASELINE_REBUILD=1 if this is intentional."
        )
    earlier = [date for date in dates if date <= until]
    return earlier[-1] if earlier else None


def read_snapshot(news: Path, date: str | None) -> dict | None:
    return date and _migrate_old_snapshot(
        json.loads(
            (news / MODELS_NEWS_DIR / f"{date}.json").read_text(
                encoding="utf-8"
            )
        )
    )


def community_facts(model: dict, names: dict) -> dict:
    """A community model's CATALOG_FACTS; an agent's without what its base model sets.
    An owner types the base model freely, so it stays only as a catalog model's name."""
    dropped = BASE_MODEL_FACTS if model.get("agent") else ()
    facts = {
        key: value
        for key, value in model.items()
        if key in CATALOG_FACTS and key not in dropped
    }
    base = names.get(facts.pop("base_model", None))
    if base:
        facts["base_model"] = base
    return facts


def covered(job: str, snapshot: dict | None) -> dict | None:
    """The models a post covers: the official ones for the model post, the community
    ones' facts for the community post."""
    if not snapshot:
        return snapshot
    if job == "models":
        return {
            category: [model for model in models if not model.get("community")]
            for category, models in snapshot.items()
        }
    names = {
        alias: model["name"]
        for models in snapshot.values()
        for model in models
        for alias in (model["name"], *(model.get("aliases") or ()))
    }
    return {
        category: [
            community_facts(model, names) for model in models if model.get("community")
        ]
        for category, models in snapshot.items()
    }


def daily_notes(notes: list[dict]) -> list[dict]:
    """The PRs the writer chose for the daily post."""
    return [note for note in notes if note["publish_tier"] == "daily"]


def changelog(notes: list[dict]) -> list[dict]:
    """What Enter's Changelog reads from the day's PRs: API changes and announced retirements."""
    keys = ("pr_number", "url", "merged_at", "api_changes", "announcements")
    return [
        {key: note[key] for key in keys if key in note}
        for note in notes
        if note.get("api_changes") or note.get("announcements")
    ]


def job_input(job: str, date: str, news: Path) -> tuple[str | None, dict]:
    """The summary call's user message (None when there is nothing to write) and what save needs."""
    if job in CATALOG_JOBS:
        # The catalog recorded on this day compared with the one a week earlier.
        week_before = datetime.strptime(date, "%Y-%m-%d") - timedelta(days=7)
        previous_date = snapshot_date(news, week_before.strftime("%Y-%m-%d"))
        current_date = snapshot_date(news, date)
        print(f"  Snapshots: {previous_date or '(none)'} to {current_date or '(none)'}")
        diff = diff_models(
            covered(job, read_snapshot(news, previous_date)),
            covered(job, read_snapshot(news, current_date)),
        )
        user = (
            None
            if diff.is_empty()
            else models_report_input(diff.to_json(), date, previous_date)
        )
        return user, {"diff": diff.to_json(), "previous_date": previous_date}
    if job == "monthly":
        summaries = read_daily_summaries(*month_dates(date), news)
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
        # The week's daily summaries, as the monthly reads the month's.
        start, end = period(job, date)
        summaries = read_daily_summaries(start, end, news)
        return (weekly_digest_input(summaries, start, end) if summaries else None), {
            "inputs": summaries
        }
    # The day's merged PRs from GitHub, each read from its diff; nothing of that reading
    # is saved but Enter's changelog. Announced retirements are checked against the
    # models recorded that day.
    repository = os.environ.get("GITHUB_REPOSITORY", f"{OWNER}/{REPO}")
    snapshot = read_snapshot(news, snapshot_date(news, date)) or {}
    catalog = [model for models in snapshot.values() for model in models]
    notes = day_notes(
        date, get_env("POLLINATIONS_TOKEN"), get_env("GITHUB_TOKEN"), repository, catalog
    )
    selected = daily_notes(notes)
    return (daily_summary_input(selected, date) if selected else None), {
        "inputs": selected,
        "changelog": changelog(notes),
    }


def write(job: str, date: str, news: Path, work: Path, overwrite: bool = False) -> None:
    """Make the job's model calls and pictures into WORK: raw.json and images/."""
    check(job, date, news, overwrite)
    token = get_env("POLLINATIONS_TOKEN")
    (work / "images").mkdir(parents=True, exist_ok=True)
    (work / "raw.json").unlink(missing_ok=True)
    print(f"Writing {job} {date}")
    if job == "catalog":
        raw = {"job": job, "date": date, "snapshot": fetch_all_snapshots(FULL_CATALOG)}
        (work / "raw.json").write_bytes(json_file(raw))
        return
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
                image, url = generate_image(prompt, token, IMAGE_SIZE, IMAGE_SIZE, index)
                if not image:
                    sys.exit(f"{post['name']}: picture {name} failed")
                (work / "images" / name).write_bytes(image)  # for a preview to show
                raw.setdefault("pictures", {})[name] = url
    else:
        print("  Nothing new to write")
    (work / "raw.json").write_bytes(json_file(raw))


def json_file(data) -> bytes:
    return json.dumps(data, indent=2, ensure_ascii=False).encode()


def post_files(raw: dict) -> dict[str, bytes]:
    """The summary, each post and its pictures."""
    job, date, outputs = raw["job"], raw["date"], raw["outputs"]
    if not outputs:
        # A day without posts still keeps what Enter's Changelog reads.
        entries = raw.get("changelog")
        return {summary_path(job, date): json_file({"date": date, "changelog": entries})} if entries else {}
    summary, *posts = job_posts(job)
    start, end = period(job, date)
    generated_at = raw["generated_at"]
    digest = outputs[summary["name"]]
    if job == "daily":
        artifact = build_daily_summary_artifact(
            digest, raw["inputs"], date, generated_at
        )
        artifact["changelog"] = raw["changelog"]
    elif job == "weekly":
        artifact = build_weekly_summary_artifact(
            digest, raw["inputs"], date, start, end, generated_at
        )
    else:
        artifact = build_monthly_summary_artifact(
            digest, raw["inputs"], date, generated_at
        )
    files = {summary_path(job, date): json_file(artifact)}
    for post in posts:
        output = outputs[post["name"]]
        for index, (name, prompt) in enumerate(pictures(post, output)):
            picture = {"url": raw["pictures"][name], "prompt": prompt}
            if len(post["pictures"]) == 1:
                output["image"] = picture
            else:
                output["images"][index].update(picture)
        if (
            "max_chars" in post
            and len(build_linkedin_post_text(output)) > post["max_chars"]
        ):
            sys.exit(f"{post['name']}: over {post['max_chars']} characters")
        files[post_path(post["platform"], job, date)] = json_file(
            normalize_platform_post(
                platform=post["platform"],
                scope=job,
                date=date,
                period_start=start,
                period_end=end,
                generated_at=generated_at,
                raw_post=output,
            )
        )
    return files


def model_post_path(job: str, date: str) -> str:
    """Where the model or community post is saved once sent."""
    return post_path(job_posts(job)[0]["platform"], job, date)


def model_post(raw: dict) -> dict | None:
    """The model or community post as sent to Discord, or None when nothing changed."""
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
        "models_weekly" if job == "models" else "community_weekly",
    )


def model_files(raw: dict) -> dict[str, bytes]:
    """The model or community post, when something changed."""
    payload = model_post(raw)
    return {model_post_path(raw["job"], raw["date"]): json_file(payload)} if payload else {}


def catalog_files(raw: dict, news: Path, overwrite: bool = False) -> dict[str, bytes]:
    """The day's snapshot, when the catalog differs from the latest recorded one."""
    date, current = raw["date"], raw["snapshot"]
    latest = snapshot_date(news, date)
    recorded = read_snapshot(news, latest)
    # A category the record didn't have yet is a change too: the comparison skips it.
    unchanged = recorded and set(recorded) == set(current)
    if unchanged and diff_models(recorded, current).is_empty():
        print(f"  The catalog is unchanged since {latest}")
        return {}
    # A half-empty answer from /models would be announced as mass retirements. Only official
    # models count: community owners list and remove many at once.
    def official(models):
        return [model for model in models or [] if not model.get("community")]
    shrunk = [category for category, models in (recorded or {}).items()
              if len(official(current.get(category))) < len(official(models)) / 2]
    if shrunk and not overwrite:
        sys.exit(f"catalog {date}: {', '.join(shrunk)} lost more than half its models since {latest}; "
                 "check /models, and record it with --overwrite if the removals are real")
    return {f"{MODELS_NEWS_DIR}/{date}.json": json_file(current)}


def save(job: str, date: str, news: Path, work: Path, overwrite: bool = False) -> None:
    """Write today's files for WORK into NEWS, all built before any is written."""
    check(job, date, news, overwrite)
    raw = json.loads((work / "raw.json").read_text(encoding="utf-8"))
    if (raw["job"], raw["date"]) != (job, date):
        sys.exit(f"{work} holds {raw['job']} {raw['date']}, not {job} {date}")
    if job == "catalog":
        files = catalog_files(raw, news, overwrite)
    elif job in CATALOG_JOBS:
        files = model_files(raw)
    else:
        files = post_files(raw)
    if job == "monthly":  # every month has its counts, even one with nothing to write
        files[f"{CONTRIBUTORS_REL_DIR}/{date}.json"] = json_file(raw["counts"])
    if job in ("daily", "weekly", "monthly"):
        # An overwrite that writes less (a day that became quiet) must not leave the old summary
        # or posts behind: Enter would show them and deliver.py would send them. delivery.json is kept.
        for stale in [summary_path(job, date), *(post_path(post["platform"], job, date) for post in job_posts(job)[1:])]:
            if stale not in files and (news / stale).exists():
                (news / stale).unlink()
                print(f"  Removed {stale}")
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
    parser.add_argument("job", choices=DATES)
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
