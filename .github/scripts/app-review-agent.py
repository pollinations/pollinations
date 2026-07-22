#!/usr/bin/env python3
"""Evidence-based pre-review for community app submissions."""

import ipaddress
import json
import os
import re
import socket
import sys
from html import unescape
from urllib.parse import urljoin, urlparse

import requests

ISSUE_NUMBER = os.environ.get("ISSUE_NUMBER", "")
GH_TOKEN = os.environ.get("GH_TOKEN", "")
GH_BOT_LOGIN = os.environ.get("GH_BOT_LOGIN", "")
POLLINATIONS_API_KEY = os.environ.get("POLLINATIONS_API_KEY", "")
VALIDATION_RESULT = os.environ.get("VALIDATION_RESULT", "{}")

REPO = "pollinations/pollinations"
MODEL = "openai-large"
POLLINATIONS_API = "https://gen.pollinations.ai/v1/chat/completions"
COMMENT_MARKER = "<!-- APP_PRE_REVIEW -->"
POLLINATIONS_MARKERS = (
    "pollinations.ai",
    "gen.pollinations.ai",
    "image.pollinations.ai",
    "text.pollinations.ai",
    "@pollinations/sdk",
)

session = requests.Session()
session.headers.update({"User-Agent": "pollinations-app-review/1.0"})


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


def ensure_public_url(raw_url):
    parsed = urlparse(raw_url)
    if parsed.scheme not in ("http", "https") or not parsed.hostname:
        raise ValueError("not a valid HTTP(S) URL")
    if parsed.username or parsed.password:
        raise ValueError("URLs with credentials are not allowed")
    try:
        default_port = 443 if parsed.scheme == "https" else 80
        addresses = socket.getaddrinfo(parsed.hostname, parsed.port or default_port)
    except socket.gaierror as error:
        raise ValueError("hostname does not resolve") from error
    for address in addresses:
        ip = ipaddress.ip_address(address[4][0])
        if not ip.is_global:
            raise ValueError("URL resolves to a private or reserved address")
    return raw_url


def fetch_public_text(raw_url, max_bytes=600_000):
    url = raw_url
    for _ in range(5):
        ensure_public_url(url)
        response = session.get(url, allow_redirects=False, stream=True, timeout=15)
        if response.is_redirect or response.is_permanent_redirect:
            location = response.headers.get("location")
            if not location:
                raise ValueError("redirect has no destination")
            url = urljoin(url, location)
            continue
        response.raise_for_status()
        content_type = response.headers.get("content-type", "").lower()
        if not any(value in content_type for value in ("text/", "javascript", "json")):
            raise ValueError(f"unsupported content type: {content_type or 'unknown'}")
        content = bytearray()
        for chunk in response.iter_content(16_384):
            content.extend(chunk)
            if len(content) > max_bytes:
                raise ValueError("response is too large to inspect safely")
        return url, content.decode(response.encoding or "utf-8", errors="replace")
    raise ValueError("too many redirects")


def marker_hits(text):
    lowered = text.lower()
    return sorted({marker for marker in POLLINATIONS_MARKERS if marker in lowered})


def inspect_app(app_url):
    final_url, html = fetch_public_text(app_url)
    evidence = {
        "reachable": True,
        "final_url": final_url,
        "title": "",
        "pollinations_markers": marker_hits(html),
        "scripts_checked": 0,
        "errors": [],
    }
    title = re.search(r"<title[^>]*>(.*?)</title>", html, re.I | re.S)
    if title:
        evidence["title"] = re.sub(r"\s+", " ", unescape(title.group(1))).strip()[:160]

    origin = urlparse(final_url)
    script_urls = re.findall(r"<script[^>]+src=[\"']([^\"']+)", html, re.I)
    for source in script_urls[:3]:
        script_url = urljoin(final_url, unescape(source))
        parsed = urlparse(script_url)
        if (parsed.scheme, parsed.hostname, parsed.port) != (
            origin.scheme,
            origin.hostname,
            origin.port,
        ):
            continue
        try:
            _, script = fetch_public_text(script_url, max_bytes=250_000)
            evidence["scripts_checked"] += 1
            evidence["pollinations_markers"] = sorted(
                set(evidence["pollinations_markers"] + marker_hits(script))
            )
        except (requests.RequestException, ValueError) as error:
            evidence["errors"].append(f"script inspection: {error}")
    return evidence


def parse_github_repo(repo_url):
    parsed = urlparse(repo_url)
    if parsed.hostname != "github.com":
        return None
    parts = [part for part in parsed.path.split("/") if part]
    if len(parts) < 2:
        return None
    return f"{parts[0]}/{parts[1].removesuffix('.git')}"


def inspect_repo(repo_url):
    repo = parse_github_repo(repo_url)
    if not repo:
        return {"provided": bool(repo_url), "valid_github_repo": False}
    details = github_api(f"/repos/{repo}")
    readme_text = ""
    try:
        readme = github_api(f"/repos/{repo}/readme")
        download_url = readme.get("download_url")
        if download_url:
            readme_text = session.get(download_url, timeout=15).text[:250_000]
    except requests.RequestException:
        pass
    code_matches = 0
    try:
        search = github_api(f"/search/code?q=pollinations+repo:{repo}")
        code_matches = search.get("total_count", 0)
    except requests.RequestException:
        pass
    return {
        "provided": True,
        "valid_github_repo": True,
        "repo": repo,
        "archived": details.get("archived", False),
        "description": details.get("description") or "",
        "pollinations_markers": marker_hits(readme_text),
        "code_search_matches": code_matches,
    }


def call_llm(submission, evidence):
    prompt = f"""You are pre-reviewing a community app submitted to Pollinations.
Decide whether a human maintainer has enough evidence to review it.

Ready means: the app is reachable, its purpose is understandable, and there is credible evidence that it uses Pollinations. A repository is optional. Never infer integration from the submitter's claim alone when the live page and repository show no evidence.

Return only JSON:
{{"status":"ready"|"needs_info","summary":"2-4 concise bullet lines","questions":["specific missing item"]}}

Submission:
{json.dumps(submission, ensure_ascii=False)}

Automated evidence:
{json.dumps(evidence, ensure_ascii=False)}
"""
    response = requests.post(
        POLLINATIONS_API,
        headers={"Authorization": f"Bearer {POLLINATIONS_API_KEY}"},
        json={
            "model": MODEL,
            "messages": [{"role": "user", "content": prompt}],
            "max_tokens": 500,
            "temperature": 0,
        },
        timeout=60,
    )
    response.raise_for_status()
    content = response.json()["choices"][0]["message"]["content"]
    match = re.search(r"\{[\s\S]*\}", content)
    if not match:
        raise ValueError("pre-review model did not return JSON")
    result = json.loads(match.group(0))
    if result.get("status") not in ("ready", "needs_info"):
        raise ValueError("pre-review model returned an invalid status")
    return result


def replace_review_comment(body):
    comments = github_api(f"/repos/{REPO}/issues/{ISSUE_NUMBER}/comments?per_page=100")
    existing = next(
        (
            comment
            for comment in reversed(comments)
            if COMMENT_MARKER in comment.get("body", "")
            and (not GH_BOT_LOGIN or comment["user"]["login"] == GH_BOT_LOGIN)
        ),
        None,
    )
    if existing:
        github_api(f"/repos/{REPO}/issues/comments/{existing['id']}", "PATCH", {"body": body})
    else:
        github_api(f"/repos/{REPO}/issues/{ISSUE_NUMBER}/comments", "POST", {"body": body})


def set_status_label(label=None):
    issue = github_api(f"/repos/{REPO}/issues/{ISSUE_NUMBER}")
    labels = [item["name"] for item in issue.get("labels", [])]
    labels = [name for name in labels if name not in ("APP-NEEDS-INFO", "APP-REVIEW")]
    if label and label not in labels:
        labels.append(label)
    github_api(f"/repos/{REPO}/issues/{ISSUE_NUMBER}", "PATCH", {"labels": labels})


def main():
    if not all((ISSUE_NUMBER.isdigit(), GH_TOKEN, POLLINATIONS_API_KEY)):
        raise ValueError("ISSUE_NUMBER, GH_TOKEN, and POLLINATIONS_API_KEY are required")
    validation = json.loads(VALIDATION_RESULT)
    set_status_label()
    if validation.get("system_error"):
        raise RuntimeError(validation["system_error"])

    if not validation.get("valid"):
        errors = validation.get("errors") or ["The submission form is incomplete."]
        bullets = "\n".join(f"- {error}" for error in errors)
        replace_review_comment(
            f"{COMMENT_MARKER}\n## App pre-review: more information needed\n\n{bullets}\n\nEdit the issue with the missing information; the pre-review will run again."
        )
        set_status_label("APP-NEEDS-INFO")
        return

    submission = validation["submission"]
    evidence = {"app": {}, "repository": {}}
    try:
        evidence["app"] = inspect_app(submission["appUrl"])
    except (requests.RequestException, ValueError) as error:
        evidence["app"] = {"reachable": False, "error": str(error)}
    try:
        evidence["repository"] = inspect_repo(submission.get("repoUrl", ""))
    except requests.RequestException as error:
        evidence["repository"] = {"provided": True, "error": str(error)}

    review = call_llm(submission, evidence)
    summary = review.get("summary", "Automated checks completed.").strip()
    questions = [str(item).strip() for item in review.get("questions", []) if str(item).strip()]
    if review["status"] == "ready":
        body = (
            f"{COMMENT_MARKER}\n## App pre-review: ready for human review\n\n{summary}\n\n"
            "A maintainer can verify the app and add `APP-APPROVED` to publish it."
        )
        label = "APP-REVIEW"
    else:
        question_text = "\n".join(f"- {question}" for question in questions)
        body = (
            f"{COMMENT_MARKER}\n## App pre-review: more information needed\n\n{summary}\n\n"
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
        sys.exit(1)
