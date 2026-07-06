"""The ONLY env boundary. Forager reads its own secrets/ (ops age key)
and no other app's secrets by design."""

import json
import os
import subprocess

APP = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SECRETS_DIR = os.path.join(APP, "secrets")


def _sops_decrypt(path):
    out = subprocess.run(
        ["sops", "-d", path], capture_output=True, text=True, timeout=30
    )
    if out.returncode != 0:
        raise RuntimeError(
            f"sops decrypt failed for {os.path.basename(path)}: {out.stderr.strip()[:200]}"
        )
    return json.loads(out.stdout)


def load_creds():
    c = _sops_decrypt(os.path.join(SECRETS_DIR, "env.json"))
    c.update({k: os.environ[k] for k in c if k in os.environ})
    return c


def load_config():
    with open(os.path.join(APP, "config.json")) as f:
        return json.load(f)
