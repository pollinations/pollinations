"""Vast.ai CLI balance connector.

Uses `vastai show user --raw` to fetch the prepaid credit balance.
No API key is passed on the command line (vastai reads ~/.config/vastai/vast_api_key),
so there is no key exposure risk in the subprocess call.

Source: cli
"""
import json
import subprocess

from . import _brow


def balance(creds, now, run_cmd=subprocess.run):
    """Fetch Vast.ai prepaid credit balance via the vastai CLI.

    Args:
        creds:   dict (unused for auth — CLI reads its own config file)
        now:     run_at timestamp string "YYYY-MM-DD HH:MM:SS"
        run_cmd: injectable subprocess.run replacement (for testing)

    Returns:
        balances row dict with prepaid_left_usd set
    """
    try:
        r = run_cmd(["vastai", "show", "user", "--raw"], capture_output=True, text=True, timeout=30)
    except FileNotFoundError:
        raise RuntimeError("vastai CLI not installed (pip install vastai)")

    if r.returncode != 0:
        raise RuntimeError("vastai show user failed (rc=%d)" % r.returncode)

    try:
        d = json.loads(r.stdout)
    except (ValueError, TypeError):
        raise RuntimeError("vastai show user returned non-JSON output")

    if d.get("credit") is None:
        raise RuntimeError("no .credit field in vastai show user response")

    return _brow(
        now,
        "vast.ai",
        prepaid=round(float(d["credit"]), 2),
        source="cli",
    )
