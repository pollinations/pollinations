"""GitHub account validation — existence checks and identity resolution.

Extracted from github_score.py so that trust scoring can validate accounts
without pulling in the full scoring engine and its github_risk dependency.
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
from datetime import datetime, timezone

from tqdm import tqdm

GITHUB_GRAPHQL = "https://api.github.com/graphql"
GITHUB_REST_USER = "https://api.github.com/user/{}"
BATCH_SIZE = 50
ACCOUNT_LOOKUP_MAX_WORKERS = 3
MAX_BATCHES = None  # Set to a number to limit batches for testing
GITHUB_USERNAME_RE = re.compile(r"^[A-Za-z0-9-]+$")
_AUTH_MODE = None
_APP_TOKEN = None
_APP_TOKEN_EXPIRES_AT = 0
_APP_TOKEN_LOCK = threading.Lock()


def _base64url_encode(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).rstrip(b"=").decode()


def _generate_app_jwt(app_id: str, key_path: str) -> str:
    now = int(time.time())
    header = _base64url_encode(json.dumps({"alg": "RS256", "typ": "JWT"}).encode())
    payload = _base64url_encode(
        json.dumps(
            {
                "iat": now - 60,
                "exp": now + 10 * 60,
                "iss": app_id,
            }
        ).encode()
    )
    signing_input = f"{header}.{payload}".encode()
    signature = subprocess.run(
        ["openssl", "dgst", "-binary", "-sha256", "-sign", key_path],
        input=signing_input,
        capture_output=True,
        check=True,
    ).stdout
    return f"{header}.{payload}.{_base64url_encode(signature)}"


def _fetch_app_token(app_id: str, key_path: str) -> tuple[str, int]:
    jwt = _generate_app_jwt(app_id, key_path)

    installations_request = urllib.request.Request(
        "https://api.github.com/app/installations",
        headers={
            "Authorization": f"Bearer {jwt}",
            "Accept": "application/vnd.github+json",
            "User-Agent": "pollinations-github-validator",
        },
    )
    with urllib.request.urlopen(installations_request, timeout=30) as response:
        installations = json.loads(response.read())

    if not installations:
        raise RuntimeError("No GitHub App installations found")

    installation_id = installations[0]["id"]
    token_request = urllib.request.Request(
        f"https://api.github.com/app/installations/{installation_id}/access_tokens",
        data=b"{}",
        headers={
            "Authorization": f"Bearer {jwt}",
            "Accept": "application/vnd.github+json",
            "Content-Type": "application/json",
            "User-Agent": "pollinations-github-validator",
        },
        method="POST",
    )
    with urllib.request.urlopen(token_request, timeout=30) as response:
        token_data = json.loads(response.read())

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
            raise RuntimeError(
                "Set both GITHUB_APP_ID and GITHUB_APP_PRIVATE_KEY_PATH for GitHub App auth"
            )
        if not os.path.exists(key_path):
            raise RuntimeError(f"GitHub App private key not found: {key_path}")

        with _APP_TOKEN_LOCK:
            if _APP_TOKEN and time.time() < _APP_TOKEN_EXPIRES_AT:
                return _APP_TOKEN

            _APP_TOKEN, _APP_TOKEN_EXPIRES_AT = _fetch_app_token(app_id, key_path)
            if _AUTH_MODE != "app":
                print(
                    f"🔑 Using GitHub App auth via {os.path.basename(key_path)}",
                    file=sys.stderr,
                )
                _AUTH_MODE = "app"
            return _APP_TOKEN

    token = os.environ.get("GITHUB_TOKEN")
    if not token:
        raise RuntimeError(
            "Set GITHUB_APP_ID + GITHUB_APP_PRIVATE_KEY_PATH or GITHUB_TOKEN"
        )
    if _AUTH_MODE != "pat":
        print("🔑 Using GITHUB_TOKEN auth", file=sys.stderr)
        _AUTH_MODE = "pat"
    return token


def _parse_github_id(value) -> int | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, int):
        return value if value > 0 else None
    if isinstance(value, float):
        if value.is_integer() and value > 0:
            return int(value)
        return None
    if isinstance(value, str) and value.strip().isdigit():
        parsed = int(value.strip())
        return parsed if parsed > 0 else None
    return None


def _normalize_record(record: dict) -> dict:
    username = record.get("github_username")
    if not isinstance(username, str) or not username.strip():
        username = record.get("username")
    if not isinstance(username, str) or not username.strip():
        username = None

    return {
        "github_id": _parse_github_id(record.get("github_id")),
        "github_username": username.strip() if isinstance(username, str) else None,
    }


def build_account_status_query(usernames: list[str]) -> str:
    """Build a minimal GraphQL query to check account existence."""
    fragments = []
    for i, username in enumerate(usernames):
        safe_username = username.replace("\\", "\\\\").replace('"', '\\"')
        fragments.append(
            f'''
    u{i}: user(login: "{safe_username}") {{
        login
    }}'''
        )
    return f"query {{ {''.join(fragments)} }}"


def run_graphql_query(query: str, retries: int = 3) -> tuple[dict, int | None]:
    request = urllib.request.Request(
        GITHUB_GRAPHQL,
        data=json.dumps({"query": query}).encode(),
        headers={
            "Authorization": f"Bearer {get_github_token()}",
            "Content-Type": "application/json",
        },
    )

    rate_remaining = None
    data = None
    for attempt in range(retries):
        try:
            with urllib.request.urlopen(request, timeout=30) as response:
                data = json.loads(response.read())
                rate_remaining_header = response.headers.get("X-RateLimit-Remaining")
                if rate_remaining_header:
                    rate_remaining = int(rate_remaining_header)
            break
        except urllib.error.HTTPError as error:
            if attempt < retries - 1 and error.code in (502, 503, 504):
                time.sleep(5 * (attempt + 1))
                continue
            if attempt < retries - 1 and error.code in (403, 429):
                retry_after = error.headers.get("Retry-After")
                reset_at = error.headers.get("X-RateLimit-Reset")
                if retry_after:
                    wait = int(retry_after) + 1
                elif reset_at:
                    wait = max(int(reset_at) - int(time.time()), 0) + 1
                else:
                    wait = 60
                print(f"   ⏳ Rate limited (HTTP {error.code}), waiting {wait}s...")
                time.sleep(wait)
                continue
            raise

    if data is None:
        raise RuntimeError("GitHub GraphQL request failed without a response")

    return data, rate_remaining


def run_rest_request(url: str, retries: int = 3) -> tuple[dict | None, int | None, int]:
    request = urllib.request.Request(
        url,
        headers={
            "Authorization": f"Bearer {get_github_token()}",
            "Accept": "application/vnd.github+json",
            "User-Agent": "pollinations-github-validator",
        },
    )

    rate_remaining = None
    for attempt in range(retries):
        try:
            with urllib.request.urlopen(request, timeout=30) as response:
                data = json.loads(response.read())
                rate_remaining_header = response.headers.get("X-RateLimit-Remaining")
                if rate_remaining_header:
                    rate_remaining = int(rate_remaining_header)
                return data, rate_remaining, response.status
        except urllib.error.HTTPError as error:
            if error.code == 404:
                return None, rate_remaining, 404
            if attempt < retries - 1 and error.code in (502, 503, 504):
                time.sleep(5 * (attempt + 1))
                continue
            if attempt < retries - 1 and error.code in (403, 429):
                retry_after = error.headers.get("Retry-After")
                reset_at = error.headers.get("X-RateLimit-Reset")
                if retry_after:
                    wait = int(retry_after) + 1
                elif reset_at:
                    wait = max(int(reset_at) - int(time.time()), 0) + 1
                else:
                    wait = 60
                print(f"   ⏳ Rate limited (HTTP {error.code}), waiting {wait}s...")
                time.sleep(wait)
                continue
            return None, rate_remaining, error.code

    raise RuntimeError("GitHub REST request failed without a response")


def fetch_account_batch(
    usernames: list[str], retries: int = 3
) -> tuple[list[dict], int | None]:
    """Fetch account existence for a batch of usernames."""
    data, rate_remaining = run_graphql_query(
        build_account_status_query(usernames),
        retries,
    )

    results = []
    for i, username in enumerate(usernames):
        user_data = data.get("data", {}).get(f"u{i}")
        results.append(
            {
                "username": username,
                "status": "ok" if user_data else "github_account_deleted",
            }
        )
    return results, rate_remaining


def fetch_account_by_id(
    github_id: int, retries: int = 3
) -> tuple[dict | None, int | None, int]:
    return run_rest_request(GITHUB_REST_USER.format(github_id), retries)


def _validate_account_usernames(usernames: list[str]) -> list[dict]:
    """Validate GitHub account existence in concurrent batches."""
    if not usernames:
        return []

    get_github_token()

    invalid_results = [
        {
            "username": username,
            "status": "github_account_deleted",
        }
        for username in usernames
        if not GITHUB_USERNAME_RE.match(username)
    ]
    valid_usernames = [
        username for username in usernames if GITHUB_USERNAME_RE.match(username)
    ]

    if not valid_usernames:
        return invalid_results

    batches = [
        valid_usernames[i : i + BATCH_SIZE]
        for i in range(0, len(valid_usernames), BATCH_SIZE)
    ]
    if MAX_BATCHES:
        batches = batches[:MAX_BATCHES]

    results = invalid_results.copy()
    progress_bar = tqdm(
        total=len(batches),
        desc="Checking accounts",
        unit="batch",
        bar_format="{l_bar}{bar}| {n_fmt}/{total_fmt} [{remaining}] {postfix}",
    )

    with ThreadPoolExecutor(max_workers=3) as executor:
        futures = {
            executor.submit(fetch_account_batch, batch): i
            for i, batch in enumerate(batches)
        }

        for future in as_completed(futures):
            batch_results, rate_remaining = future.result()
            results.extend(batch_results)
            progress_bar.set_postfix(
                quota=rate_remaining if rate_remaining is not None else "?"
            )
            progress_bar.update(1)

            if rate_remaining is not None and rate_remaining <= 100:
                time.sleep(1 if rate_remaining > 50 else 2)
            elif rate_remaining is None:
                time.sleep(2)

    progress_bar.close()
    return results


def validate_account_records(records: list[dict]) -> list[dict]:
    if not records:
        return []

    get_github_token()

    normalized = [_normalize_record(record) for record in records]
    results: list[dict | None] = [None] * len(normalized)
    username_only: list[tuple[int, str]] = []
    id_jobs: list[tuple[int, int, str | None]] = []

    for index, record in enumerate(normalized):
        github_id = record["github_id"]
        github_username = record["github_username"]

        if github_id is not None:
            id_jobs.append((index, github_id, github_username))
            continue

        if isinstance(github_username, str) and GITHUB_USERNAME_RE.match(github_username):
            username_only.append((index, github_username))
            continue

        results[index] = {
            "github_id": github_id,
            "username": github_username,
            "status": "github_account_deleted",
        }

    if id_jobs:
        progress_bar = tqdm(
            total=len(id_jobs),
            desc="Resolving IDs",
            unit="user",
            bar_format="{l_bar}{bar}| {n_fmt}/{total_fmt} [{remaining}] {postfix}",
        )
        with ThreadPoolExecutor(max_workers=ACCOUNT_LOOKUP_MAX_WORKERS) as executor:
            futures = {
                executor.submit(fetch_account_by_id, github_id): (index, github_id)
                for index, github_id, _github_username in id_jobs
            }
            for future in as_completed(futures):
                index, github_id = futures[future]
                data, rate_remaining, status = future.result()
                if status == 200 and isinstance(data, dict):
                    login = data.get("login")
                    results[index] = {
                        "github_id": github_id,
                        "username": login if isinstance(login, str) else None,
                        "status": "ok" if isinstance(login, str) else "github_account_deleted",
                    }
                else:
                    results[index] = {
                        "github_id": github_id,
                        "username": normalized[index]["github_username"],
                        "status": "github_account_deleted",
                    }

                progress_bar.set_postfix(
                    quota=rate_remaining if rate_remaining is not None else "?"
                )
                progress_bar.update(1)

                if rate_remaining is not None and rate_remaining <= 100:
                    time.sleep(1 if rate_remaining > 50 else 2)
                elif rate_remaining is None:
                    time.sleep(1)

        progress_bar.close()

    if username_only:
        usernames = [username for _index, username in username_only]
        fallback_results = _validate_account_usernames(usernames)
        by_username = {
            result["username"]: result
            for result in fallback_results
            if isinstance(result.get("username"), str)
        }
        for index, username in username_only:
            result = by_username.get(
                username,
                {"username": username, "status": "github_account_deleted"},
            )
            results[index] = {
                "github_id": None,
                "username": result.get("username"),
                "status": result.get("status", "github_account_deleted"),
            }

    return [result for result in results if result is not None]
