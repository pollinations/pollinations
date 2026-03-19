"""GitHub user scoring for Seed tier eligibility.

Scoring formula (threshold >= 8 pts):
  - Account age: 0.5 pt/month (max 6)
  - Commits (90d): 0.1 pt each (max 2)
  - Quality repos (diskUsage > 0): 0.5 pt each (max 1)
  - Stars (quality repos only): 0.1 pt each (max 5)

NOTE: If you update scoring values, also update
enter.pollinations.ai/src/client/components/balance/tier-explanation.tsx
"""

import base64
import json
import os
import re
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timedelta, timezone

from tqdm import tqdm

GITHUB_GRAPHQL = "https://api.github.com/graphql"
GITHUB_REST_USER = "https://api.github.com/user/{}"
BATCH_SIZE = 50
MAX_BATCHES = None
GITHUB_USERNAME_RE = re.compile(r"^[A-Za-z0-9-]+$")
_AUTH_MODE = None
_APP_TOKEN = None
_APP_TOKEN_EXPIRES_AT = 0
_APP_TOKEN_LOCK = threading.Lock()

SCORING = [
    {"field": "age_days", "multiplier": 0.5 / 30, "max": 6.0},
    {"field": "commits", "multiplier": 0.1, "max": 2.0},
    {"field": "repos", "multiplier": 0.5, "max": 1.0},
    {"field": "stars", "multiplier": 0.1, "max": 5.0},
]
THRESHOLD = 8.0

# Risk assessment constants
BURST_EMPTY_REPO_THRESHOLD = 5
RECENT_WINDOW_DAYS = 7
LARGE_ACCOUNT_MIN_REPOS = 20
EMPTY_DOMINANCE_THRESHOLD = 0.8
MIN_QUALITY_REPOS = 3

_DELETED_RESULT = {
    "status": "github_account_deleted", "approved": False,
    "reason": "GitHub account deleted", "details": None,
    "risk_status": "unavailable", "risk_flags": [], "risk_details": None,
}
_TQDM_FMT = "{l_bar}{bar}| {n_fmt}/{total_fmt} [{remaining}] {postfix}"


def _base64url_encode(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).rstrip(b"=").decode()


def _generate_app_jwt(app_id: str, key_path: str) -> str:
    now = int(time.time())
    header = _base64url_encode(json.dumps({"alg": "RS256", "typ": "JWT"}).encode())
    payload = _base64url_encode(
        json.dumps({"iat": now - 60, "exp": now + 10 * 60, "iss": app_id}).encode()
    )
    signing_input = f"{header}.{payload}".encode()
    signature = subprocess.run(
        ["openssl", "dgst", "-binary", "-sha256", "-sign", key_path],
        input=signing_input, capture_output=True, check=True,
    ).stdout
    return f"{header}.{payload}.{_base64url_encode(signature)}"


def _fetch_app_token(app_id: str, key_path: str) -> tuple[str, int]:
    jwt = _generate_app_jwt(app_id, key_path)
    gh_headers = {
        "Authorization": f"Bearer {jwt}",
        "Accept": "application/vnd.github+json",
        "User-Agent": "pollinations-github-validator",
    }

    req = urllib.request.Request("https://api.github.com/app/installations", headers=gh_headers)
    with urllib.request.urlopen(req, timeout=30) as resp:
        installations = json.loads(resp.read())
    if not installations:
        raise RuntimeError("No GitHub App installations found")

    token_req = urllib.request.Request(
        f"https://api.github.com/app/installations/{installations[0]['id']}/access_tokens",
        data=b"{}", headers={**gh_headers, "Content-Type": "application/json"}, method="POST",
    )
    with urllib.request.urlopen(token_req, timeout=30) as resp:
        token_data = json.loads(resp.read())

    expires_at = int(
        datetime.fromisoformat(token_data["expires_at"].replace("Z", "+00:00")).timestamp()
    )
    return token_data["token"], expires_at - 5 * 60


def get_github_token() -> str:
    global _AUTH_MODE, _APP_TOKEN, _APP_TOKEN_EXPIRES_AT

    app_id = os.environ.get("GITHUB_APP_ID")
    key_path = os.environ.get("GITHUB_APP_PRIVATE_KEY_PATH")
    if app_id or key_path:
        if not app_id or not key_path:
            raise RuntimeError("Set both GITHUB_APP_ID and GITHUB_APP_PRIVATE_KEY_PATH")
        if not os.path.exists(key_path):
            raise RuntimeError(f"GitHub App private key not found: {key_path}")

        with _APP_TOKEN_LOCK:
            if _APP_TOKEN and time.time() < _APP_TOKEN_EXPIRES_AT:
                return _APP_TOKEN
            _APP_TOKEN, _APP_TOKEN_EXPIRES_AT = _fetch_app_token(app_id, key_path)
            if _AUTH_MODE != "app":
                print(f"Using GitHub App auth via {os.path.basename(key_path)}", file=sys.stderr)
                _AUTH_MODE = "app"
            return _APP_TOKEN

    token = os.environ.get("GITHUB_TOKEN")
    if not token:
        raise RuntimeError("Set GITHUB_APP_ID + GITHUB_APP_PRIVATE_KEY_PATH or GITHUB_TOKEN")
    if _AUTH_MODE != "pat":
        print("Using GITHUB_TOKEN auth", file=sys.stderr)
        _AUTH_MODE = "pat"
    return token


def _parse_github_id(value) -> int | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, int) and value > 0:
        return value
    if isinstance(value, float) and value == int(value) and int(value) > 0:
        return int(value)
    if isinstance(value, str) and value.strip().isdigit() and int(value.strip()) > 0:
        return int(value.strip())
    return None


def _normalize_record(record: dict) -> dict:
    username = record.get("github_username") or record.get("username")
    username = username.strip() if isinstance(username, str) and username.strip() else None
    return {"github_id": _parse_github_id(record.get("github_id")), "github_username": username}


def _parse_iso(value: object) -> datetime | None:
    if not isinstance(value, str) or not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None


def build_query(usernames: list[str]) -> str:
    from_date = (datetime.now(timezone.utc) - timedelta(days=90)).strftime("%Y-%m-%dT00:00:00Z")
    fragments = " ".join(
        f'u{i}: user(login: "{u}") {{'
        f" login createdAt"
        f" repositories(privacy: PUBLIC, isFork: false, first: 10,"
        f' orderBy: {{field: STARGAZERS, direction: DESC}}) {{'
        f" totalCount nodes {{ stargazerCount diskUsage createdAt }} }}"
        f' contributionsCollection(from: "{from_date}") {{ totalCommitContributions }}'
        f" }}"
        for i, u in enumerate(usernames)
    )
    return f"query {{ {fragments} }}"


def build_account_status_query(usernames: list[str]) -> str:
    fragments = " ".join(
        f'u{i}: user(login: "{u}") {{ login }}'
        for i, u in enumerate(usernames)
    )
    return f"query {{ {fragments} }}"


def _get_rate_wait(error) -> int:
    retry_after = error.headers.get("Retry-After")
    if retry_after:
        return int(retry_after) + 1
    reset_at = error.headers.get("X-RateLimit-Reset")
    if reset_at:
        return max(int(reset_at) - int(time.time()), 0) + 1
    return 60


def _handle_http_retry(error, attempt: int, retries: int) -> bool:
    if attempt >= retries - 1:
        return False
    if error.code in (502, 503, 504):
        time.sleep(5 * (attempt + 1))
        return True
    if error.code in (403, 429):
        wait = _get_rate_wait(error)
        print(f"   Rate limited (HTTP {error.code}), waiting {wait}s...")
        time.sleep(wait)
        return True
    return False


def run_graphql_query(query: str, retries: int = 3) -> tuple[dict, int | None]:
    request = urllib.request.Request(
        GITHUB_GRAPHQL,
        data=json.dumps({"query": query}).encode(),
        headers={"Authorization": f"Bearer {get_github_token()}", "Content-Type": "application/json"},
    )
    for attempt in range(retries):
        try:
            with urllib.request.urlopen(request, timeout=30) as response:
                remaining = response.headers.get("X-RateLimit-Remaining")
                return json.loads(response.read()), int(remaining) if remaining else None
        except urllib.error.HTTPError as error:
            if _handle_http_retry(error, attempt, retries):
                continue
            raise
    raise RuntimeError("GitHub GraphQL request failed without a response")


def run_rest_request(url: str, retries: int = 3) -> tuple[dict | None, int | None, int]:
    request = urllib.request.Request(
        url,
        headers={
            "Authorization": f"Bearer {get_github_token()}",
            "Accept": "application/vnd.github+json",
            "User-Agent": "pollinations-github-validator",
        },
    )
    for attempt in range(retries):
        try:
            with urllib.request.urlopen(request, timeout=30) as response:
                remaining = response.headers.get("X-RateLimit-Remaining")
                return json.loads(response.read()), int(remaining) if remaining else None, response.status
        except urllib.error.HTTPError as error:
            if error.code == 404:
                return None, None, 404
            if _handle_http_retry(error, attempt, retries):
                continue
            return None, None, error.code
    raise RuntimeError("GitHub REST request failed without a response")


def assess_profile_risk(data: dict, username: str) -> dict:
    repos = data.get("repositories") or {}
    all_nodes = [n for n in (repos.get("nodes") or []) if n]
    empty_nodes = [n for n in all_nodes if n.get("diskUsage", 0) == 0]
    quality_count = len(all_nodes) - len(empty_nodes)
    total_repos = int(repos.get("totalCount") or 0)
    fetched = len(all_nodes)

    cutoff = datetime.now(timezone.utc) - timedelta(days=RECENT_WINDOW_DAYS)
    recent_empty = sum(
        1 for n in empty_nodes
        if (dt := _parse_iso(n.get("createdAt"))) and dt >= cutoff
    )

    flags: list[str] = []
    if recent_empty >= BURST_EMPTY_REPO_THRESHOLD:
        flags.append("burst_empty_repos")
    if total_repos > LARGE_ACCOUNT_MIN_REPOS and fetched > 0 and len(empty_nodes) / fetched > EMPTY_DOMINANCE_THRESHOLD:
        flags.append("empty_repo_dominance")
    if total_repos > LARGE_ACCOUNT_MIN_REPOS and quality_count < MIN_QUALITY_REPOS:
        flags.append("repo_quality_gap")

    return {
        "username": username,
        "risk_status": "suspicious" if flags else "ok",
        "risk_flags": flags,
        "risk_details": {
            "total_repos": total_repos, "fetched_repos": fetched,
            "empty_fetched_repos": len(empty_nodes), "quality_fetched_repos": quality_count,
            "recent_empty_repos": recent_empty,
        },
    }


def score_user(data: dict | None, username: str) -> dict:
    if not data:
        return {"username": username, **_DELETED_RESULT}

    created = datetime.fromisoformat(data["createdAt"].replace("Z", "+00:00"))
    age_days = (datetime.now(timezone.utc) - created).days
    all_nodes = [n for n in (data["repositories"].get("nodes") or []) if n]
    quality_nodes = [n for n in all_nodes if n.get("diskUsage", 0) > 0]

    metrics = {
        "age_days": age_days,
        "repos": len(quality_nodes),
        "commits": data["contributionsCollection"]["totalCommitContributions"],
        "stars": sum(n["stargazerCount"] for n in quality_nodes),
    }
    scores = {c["field"]: min(metrics[c["field"]] * c["multiplier"], c["max"]) for c in SCORING}
    total = sum(scores.values())
    risk = assess_profile_risk(data, username)

    return {
        "username": username, "status": "ok",
        "approved": total >= THRESHOLD,
        "reason": f"{total:.1f} pts",
        "details": {
            "age_days": age_days, "age_pts": scores["age_days"],
            "quality_repos": len(quality_nodes), "total_repos": data["repositories"]["totalCount"],
            "repos_pts": scores["repos"],
            "commits": metrics["commits"], "commits_pts": scores["commits"],
            "stars": metrics["stars"], "stars_pts": scores["stars"],
            "total": total,
        },
        "risk_status": risk["risk_status"],
        "risk_flags": risk["risk_flags"],
        "risk_details": risk["risk_details"],
    }


def _adaptive_sleep(rate_remaining: int | None) -> None:
    if rate_remaining is not None and rate_remaining <= 100:
        time.sleep(1 if rate_remaining > 50 else 2)
    elif rate_remaining is None:
        time.sleep(2)


def fetch_batch(usernames: list[str], retries: int = 3) -> tuple[list[dict], int | None]:
    data, rate_remaining = run_graphql_query(build_query(usernames), retries)
    gql_data = data.get("data", {})
    return [score_user(gql_data.get(f"u{i}"), u) for i, u in enumerate(usernames)], rate_remaining


def fetch_account_batch(usernames: list[str], retries: int = 3) -> tuple[list[dict], int | None]:
    data, rate_remaining = run_graphql_query(build_account_status_query(usernames), retries)
    gql_data = data.get("data", {})
    return [
        {"username": u, "status": "ok" if gql_data.get(f"u{i}") else "github_account_deleted"}
        for i, u in enumerate(usernames)
    ], rate_remaining


def _run_batches(usernames: list[str], fetch_fn, desc: str, invalid_fn=None) -> list[dict]:
    if not usernames:
        return []

    get_github_token()
    valid = [u for u in usernames if GITHUB_USERNAME_RE.match(u)]
    results = [invalid_fn(u) for u in usernames if not GITHUB_USERNAME_RE.match(u)] if invalid_fn else []
    if not valid:
        return results

    batches = [valid[i : i + BATCH_SIZE] for i in range(0, len(valid), BATCH_SIZE)]
    if MAX_BATCHES:
        batches = batches[:MAX_BATCHES]

    progress = tqdm(total=len(batches), desc=desc, unit="batch",
                    bar_format=_TQDM_FMT)

    with ThreadPoolExecutor(max_workers=3) as executor:
        futures = {executor.submit(fetch_fn, batch): batch for batch in batches}
        for future in as_completed(futures):
            batch_results, rate_remaining = future.result()
            results.extend(batch_results)
            progress.set_postfix(quota=rate_remaining or "?")
            progress.update(1)
            _adaptive_sleep(rate_remaining)

    progress.close()
    return results


def validate_account_records(records: list[dict]) -> list[dict]:
    if not records:
        return []

    get_github_token()
    normalized = [_normalize_record(r) for r in records]
    results: list[dict | None] = [None] * len(normalized)
    username_only: list[tuple[int, str]] = []
    id_jobs: list[tuple[int, int]] = []

    for idx, rec in enumerate(normalized):
        if rec["github_id"] is not None:
            id_jobs.append((idx, rec["github_id"]))
        elif isinstance(rec["github_username"], str) and GITHUB_USERNAME_RE.match(rec["github_username"]):
            username_only.append((idx, rec["github_username"]))
        else:
            results[idx] = {
                "github_id": rec["github_id"], "username": rec["github_username"],
                "status": "github_account_deleted",
            }

    if id_jobs:
        progress = tqdm(total=len(id_jobs), desc="Resolving IDs", unit="user",
                        bar_format=_TQDM_FMT)
        with ThreadPoolExecutor(max_workers=3) as executor:
            futures = {
                executor.submit(run_rest_request, GITHUB_REST_USER.format(gid)): (idx, gid)
                for idx, gid in id_jobs
            }
            for future in as_completed(futures):
                idx, gid = futures[future]
                data, rate_remaining, status = future.result()
                login = data.get("login") if status == 200 and isinstance(data, dict) else None
                results[idx] = {
                    "github_id": gid,
                    "username": login if isinstance(login, str) else normalized[idx]["github_username"],
                    "status": "ok" if isinstance(login, str) else "github_account_deleted",
                }
                progress.set_postfix(quota=rate_remaining or "?")
                progress.update(1)
                _adaptive_sleep(rate_remaining)
        progress.close()

    if username_only:
        acct_results = _run_batches(
            [u for _, u in username_only], fetch_account_batch, "Checking accounts",
            invalid_fn=lambda u: {"username": u, "status": "github_account_deleted"},
        )
        by_username = {r["username"]: r for r in acct_results if isinstance(r.get("username"), str)}
        for idx, username in username_only:
            r = by_username.get(username, {"username": username, "status": "github_account_deleted"})
            results[idx] = {"github_id": None, "username": r["username"], "status": r["status"]}

    return [r for r in results if r is not None]


def validate_user_records(records: list[dict]) -> list[dict]:
    if not records:
        return []

    account_results = validate_account_records(records)
    active_usernames = [
        r["username"] for r in account_results
        if r.get("status") == "ok" and isinstance(r.get("username"), str)
    ]
    scores_by_name = {
        r["username"]: r
        for r in _run_batches(active_usernames, fetch_batch, "Validating",
                              invalid_fn=lambda u: score_user(None, u))
        if isinstance(r.get("username"), str)
    }

    merged = []
    for acct in account_results:
        username = acct.get("username")
        gid = acct.get("github_id")
        scored = scores_by_name.get(username) if acct.get("status") == "ok" and isinstance(username, str) else None
        base = scored if scored else {**score_user(None, username or ""), "username": username}
        merged.append({**base, "github_id": gid})
    return merged
