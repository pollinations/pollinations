import json
import subprocess
import sys
from pathlib import Path


def ensure_safe_env(env: str) -> str:
    if env != "staging":
        print(
            f"❌ Unsupported env: {env}. This branch is locked to staging and cannot write to production.",
            file=sys.stderr,
        )
        sys.exit(1)
    return env


def run_d1_query(query: str, env: str = "staging") -> list[dict] | None:
    """Run a D1 query and return results."""
    env = ensure_safe_env(env)
    cmd = [
        "npx",
        "wrangler",
        "d1",
        "execute",
        "DB",
        "--remote",
        "--env",
        env,
        "--command",
        query,
        "--json",
    ]

    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            cwd=Path(__file__).resolve().parents[3],
            timeout=120,
        )

        if result.returncode != 0:
            print(f"❌ D1 query failed: {result.stderr}", file=sys.stderr)
            return None

        data = json.loads(result.stdout)
        return data[0].get("results", [])

    except subprocess.TimeoutExpired:
        print("❌ D1 query timed out", file=sys.stderr)
        return None
    except (json.JSONDecodeError, KeyError, IndexError) as error:
        print(f"❌ Failed to parse D1 response: {error}", file=sys.stderr)
        return None
