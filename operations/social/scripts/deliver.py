#!/usr/bin/env python3
"""Deliver the saved news posts: Buffer posts scheduled at today's slots, Discord sends.

    python deliver.py schedule JOB DATE                 # Buffer: X, LinkedIn, Instagram
    python deliver.py send     JOB DATE [--work WORK]   # Discord; WORK for models and community
    python deliver.py mark     JOB DATE PLATFORM done|failed
    python deliver.py mark     prs MONTH PR done|failed       # a deploy post: its merge month and number

Each posts/<platform>/<job>/ folder on the news branch has a delivery.json with one
entry per post, keyed by its file name.
The entry is set to "attempt" before a call and to the result after, always written
with the file's sha, so two runs can't both send a post and a repeated run skips
what went out. An "attempt" left behind means the result is unknown: that post
waits for a person to check the channel and run mark.
"""

import argparse
import base64
import hashlib
import json
import os
import sys
import time
from datetime import UTC, datetime, timedelta
from pathlib import Path

import requests
from common import (
    DISCORD_CHUNK_SIZE,
    NEWS_BRANCH,
    GITHUB_API_BASE,
    LINKEDIN_MAX_CHARS,
    NEWS_REL_DIR,
    OWNER,
    POSTS_REL_DIR,
    REPO,
    _github_headers,
    chunk_message,
    get_env,
    get_post_image_urls,
    safe_truncate,
)
from posts import CATALOG_JOBS, check_date, job_posts, model_post, post_path, summary_path

# The first date each job is delivered here; older folders went out with the old senders.
START = {
    "daily": "2026-10-12",
    "weekly": "2026-10-18",
    "models": "2026-10-14",
    "community": "2026-10-21",
}
# The channel today's lookup picks: the first listed of each service in Buffer.
BUFFER_CHANNELS = {
    "x": "695fe0e5457dae6a34edc9a5",  # pollinations_ai
    "linkedin": "695fe487457dae6a34ede497",  # pollinations.ai
    "instagram": "695fccbf457dae6a34ed79b4",  # pollinations_ai
}
BUFFER_URL = "https://api.buffer.com"

# Buffer slots, as today: the next of these weekdays (1 = Monday) at this UTC hour,
# at least 10 minutes away.
SLOTS = {
    "x": ((1, 2, 3, 4, 5, 6), 15),
    "linkedin": ((7,), 18),
    "instagram": ((7,), 18),
}
# Text limits, as today: X and Instagram are cut with "...", LinkedIn is refused.
LIMITS = {"x": 280, "instagram": 2200, "linkedin": LINKEDIN_MAX_CHARS}

CREATE_POST = """mutation CreatePost($input: CreatePostInput!) {
  createPost(input: $input) {
    __typename
    ... on PostActionSuccess { post { id dueAt } }
    ... on MutationError { message }
  }
}"""
# Buffer answers that mean nothing was created.
NOT_CREATED = {
    "InvalidInputError",
    "LimitReachedError",
    "NotFoundError",
    "UnauthorizedError",
}
REFUSED = {"UNAUTHORIZED", "UNAUTHENTICATED", "FORBIDDEN", "RATE_LIMIT_EXCEEDED"}

RUN = "{}-{}-{}".format(
    os.environ.get("GITHUB_RUN_ID", "local"),
    os.environ.get("GITHUB_RUN_ATTEMPT", "1"),
    os.environ.get("GITHUB_JOB", "deliver"),
)


def now() -> str:
    return datetime.now(UTC).isoformat()


# ── The record on the news branch ────────────────────────────────────


def github(method: str, path: str, **kwargs) -> requests.Response:
    repo = os.environ.get("GITHUB_REPOSITORY", f"{OWNER}/{REPO}")
    url = f"{GITHUB_API_BASE}/repos/{repo}/contents/{path}"
    headers = _github_headers(get_env("GITHUB_TOKEN"))
    return requests.request(method, url, headers=headers, timeout=30, **kwargs)


def read_news(path: str) -> tuple[bytes | None, str | None]:
    """A file on the news branch and its sha, or (None, None) when there is none."""
    resp = github("GET", path, params={"ref": NEWS_BRANCH})
    if resp.status_code == 404:
        return None, None
    if resp.status_code != 200:
        sys.exit(f"Reading {path} from {NEWS_BRANCH}: HTTP {resp.status_code}")
    body = resp.json()
    return base64.b64decode(body["content"]), body["sha"]


def read_record(folder: str) -> tuple[dict, str | None]:
    content, sha = read_news(f"{folder}/delivery.json")
    return (json.loads(content) if content else {}), sha


def write_record(
    folder: str,
    post: str,
    entry: dict,
    record: dict,
    sha: str | None,
    overwrite: bool = False,
) -> str:
    """Put entry into the record that was read, only if nobody changed it since.

    A 409, 422, 5xx or timeout doesn't say whether the write happened, so the file is
    read again. Returns "landed", "changed" (another writer changed this post, and
    overwrite is off) or "gave up".
    """
    for _ in range(3):
        before = record.get(post)
        body = {
            "message": f"news: {entry['state']} {folder.removeprefix(NEWS_REL_DIR + '/')}/{post}",
            "content": base64.b64encode(
                json.dumps({**record, post: entry}, indent=2).encode()
            ).decode(),
            "branch": NEWS_BRANCH,
            **({"sha": sha} if sha else {}),
        }
        try:
            if github("PUT", f"{folder}/delivery.json", json=body).status_code < 300:
                return "landed"
        except requests.RequestException:
            pass
        record, sha = read_record(folder)
        if record.get(post) == entry:
            return "landed"
        if record.get(post) != before and not overwrite:
            return "changed"
    return "gave up"


def deliver(folder: str, post: str, prepare, **extra) -> str:
    """Check, claim and send the post, and record what happened. Returns its outcome.

    prepare checks the post and returns the call that sends it, or raises ValueError
    when it can't be sent.
    """
    record, sha = read_record(folder)
    state = (record.get(post) or {}).get("state")
    if state == "done":
        return "already done"
    if state == "attempt":
        return "stuck"
    try:
        send = prepare()
    except ValueError as error:
        print(f"  {post}: {error}")
        return "failed"
    claim = {"state": "attempt", "run": RUN, "at": now(), **extra}
    claimed = write_record(folder, post, claim, record, sha)
    if claimed != "landed":
        return "skipped" if claimed == "changed" else "failed"
    try:
        state, detail = send()
    except Exception as error:  # noqa: BLE001 - a send that raised may have gone out
        state, detail = "attempt", {"error": str(error)[:300]}
    record, sha = read_record(folder)
    result = {"state": state, "run": RUN, "at": now(), **extra, **detail}
    # What happened replaces whatever is there, a person's mark during the send included.
    if (
        write_record(folder, post, result, record, sha, overwrite=True) != "landed"
        or state == "attempt"
    ):
        return "stuck"
    return state


# ── Buffer ───────────────────────────────────────────────────────────


def next_slot(channel: str, after: datetime) -> str:
    days, hour = SLOTS[channel]
    first = after.replace(hour=hour, minute=0, second=0, microsecond=0)
    for slot in (first + timedelta(days=ahead) for ahead in range(8)):
        if slot.isoweekday() in days and slot > after + timedelta(minutes=10):
            return slot.strftime("%Y-%m-%dT%H:%M:%SZ")
    raise ValueError(f"no {channel} slot")


def pictures_load(urls: list[str]) -> bool:
    """Wait for the pictures to be served, as today: up to six tries, 10 s apart."""
    for attempt in range(6):
        if attempt:
            time.sleep(10)
        try:
            if all(
                requests.head(url, timeout=10, allow_redirects=True).status_code == 200
                for url in urls
            ):
                return True
        except requests.RequestException:
            pass
    return False


def buffer_post(channel: str, post: dict):
    """Check the post and build its Buffer request; returns the call that schedules it."""
    if not BUFFER_CHANNELS[channel]:
        raise ValueError(f"no Buffer channel id for {channel}")
    token = get_env("BUFFER_ACCESS_TOKEN")
    text = (post.get("text") or "").strip()
    if not text:
        raise ValueError("the post has no text")
    if len(text) > LIMITS[channel]:
        if channel == "linkedin":
            raise ValueError(f"{len(text)} characters, over {LIMITS[channel]}")
        text = text[: LIMITS[channel] - 3] + "..."
    pictures = get_post_image_urls(post)
    pictures = pictures if channel == "instagram" else pictures[:1]
    if not pictures_load(pictures):
        print("  Warning: its pictures don't load")  # as today, it is scheduled anyway
    post_input = {
        "channelId": BUFFER_CHANNELS[channel],
        "text": text,
        "schedulingType": "automatic",
        "mode": "customScheduled",
        "dueAt": next_slot(channel, datetime.now(UTC)),
    }
    if pictures:
        post_input["assets"] = [{"image": {"url": url}} for url in pictures]
    if channel == "instagram":
        post_input["metadata"] = {
            "instagram": {"type": "post", "shouldShareToFeed": True}
        }
    return lambda: create_buffer_post(post_input, token)


def create_buffer_post(post_input: dict, token: str) -> tuple[str, dict]:
    """One createPost: done, failed (nothing was created) or attempt (unknown)."""
    try:
        resp = requests.post(
            BUFFER_URL,
            headers={
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/json",
            },
            json={"query": CREATE_POST, "variables": {"input": post_input}},
            timeout=60,
        )
        body = resp.json()
    except requests.ConnectTimeout:
        return "failed", {"error": "connect timeout"}
    result = (body.get("data") or {}).get("createPost") or {}
    if result.get("__typename") == "PostActionSuccess":
        return "done", {"buffer": result["post"]}
    codes = {
        error.get("extensions", {}).get("code") for error in body.get("errors") or []
    }
    error = {"error": result.get("message") or str(body.get("errors"))[:300]}
    print(f"  Buffer: {error['error']}")
    if (
        resp.status_code in (401, 403, 429)
        or result.get("__typename") in NOT_CREATED
        or (not result and codes and codes <= REFUSED)
    ):
        return "failed", error
    return "attempt", error


# ── Discord ──────────────────────────────────────────────────────────


def send_discord(webhook: str, payloads: list[dict], picture: bytes | None = None):
    """Post each message once: done, failed (nothing was posted) or attempt (unknown)."""
    url = (
        webhook
        if "wait=" in webhook
        else webhook + ("&" if "?" in webhook else "?") + "wait=true"
    )
    ids = []
    for index, payload in enumerate(payloads):
        if index:
            time.sleep(1)
        try:
            if index == 0 and picture:
                files = {
                    "payload_json": (None, json.dumps(payload), "application/json"),
                    "files[0]": ("image.jpg", picture, "image/jpeg"),
                }
                resp = requests.post(url, files=files, timeout=30)
            else:
                resp = requests.post(url, json=payload, timeout=30)
            message_id = resp.json().get("id") if resp.status_code < 300 else None
        except requests.ConnectTimeout:
            return ("attempt" if ids else "failed"), {"discord": ids}
        except (requests.RequestException, ValueError):
            return "attempt", {"discord": ids}
        if message_id:
            ids.append(message_id)
            continue
        print(f"  Discord: HTTP {resp.status_code} {resp.text[:200]}")
        return ("failed" if 400 <= resp.status_code < 500 and not ids else "attempt"), {
            "discord": ids
        }
    return "done", {"discord": ids}


def download(url: str) -> bytes | None:
    """A picture's bytes; as today, the post goes without it when it can't be fetched."""
    try:
        resp = requests.get(url, timeout=30)
    except requests.RequestException:
        return None
    return (
        resp.content
        if resp.status_code == 200 and "image" in resp.headers.get("content-type", "")
        else None
    )


def weekly_discord(post: dict):
    text = (post.get("text") or "").strip()
    if not text:
        raise ValueError("the post has no text")
    webhook = get_env("DISCORD_WEEKLY_WEBHOOK_URL")
    pictures = get_post_image_urls(post)
    picture = download(pictures[0]) if pictures else None
    payloads = [{"content": chunk} for chunk in chunk_message(text)]
    return lambda: send_discord(webhook, payloads, picture)


# ── Commands ─────────────────────────────────────────────────────────


def platforms(job: str) -> list[str]:
    """The platforms a job posts to: its prompts under prompts/posts/<platform>/."""
    return [post["platform"] for post in job_posts(job) if "platform" in post]


def record_of(platform: str, job: str, date: str) -> tuple[str, str]:
    """The folder whose delivery.json records this post, and the post's key in it."""
    folder, _, key = post_path(platform, job, date).rpartition("/")
    return folder, key


def run(command: str, job: str, date: str, work: Path | None = None) -> None:
    check_date(job, date)
    if not START[job] or date < START[job]:
        sys.exit(
            f"{job} {date} is before deliver.py's start date ({START[job]}); the old senders deliver it"
        )
    channels = SLOTS if command == "schedule" else ("discord",)
    targets = [channel for channel in channels if channel in platforms(job)]
    # As today, the daily folder dated Saturday is written on Sunday and never delivered.
    if (
        not targets
        or job == "daily"
        and datetime.strptime(date, "%Y-%m-%d").isoweekday() == 6
    ):
        print(f"Nothing to {command} for {job} {date}")
        return

    if job in CATALOG_JOBS:
        if work is None:
            sys.exit(f"send {job} needs --work, the folder posts.py wrote")
        raw = json.loads((work / "raw.json").read_text(encoding="utf-8"))
        if (raw["job"], raw["date"]) != (job, date):
            sys.exit(f"{work} holds {raw['job']} {raw['date']}, not {job} {date}")
        payload = model_post(raw)
        if not payload:
            print(f"No {job} changes for {date}: nothing to send")
            return
        text = payload["text"].strip()
        digest = hashlib.sha256(text.encode()).hexdigest()
        webhook = get_env("DISCORD_MODELS_WEBHOOK_URL")
        # Only the model post mentions its role; community text never pings anyone.
        message = {
            "content": safe_truncate(text, DISCORD_CHUNK_SIZE),
            "allowed_mentions": {"parse": ["roles"] if job == "models" else []},
        }

        def prepare():
            return lambda: send_discord(webhook, [message])

        folder, key = record_of("discord", job, date)
        outcome = deliver(folder, key, prepare, text_sha256=digest)
        # save stores this WORK's post, so it must be the text that went out.
        entry = read_record(folder)[0].get(key) or {}
        if outcome not in ("failed", "stuck") and (
            entry.get("state"),
            entry.get("text_sha256"),
        ) != ("done", digest):
            sys.exit(f"{job} {date} isn't recorded as sent with this WORK's text")
        outcomes = {"discord": outcome}
    else:
        # A date counts as empty only when it has no post and no summary text (a quiet
        # day keeps only Enter's changelog); a saved post is delivered even without its
        # summary, and an expected post that is missing fails.
        files = {platform: read_news(post_path(platform, job, date))[0] for platform in platforms(job)}
        summary = read_news(summary_path(job, date))[0]
        if not (summary and json.loads(summary).get("summary")) and not any(files.values()):
            print(f"Nothing saved for {job} {date}: nothing to deliver")
            return
        outcomes = {}
        for channel in targets:

            def prepare(channel=channel):
                content = files[channel]
                if content is None:
                    raise ValueError("the post file is missing")
                data = json.loads(content)
                if channel == "discord":
                    return weekly_discord(data)
                return buffer_post(channel, data)

            outcomes[channel] = deliver(*record_of(channel, job, date), prepare)

    for post, outcome in outcomes.items():
        print(f"  {job} {date} {post}: {outcome}")
    problems = [
        post for post, outcome in outcomes.items() if outcome in ("failed", "stuck")
    ]
    if problems:
        sys.exit(
            f"Not delivered: {', '.join(problems)}. A stuck post may have gone out: "
            f"check its channel, then run `deliver.py mark {job} {date} PLATFORM done|failed`."
        )


def mark(job: str, date: str, platform: str, state: str) -> None:
    """A person settles a post: done when they found it, failed to have it sent again.
    For a deploy post, job is prs, date its PR's merge month and platform the PR number."""
    if job == "prs":
        check_date("monthly", date)
        folder, post = f"{POSTS_REL_DIR}/discord/prs/{date}", f"pr-{platform}"
    else:
        check_date(job, date)
        if platform not in platforms(job):
            sys.exit(f"{job} has no {platform} post")
        folder, post = record_of(platform, job, date)
    record, sha = read_record(folder)
    print(f"Replacing {record.get(post)}")
    sent = (record.get(post) or {}).get("discord")
    if state == "failed" and sent:
        sys.exit(
            f"Discord messages {sent} went out: post the rest by hand, then mark done"
        )
    entry = {
        **(record.get(post) or {}),
        "state": state,
        "run": RUN,
        "at": now(),
        "marked": True,
    }
    if write_record(folder, post, entry, record, sha) != "landed":
        sys.exit("The record changed meanwhile; run mark again")


def main() -> None:
    parser = argparse.ArgumentParser(description="Deliver the saved news posts.")
    commands = parser.add_subparsers(dest="command", required=True)
    for name in ("schedule", "send"):
        command = commands.add_parser(name)
        command.add_argument("job", choices=START)
        command.add_argument("date")
        command.add_argument(
            "--work", type=Path, help="the folder posts.py wrote (models, community)"
        )
    command = commands.add_parser("mark")
    command.add_argument("job", choices=(*START, "prs"))
    command.add_argument("date", help="the day, the Sunday, or for prs the merge month (YYYY-MM)")
    command.add_argument("platform", help="the platform, or for prs the PR number")
    command.add_argument("state", choices=("done", "failed"))
    args = parser.parse_args()
    if args.command == "mark":
        mark(args.job, args.date, args.platform, args.state)
    else:
        run(args.command, args.job, args.date, args.work)


if __name__ == "__main__":
    main()
