#!/usr/bin/env python3
"""Send the saved PR Discord posts once their production deploy has passed (#17406).

    python deploy_posts.py run
    python deploy_posts.py mark PR-N done|failed

Run by news-deploy-posts.yml on every completed production deploy (workflow_run)
and every 30 minutes (cron reconciliation).

A PR's post is due when its merge commit is an ancestor of a production commit
whose deploys ALL passed. "All" means every deploy workflow GitHub started for
that commit: the applicability evidence is the commit's check suites and
workflow runs (both are created synchronously with the push), and a discovery
barrier (15 minutes after the earliest evidence) must have passed, so a run
that is not there yet can never open the gate. A commit with no deploy
evidence at all (docs/CLI-only promotion) carries nothing itself; its PRs go
out with the next passing deploy.

Every send follows deliver.py's contract: the PR file's `delivery` block is
committed as "attempt" BEFORE the webhook call and with the result after.
An "attempt" left behind means the outcome is unknown: the PR is skipped and
the run goes red until a person checks the channel and runs mark.
"""

import json
import os
import sys
import time
from uuid import uuid4
from datetime import UTC, datetime, timedelta

import requests
from common import (
    GISTS_BRANCH,
    GITHUB_API_BASE,
    NEWS_REL_DIR,
    _github_headers,
    get_env,
    post_discord_webhook,
    read_news_file,
    update_news_file,
)

# The production deploys, workflow file -> workflow name (check-suite name).
DEPLOYS = {
    "deploy-cloudflare-production.yml": "Deploy / Cloudflare production",
    "deploy-website-cloudflare.yml": "Deploy / pollinations.ai",
    "deploy-applications.yml": "Deploy / Applications",
}
PRODUCTION_BRANCH = "production"
# Sibling suites/runs of one push appear within seconds; this backstop only
# matters under a platform incident. The gate never opens before it.
DISCOVERY_BARRIER = timedelta(minutes=15)
SEND_DELAY = 5  # seconds between Discord posts
STATE_PATH = f"{NEWS_REL_DIR}/deploy-posts/state.json"
PR_POSTS_DIR = f"{NEWS_REL_DIR}/pr-posts"

RUN = "{}-{}-{}".format(
    os.environ.get("GITHUB_RUN_ID", "local"),
    os.environ.get("GITHUB_RUN_ATTEMPT", "1"),
    os.environ.get("GITHUB_JOB", "deploy-posts"),
)
# Unique per process: a result write only ever overwrites ITS OWN claim.
CLAIM_ID = f"{RUN}-{uuid4().hex}"


def now() -> datetime:
    return datetime.now(UTC)


def iso(dt: datetime) -> str:
    return dt.isoformat()


def parse(ts: str) -> datetime:
    return datetime.fromisoformat(ts.replace("Z", "+00:00"))


# ── GitHub API ───────────────────────────────────────────────────────


class GitHub:
    def __init__(self, token: str, repo: str):
        self.token = token
        self.repo = repo

    def get(self, path: str, **params) -> requests.Response:
        resp = requests.get(
            f"{GITHUB_API_BASE}/repos/{self.repo}{path}",
            headers=_github_headers(self.token),
            params=params,
            timeout=30,
        )
        if resp.status_code != 200:
            raise RuntimeError(f"GET {path}: HTTP {resp.status_code} {resp.text[:200]}")
        return resp

    def get_all(self, path: str, key: str, max_pages: int = 10, **params) -> list:
        """Every page of a list endpoint. A full page is followed until a
        short one ends the list; exhausting the cap fails closed, because a
        silently truncated enumeration could open the deploy gate."""
        items = []
        for page in range(1, max_pages + 1):
            batch = self.get(path, per_page=100, page=page, **params).json()[key]
            items.extend(batch)
            if len(batch) < 100:
                return items
        raise RuntimeError(f"GET {path}: more than {max_pages * 100} {key}")


def deploy_evidence(gh: GitHub, sha: str) -> dict:
    """The commit's deploy evidence: {workflow file: {"run": latest run,
    "suite": its check suite or None}} for workflows with a run for this sha.

    A suite is tied to its run through the run's check_suite_id - the real API
    relationship - never by name. The latest run supersedes earlier attempts.
    A suite whose run GitHub never listed has no reliable workflow mapping and
    cannot open or close the gate by itself."""
    evidence = {}
    runs = gh.get_all("/actions/runs", "workflow_runs",
                      head_sha=sha, branch=PRODUCTION_BRANCH)
    suites = gh.get_all(f"/commits/{sha}/check-suites", "check_suites")
    suites_by_id = {s["id"]: s for s in suites}
    for wf, name in DEPLOYS.items():
        wf_runs = sorted(
            (r for r in runs if r["path"].endswith(wf) or r.get("name") == name),
            # created_at has second precision; the run id breaks the tie, so
            # a newer failed run can never lose to an older green sibling.
            key=lambda r: (r["created_at"], r.get("id", 0)),
        )
        if wf_runs:
            run = wf_runs[-1]
            evidence[wf] = {
                "run": run,
                "suite": suites_by_id.get(run.get("check_suite_id")),
            }
    return evidence


def evaluate_gate(gh: GitHub, sha: str, at: datetime) -> dict:
    """Whether every deploy GitHub started for sha has passed.

    Returns {"ok": bool, "reason": str, "deployed_at": str | None} - deployed_at
    is the moment the last applicable deploy passed.
    """
    evidence = deploy_evidence(gh, sha)
    # A run is the evidence; its suite is a second view of the same deploy.
    # A suite alone can never open (or close) the gate.
    evidence = {wf: trace for wf, trace in evidence.items() if trace["run"] is not None}
    if not evidence:
        return {"ok": False, "reason": "no deploy runs or suites", "deployed_at": None}
    created = []
    passed_at = []
    for wf, trace in evidence.items():
        name = DEPLOYS[wf]
        # The run and its check suite are two views of the same deploy; when
        # both exist they must BOTH read as passed, so a stale or failed view
        # can never be hidden by a successful sibling.
        for source in (trace["run"], trace["suite"]):
            if source is None:
                continue
            created.append(parse(source["created_at"]))
            if source["status"] != "completed":
                return {
                    "ok": False,
                    "reason": f"{name} is {source['status']}",
                    "deployed_at": None,
                }
            if source.get("conclusion") != "success":
                return {
                    "ok": False,
                    "reason": f"{name} concluded {source.get('conclusion')}",
                    "deployed_at": None,
                }
            passed_at.append(parse(source["updated_at"]))
    barrier = min(created) + DISCOVERY_BARRIER
    if at < barrier:
        return {
            "ok": False,
            "reason": f"discovery barrier until {barrier.isoformat()}",
            "deployed_at": None,
        }
    return {"ok": True, "reason": "all deploys passed", "deployed_at": iso(max(passed_at))}


def is_ancestor(gh: GitHub, merge_sha: str, sha: str) -> bool:
    """True when merge_sha is an ancestor of sha (or the same commit)."""
    if not merge_sha:
        return False
    comparison = gh.get(f"/compare/{merge_sha}...{sha}").json()
    return comparison["status"] in ("ahead", "identical")


def production_commits(gh: GitHub, stop_at: str | None, max_pages: int = 20) -> list:
    """Production shas, newest first, down to (excluding) stop_at.

    Pages until stop_at is found or history ends. The page cap only guards
    against a cursor that no longer exists (a force-push); hitting it before
    the cursor fails loud instead of reconciling against a partial history."""
    shas = []
    for page in range(1, max_pages + 1):
        commits = gh.get(
            "/commits", sha=PRODUCTION_BRANCH, per_page=100, page=page
        ).json()
        if not commits:
            return shas
        for commit in commits:
            sha = commit["sha"]
            if sha == stop_at:
                return shas
            shas.append(sha)
    raise RuntimeError(
        f"More than {max_pages * 100} commits without reaching "
        f"{(stop_at or 'the end of history')[:12]}: reconciliation refuses "
        "to work from a truncated history"
    )


def production_head(gh: GitHub) -> str:
    return gh.get(f"/branches/{PRODUCTION_BRANCH}").json()["commit"]["sha"]


# ── Pending posts on the news branch ─────────────────────────────────


def list_pr_posts(gh: GitHub) -> list:
    """Saved post filenames. Walked through the git trees API (the directory
    listing caps at 1,000 entries and truncates silently). A missing
    directory is an empty list; a failed lookup raises."""
    def fetch_tree(ref: str) -> dict:
        resp = requests.get(
            f"{GITHUB_API_BASE}/repos/{gh.repo}/git/trees/{ref}",
            headers=_github_headers(gh.token),
            timeout=30,
        )
        if resp.status_code != 200:
            raise RuntimeError(
                f"Listing {PR_POSTS_DIR}: tree {ref} is HTTP {resp.status_code}"
            )
        body = resp.json()
        if body.get("truncated"):
            raise RuntimeError(f"Listing {PR_POSTS_DIR}: tree {ref} is truncated")
        return body

    ref = GISTS_BRANCH
    for component in PR_POSTS_DIR.split("/"):
        entry = next(
            (item for item in fetch_tree(ref).get("tree", [])
             if item["path"] == component),
            None,
        )
        if entry is None:
            return []  # the directory genuinely does not exist yet
        if entry.get("type") != "tree":
            raise RuntimeError(f"Listing {PR_POSTS_DIR}: {component} is not a tree")
        ref = entry["sha"]
    return sorted(
        item["path"] for item in fetch_tree(ref).get("tree", [])
        if item["path"].startswith("PR-")
    )


def read_post(gh: GitHub, name: str) -> dict | None:
    doc, _ = read_news_file(f"{PR_POSTS_DIR}/{name}", gh.token, *gh.repo.split("/"))
    return doc


def read_state(gh: GitHub) -> dict | None:
    doc, _ = read_news_file(STATE_PATH, gh.token, *gh.repo.split("/"))
    return doc


def delivery_state(doc: dict) -> str | None:
    return (doc.get("delivery") or {}).get("state")


def due_posts(gh: GitHub, names: list, sha: str) -> tuple:
    """(due, stuck): saved posts whose merge commit is an ancestor of sha,
    ordered by merged_at. A post left at "attempt" is unknown: it is stuck and
    waits for a person, it is never resent automatically."""
    due, stuck = [], []
    for name in names:
        doc = read_post(gh, name)
        if not doc:
            continue
        state = delivery_state(doc)
        if state == "done":
            continue
        if state == "attempt":
            stuck.append(name)
            continue
        if is_ancestor(gh, doc.get("merge_commit_sha"), sha):
            due.append(doc)
    due.sort(key=lambda d: (d.get("merged_at") or "", d["pr_number"]))
    return due, stuck


# ── Sending ──────────────────────────────────────────────────────────


def download_image(url: str) -> bytes:
    resp = requests.get(url, timeout=30)
    if resp.status_code != 200:
        raise ValueError(f"image HTTP {resp.status_code}")
    if "image" not in resp.headers.get("content-type", ""):
        raise ValueError(f"image is {resp.headers.get('content-type', '')}")
    return resp.content


def send_post(gh: GitHub, doc: dict, webhook: str, deployed_at: str, deploy_sha: str) -> str:
    """Claim, send and record one post. Returns done, failed or stuck."""
    name = f"PR-{doc['pr_number']}.json"
    path = f"{PR_POSTS_DIR}/{name}"
    owner, repo = gh.repo.split("/")

    def claim(current):
        if current is None:
            return None  # deleted meanwhile (a none-tier regeneration): stay gone
        if delivery_state(current) in ("done", "attempt"):
            return None
        return {
            **current,
            "delivery": {"state": "attempt", "run": RUN, "at": iso(now()),
                         "claim": CLAIM_ID},
            # The gate metadata is claimed WITH the attempt, so a settled
            # send keeps it even when the result write never lands.
            "deployed_at": deployed_at,
            "deploy_sha": deploy_sha,
        }

    outcome, claimed = update_news_file(
        path, claim, gh.token, f"news: attempt PR #{doc['pr_number']} post",
        owner=owner, repo=repo,
    )
    if outcome == "skipped":
        return "skipped"
    if outcome != "landed":
        print(f"  {name}: could not claim the post")
        return "stuck"

    # Send exactly the claimed document: a regeneration that landed between
    # the listing and the claim changes what Discord gets, never a split
    # between the sent text and the recorded one.
    sending = claimed or doc

    # The picture is fetched BEFORE the webhook: any failure here, transport
    # errors included, provably means nothing was sent, so it is "failed".
    try:
        image = download_image(sending["image_url"])
    except (ValueError, requests.RequestException) as error:
        state, detail = "failed", {"error": str(error)[:300]}
        image = None
    if image is not None:
        files = {
            "payload_json": (None, json.dumps({"content": sending["message"]}), "application/json"),
            "files[0]": ("image.jpg", image, "image/jpeg"),
        }
        try:
            resp = post_discord_webhook(webhook, files=files)
            if resp.status_code in (200, 201, 204):
                message_id = None
                try:
                    message_id = resp.json().get("id")
                except ValueError:
                    pass
                state, detail = "done", {"discord": message_id}
            elif 400 <= resp.status_code < 500:
                state, detail = "failed", {"error": f"HTTP {resp.status_code} {resp.text[:200]}"}
            else:
                state, detail = "attempt", {"error": f"HTTP {resp.status_code}"}
        except requests.RequestException as error:
            # A transport error after the request left (a read timeout
            # included) cannot prove non-delivery: unknown, for a person.
            state, detail = "attempt", {"error": str(error)[:300]}

    skip_reason = "preserved"
    quarantined = False

    def record(current):
        nonlocal skip_reason, quarantined
        if current is None:
            skip_reason = "missing"  # deleted meanwhile: a person must look at this
            return None
        delivery = current.get("delivery") or {}
        # Only ever overwrite THIS run's own untouched claim. A person's
        # settlement (done, or marked anything), another sender's claim, and
        # any record carrying a Discord message id all win over our result.
        own_claim = (
            delivery.get("state") == "attempt"
            and delivery.get("claim") == CLAIM_ID
            and not delivery.get("marked")
            and not delivery.get("discord")
            # A quarantine this run already wrote (its PUT response lost) is
            # NOT a claim to overwrite: only a person lifts a quarantine.
            and not delivery.get("replaced")
        )
        if not own_claim:
            # A delete-and-recreate under us leaves a fresh PENDING record.
            # If our webhook may have delivered, that record must never be
            # resent automatically: quarantine it for a person, durably.
            if state in ("done", "attempt") and not delivery:
                quarantined = True
                return {
                    **current,
                    "delivery": {
                        "state": "attempt",
                        "run": RUN,
                        "at": iso(now()),
                        "claim": CLAIM_ID,
                        "replaced": True,
                        "error": "the record was replaced after the send; "
                                 "the outcome is unknown",
                    },
                }
            return None
        entry = {
            "state": state,
            "run": RUN,
            "at": iso(now()),
            "claim": CLAIM_ID,
            **{k: v for k, v in detail.items() if v is not None},
        }
        doc_out = {**current, "delivery": entry, "deployed_at": deployed_at,
                   "deploy_sha": deploy_sha}
        if state == "done":
            doc_out["sent_at"] = entry["at"]
        return doc_out

    outcome, _ = update_news_file(
        path, record, gh.token, f"news: {state} PR #{doc['pr_number']} post",
        owner=owner, repo=repo,
    )
    if outcome == "skipped":
        # The record changed under us in a way a person must read (settled or
        # carrying a message id): leave it exactly as it is. But if the record
        # is GONE after a webhook that may have delivered, there is no durable
        # result at all: that is stuck, not settled.
        if skip_reason == "missing" and state in ("done", "attempt"):
            return "stuck"
        return "settled"
    if quarantined or outcome != "landed" or state == "attempt":
        return "stuck"
    return state


# ── Commands ─────────────────────────────────────────────────────────


def run() -> None:
    print("=== Deploy posts ===")
    token = get_env("GITHUB_TOKEN")
    webhook = get_env("DISCORD_REALTIME_WEBHOOK_URL")
    repo = os.environ.get("REPO_FULL_NAME") or get_env("GITHUB_REPOSITORY")
    gh = GitHub(token, repo)

    state = read_state(gh)
    names = list_pr_posts(gh)

    # A post left at "attempt" is an unresolved send: the run stays red until
    # a person settles it, no matter what the gate is doing. The directory is
    # re-enumerated on every check: an attempt created after the first
    # listing is just as unresolved.
    def stuck_names() -> list:
        return [
            name for name in list_pr_posts(gh)
            if delivery_state(read_post(gh, name) or {}) == "attempt"
        ]

    def fail_if_stuck() -> None:
        stuck = stuck_names()
        if stuck:
            sys.exit(
                f"Not delivered: {', '.join(stuck)}. A stuck post may have gone out: "
                f"check the Discord channel, then run `deploy_posts.py mark PR-N done|failed`."
            )

    # Bootstrap BEFORE any gate work: no state and no saved posts means only
    # pre-change PRs exist, and those already went out at merge. Park the
    # cursor at the current production head and stop - no gate passed, so no
    # last_deployed evidence is invented. A state file that appears meanwhile
    # is kept.
    if state is None and not names:
        head = production_head(gh)
        outcome, _ = update_news_file(
            STATE_PATH,
            lambda current: None if current else {"last_gated_sha": head},
            token,
            "news: bootstrap deploy posts",
            *repo.split("/"),
        )
        if outcome == "gave up":
            sys.exit("Could not write the bootstrap cursor: the state is not durable")
        if outcome == "landed":
            print(f"  Bootstrapped at {head[:8]}: nothing to send")
        else:
            print("  A state landed meanwhile: kept")
        fail_if_stuck()
        return

    event_sha = os.environ.get("EVENT_HEAD_SHA")
    event_conclusion = os.environ.get("EVENT_CONCLUSION")

    candidate = None
    deployed_at = None
    fresh_gate = False  # the cursor advances only on a gate that passed NOW
    if event_sha:
        if event_conclusion != "success":
            print(f"  Deploy run concluded {event_conclusion}: waiting for a success")
            fail_if_stuck()
            return
        gate = evaluate_gate(gh, event_sha, now())
        print(f"  Gate for {event_sha[:8]}: {gate['reason']}")
        if gate["ok"]:
            candidate, deployed_at, fresh_gate = event_sha, gate["deployed_at"], True
    else:
        # Cron reconciliation: the newest production commit whose gate passes,
        # down to the cursor; then the retained last deploy carries late posts.
        stop_at = (state or {}).get("last_gated_sha")
        shas = production_commits(gh, stop_at)
        if stop_at and not (state or {}).get("last_deployed"):
            # A bootstrap cursor was parked without gate evidence: it gets its
            # one evaluation now, so a post saved late for a merge it carries
            # is not held back forever.
            shas.append(stop_at)
        for sha in shas:
            if not deploy_evidence(gh, sha):
                continue
            gate = evaluate_gate(gh, sha, now())
            print(f"  Gate for {sha[:8]}: {gate['reason']}")
            if gate["ok"]:
                candidate, deployed_at, fresh_gate = sha, gate["deployed_at"], True
                break
        if not candidate and (state or {}).get("last_deployed"):
            retained = state["last_deployed"]
            print(f"  No new deploy: reconciling against {retained['sha'][:8]}")
            candidate, deployed_at = retained["sha"], retained["at"]

    if not candidate:
        print("  Nothing settled to send against")
        fail_if_stuck()
        return

    due, stuck = due_posts(gh, names, candidate)
    print(f"  {len(due)} posts due, {len(stuck)} stuck")
    outcomes = {}
    for index, doc in enumerate(due):
        if index:
            time.sleep(SEND_DELAY)
        print(f"  Sending PR #{doc['pr_number']}...")
        outcomes[f"PR-{doc['pr_number']}"] = send_post(
            gh, doc, webhook, deployed_at, candidate
        )
    for name in stuck:
        outcomes[name] = "stuck"

    # The cursor only advances, and only on a gate that passed now (never on a
    # retained sweep, never backwards). The forward-only check runs against
    # the FRESH state on every write attempt, so a concurrent run that moved
    # the cursor further is never dragged back. A gate that passed AT the
    # cursor is still written when its evidence was never retained (a
    # bootstrap cursor), so the retained sweep can carry late posts.
    if fresh_gate and (
        candidate != (state or {}).get("last_gated_sha")
        or not (state or {}).get("last_deployed")
    ):
        if not (state or {}).get("last_gated_sha") or is_ancestor(
            gh, state["last_gated_sha"], candidate
        ):
            def advance(current):
                head = (current or {}).get("last_gated_sha")
                if head and head != candidate and not is_ancestor(gh, head, candidate):
                    return None  # a concurrent run settled further: keep theirs
                return {
                    **(current or {}),
                    "last_gated_sha": candidate,
                    "last_deployed": {"sha": candidate, "at": deployed_at},
                }

            cursor_outcome, _ = update_news_file(
                STATE_PATH,
                advance,
                token,
                f"news: deploy posts cursor {candidate[:8]}",
                *repo.split("/"),
            )
            if cursor_outcome == "gave up":
                sys.exit(
                    "Could not persist the deploy cursor: the retained deploy "
                    "evidence may be lost, so the run is red for a person to check"
                )
            # "skipped" means a concurrent run settled further: theirs wins.

    for name, outcome in outcomes.items():
        print(f"  {name}: {outcome}")
    problems = [n for n, o in outcomes.items() if o in ("failed", "stuck")]
    if problems:
        sys.exit(
            f"Not delivered: {', '.join(problems)}. A stuck post may have gone out: "
            f"check the Discord channel, then run `deploy_posts.py mark PR-N done|failed`."
        )
    # However the sends went, an attempt left anywhere (a claim a concurrent
    # run lost, a skipped write) makes the run red for a person.
    fail_if_stuck()
    print("\n=== Done ===")


def mark(name: str, state: str) -> None:
    """A person settles a stuck post: done when they found it, failed to retry."""
    token = get_env("GITHUB_TOKEN")
    repo = os.environ.get("REPO_FULL_NAME") or get_env("GITHUB_REPOSITORY")
    gh = GitHub(token, repo)
    filename = name if name.endswith(".json") else f"{name}.json"
    doc = read_post(gh, filename)
    if not doc:
        sys.exit(f"No saved post for {name}")
    if delivery_state(doc) != "attempt":
        sys.exit(f"{name} is {delivery_state(doc) or 'pending'}, not attempt: nothing to settle")

    def build(latest):
        # Every guard and the whole entry are rebuilt from the FRESH read on
        # each attempt: a message id that landed meanwhile must still block
        # "failed", and no field of the newer record is lost.
        if delivery_state(latest or {}) != "attempt":
            return None
        delivery = (latest or {}).get("delivery") or {}
        if state == "failed" and delivery.get("discord"):
            sys.exit(
                f"Discord message {delivery['discord']} went out: "
                "check the channel, then mark done"
            )
        entry = {
            **delivery,
            "state": state,
            "run": RUN,
            "at": iso(now()),
            "marked": True,
        }
        out = {**(latest or doc), "delivery": entry}
        if state == "done" and not out.get("sent_at"):
            out["sent_at"] = entry["at"]
        return out

    outcome, _ = update_news_file(
        f"{PR_POSTS_DIR}/{filename}", build, token, f"news: mark {name} {state}",
        *repo.split("/"),
    )
    if outcome != "landed":
        sys.exit("The record changed meanwhile; run mark again")
    print(f"{name}: marked {state}")


def main() -> None:
    args = sys.argv[1:]
    if args == ["run"]:
        run()
    elif len(args) == 3 and args[0] == "mark" and args[2] in ("done", "failed"):
        mark(args[1], args[2])
    else:
        sys.exit(__doc__)


if __name__ == "__main__":
    main()
