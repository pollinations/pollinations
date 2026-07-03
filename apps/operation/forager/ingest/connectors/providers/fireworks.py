"""Fireworks balance connector via firectl CLI.

Lists accounts with `firectl account list --api-key … --output json`, then
fetches each account's balance with `firectl account get --api-key … --account-id …`.

Account split:
  - Accounts whose IDs appear in FIREWORKS_PREPAID_ACCOUNT_IDS (comma-separated;
    default "pollinations") are counted as prepaid (top-up) balance.
  - All other accounts are counted as grant (left_usd).

Keys:
  FIREWORKS_API_KEY            — API key for firectl
  FIREWORKS_PREPAID_ACCOUNT_IDS — comma-separated prepaid account IDs (default "pollinations")

Security: --api-key value is never echoed in exception messages.
"""
import json
import re
import subprocess

from . import _brow

_BALANCE_RE = re.compile(r"Balance:\s*USD\s*([\d.]+)")


def _account_ids(key, run_cmd):
    """List all account IDs for the given API key via firectl."""
    r = run_cmd(
        ["firectl", "account", "list", "--api-key", key, "--output", "json"],
        capture_output=True, text=True, timeout=45,
    )
    if r.returncode != 0:
        # Strip key from any error text
        err = (r.stderr or r.stdout or "firectl account list failed")[:160]
        raise RuntimeError(err.replace(key, "<key>"))
    try:
        d = json.loads(r.stdout)
    except (ValueError, TypeError):
        raise RuntimeError("firectl account list returned non-JSON output")
    accounts = d.get("accounts") if isinstance(d, dict) else d
    ids = []
    for a in (accounts or []):
        name = (a.get("name") or "").strip()
        if name.startswith("accounts/"):
            ids.append(name.split("/", 1)[1])
    return ids


def _account_balance(key, account_id, run_cmd):
    """Fetch balance for one account ID via `firectl account get`."""
    r = run_cmd(
        ["firectl", "account", "get", "--api-key", key, "--account-id", account_id],
        capture_output=True, text=True, timeout=45,
    )
    if r.returncode != 0:
        err = (r.stderr or r.stdout or "firectl account get failed")[:160]
        raise RuntimeError(err.replace(key, "<key>"))
    m = _BALANCE_RE.search(r.stdout)
    if not m:
        raise RuntimeError(f"no Balance line in firectl account get for {account_id}")
    return round(float(m.group(1)), 2)


def balance(creds, now, run_cmd=subprocess.run):
    """Fetch Fireworks balance across all accounts.

    Args:
        creds:   dict with FIREWORKS_API_KEY (and optionally FIREWORKS_PREPAID_ACCOUNT_IDS)
        now:     run_at timestamp string "YYYY-MM-DD HH:MM:SS"
        run_cmd: injectable subprocess.run replacement (for testing)

    Returns:
        balances row dict with prepaid_left_usd and left_usd set
    """
    key = creds.get("FIREWORKS_API_KEY")
    if not key:
        raise RuntimeError("FIREWORKS_API_KEY missing")

    prepaid_ids = set(
        (creds.get("FIREWORKS_PREPAID_ACCOUNT_IDS") or "pollinations").split(",")
    )

    ids = _account_ids(key, run_cmd)
    if not ids:
        raise RuntimeError("no Fireworks accounts found for configured API key")

    prepaid_total = 0.0
    grant_total = 0.0
    for acct in ids:
        bal = _account_balance(key, acct, run_cmd)
        if acct in prepaid_ids:
            prepaid_total += bal
        else:
            grant_total += bal

    return _brow(
        now,
        "fireworks",
        left=round(grant_total, 2),
        prepaid=round(prepaid_total, 2),
        source="cli",
    )
