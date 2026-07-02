"""No plaintext data/secrets tracked; no cross-app references in code. Guards every later task."""
import json, os, subprocess

APP = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
REPO = os.path.join(APP, "..", "..", "..")
REL_TREASURY = "apps/operation/treasury"
REL_SECRETS = "apps/operation/secrets"
REL_TINYBIRD = "apps/operation/tinybird"

def _tracked():
    out = subprocess.run(
        ["git", "ls-files", REL_TREASURY, REL_SECRETS, REL_TINYBIRD],
        capture_output=True, text=True, cwd=REPO
    )
    return [p for p in out.stdout.splitlines() if p.strip()]

def test_no_data_files_tracked():
    allowed_json = {
        f"{REL_SECRETS}/env.json",
        f"{REL_SECRETS}/credits.json",
        f"{REL_TREASURY}/config.json",
        f"{REL_TREASURY}/web/package.json",
        f"{REL_TREASURY}/web/package-lock.json",
        f"{REL_TREASURY}/web/tsconfig.json",
    }
    for p in _tracked():
        assert not p.endswith(".csv"), f"CSV tracked: {p}"
        assert not p.endswith(".pdf"), f"PDF tracked: {p}"
        if p.endswith(".json") and "/fixtures/" not in p:
            assert p in allowed_json, f"unexpected JSON tracked: {p}"
        if "/fixtures/" in p:
            assert p.endswith("_synthetic.json"), f"fixture not marked synthetic: {p}"

def test_secrets_are_encrypted():
    ops_secrets = os.path.join(APP, "..", "secrets")
    for name in ("env.json", "credits.json"):
        p = os.path.join(ops_secrets, name)
        if os.path.exists(p):
            assert "sops" in json.load(open(p)), f"{name} is NOT sops-encrypted"

def test_no_cross_app_paths_in_code():
    # patterns split so this file's own source doesn't self-trigger
    banned = [
        "operation/" + "kpi",
        "operation/" + "finance",
        "gen.pollinations.ai/" + "secrets",
        "enter.pollinations.ai/" + "secrets",
    ]
    for root, _, files in os.walk(APP):
        if any(s in root for s in ("node_modules", "__pycache__", ".git", "tests")):
            continue
        for f in files:
            if f.endswith((".py", ".sh", ".ts", ".js")) and f != "PLAN.md":
                src = open(os.path.join(root, f), errors="ignore").read()
                for b in banned:
                    assert b not in src, f"{f} references {b}"
