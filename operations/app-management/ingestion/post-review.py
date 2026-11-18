#!/usr/bin/env python3
"""Post the review agent's verdict on an app submission issue."""

import json
import os
import re
import sys

import requests

ISSUE_NUMBER = os.environ.get("ISSUE_NUMBER", "")
GH_TOKEN = os.environ.get("GH_TOKEN", "")
GH_BOT_ID = os.environ.get("GH_BOT_ID", "")
VALIDATION_RESULT = os.environ.get("VALIDATION_RESULT", "{}")
REVIEW_RESULT = os.environ.get("REVIEW_RESULT", "")

REPO = "pollinations/pollinations"
COMMENT_MARKER = "<!-- APP_PRE_REVIEW -->"
BADGE_SNIPPET = (
    "```markdown\n"
    "[![Made with pollinations.ai](https://raw.githubusercontent.com/pollinations/pollinations/main/packages/ui/src/brand/badge-made-with.svg)](https://pollinations.ai/?ref=badge)\n"
    "```"
)


def github_api(path, method="GET", payload=None):
    response = requests.request(
        method,
        f"https://api.github.com{path}",
        headers={
            "Authorization": f"Bearer {GH_TOKEN}",
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
        },
        json=payload,
        timeout=20,
    )
    response.raise_for_status()
    return response.json() if response.content else None


def parse_review(text):
    # The agent's last message should be the JSON verdict; take the outermost object.
    match = re.search(r"\{[\s\S]*\}", text)
    if not match:
        raise ValueError("review agent did not return JSON")
    review = json.loads(match.group(0))
    if not isinstance(review, dict) or review.get("status") not in ("ready", "needs_info"):
        raise ValueError("review agent returned an invalid status")
    return review


def sanitize_ai_lines(value, max_lines=4, max_line_length=240):
    lines = []
    for raw_line in str(value or "").splitlines():
        line = re.sub(r"^\s*[-*#>•]+\s*", "", raw_line).strip()
        line = re.sub(r"https?://\S+", "[link omitted]", line)
        line = line.replace("@", "@​").replace("<", "").replace(">", "")
        line = re.sub(r"[\x00-\x1f]", " ", line).strip()
        if line:
            lines.append(line[:max_line_length])
        if len(lines) == max_lines:
            break
    return lines


def get_issue_author():
    try:
        data = json.loads(VALIDATION_RESULT)
    except (TypeError, ValueError):
        return ""
    username = (data.get("metadata") or {}).get("githubUsername", "")
    if not re.fullmatch(r"[A-Za-z0-9-]+", username or ""):
        return ""
    return username


def github_api_all(path):
    items = []
    page = 1
    while True:
        separator = "&" if "?" in path else "?"
        batch = github_api(f"{path}{separator}per_page=100&page={page}")
        items.extend(batch)
        if len(batch) < 100:
            return items
        page += 1


def replace_review_comment(body):
    comments = github_api_all(f"/repos/{REPO}/issues/{ISSUE_NUMBER}/comments")
    existing = next(
        (
            comment
            for comment in reversed(comments)
            if COMMENT_MARKER in comment.get("body", "")
            and str(comment["user"]["id"]) == GH_BOT_ID
        ),
        None,
    )
    if existing:
        github_api(f"/repos/{REPO}/issues/comments/{existing['id']}", "PATCH", {"body": body})
    else:
        github_api(f"/repos/{REPO}/issues/{ISSUE_NUMBER}/comments", "POST", {"body": body})


def set_status_label(label=None):
    for old_label in ("APP-NEEDS-INFO", "APP-REVIEW"):
        try:
            github_api(
                f"/repos/{REPO}/issues/{ISSUE_NUMBER}/labels/{old_label}",
                "DELETE",
            )
        except requests.HTTPError as error:
            if error.response.status_code != 404:
                raise
    if label:
        github_api(
            f"/repos/{REPO}/issues/{ISSUE_NUMBER}/labels",
            "POST",
            {"labels": [label]},
        )


def main():
    if not all((ISSUE_NUMBER.isdigit(), GH_TOKEN, GH_BOT_ID.isdigit())):
        raise ValueError("ISSUE_NUMBER, GH_TOKEN and numeric GH_BOT_ID are required")
    validation = json.loads(VALIDATION_RESULT)
    set_status_label()
    if validation.get("system_error"):
        raise RuntimeError(validation["system_error"])

    issue_author = get_issue_author()
    mention = f"@{issue_author} " if issue_author else ""

    if not validation.get("valid"):
        errors = validation.get("errors") or ["The submission form is incomplete."]
        bullets = "\n".join(f"- {error}" for error in errors)
        replace_review_comment(
            f"{COMMENT_MARKER}\n## App pre-review: more information needed\n\n{mention}{bullets}\n\nEdit the issue with the missing information; the pre-review will run again."
        )
        set_status_label("APP-NEEDS-INFO")
        return

    review = parse_review(REVIEW_RESULT)
    summary_lines = sanitize_ai_lines(review.get("summary")) or [
        "Automated checks completed."
    ]
    summary = "\n".join(f"- {line}" for line in summary_lines)
    raw_questions = review.get("questions")
    if not isinstance(raw_questions, list):
        raw_questions = []
    questions = []
    for item in raw_questions:
        questions.extend(sanitize_ai_lines(item, max_lines=1, max_line_length=200))
    questions = questions[:4]
    if review["status"] == "ready":
        body = (
            f"{COMMENT_MARKER}\n## App pre-review: ready for human review\n\n{mention}{summary}\n\n"
            "A maintainer can verify the app, confirm the badge or pollinations.ai link is visible, and add `APP-APPROVED` to publish it."
        )
        label = "APP-REVIEW"
    else:
        if not questions:
            questions = [
                "Please provide clearer evidence that the live app uses Pollinations."
            ]
        question_text = "\n".join(f"- {question}" for question in questions)
        if review.get("credit_found") is not True:
            question_text += f"\n\nBadge snippet:\n\n{BADGE_SNIPPET}"
        body = (
            f"{COMMENT_MARKER}\n## App pre-review: more information needed\n\n{mention}{summary}\n\n"
            f"{question_text}\n\nEdit the issue with the requested information; the pre-review will run again."
        )
        label = "APP-NEEDS-INFO"
    replace_review_comment(body)
    set_status_label(label)


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(f"App pre-review failed: {error}", file=sys.stderr)
        try:
            failure_mention = get_issue_author()
            failure_mention = f"@{failure_mention} " if failure_mention else ""
            replace_review_comment(
                f"{COMMENT_MARKER}\n## App pre-review unavailable\n\n{failure_mention}The automated check could not finish. A maintainer can rerun the workflow; no submitter action is required yet."
            )
        except Exception as comment_error:
            print(f"Could not post failure status: {comment_error}", file=sys.stderr)
        sys.exit(1)
