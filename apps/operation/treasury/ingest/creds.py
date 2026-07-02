"""The ONLY env boundary. Treasury reads no other app's secrets — by design."""
import json, os, subprocess

APP = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OPS_SECRETS = os.path.join(os.path.dirname(APP), "secrets")

def _sops_decrypt(path):
    out = subprocess.run(["sops", "-d", path], capture_output=True, text=True, timeout=30)
    if out.returncode != 0:
        raise RuntimeError(f"sops decrypt failed for {os.path.basename(path)}: {out.stderr.strip()[:200]}")
    return json.loads(out.stdout)

def load_creds():
    c = _sops_decrypt(os.path.join(OPS_SECRETS, "env.json"))
    c.update({k: os.environ[k] for k in c if k in os.environ})
    return c

def load_config():
    c = json.load(open(os.path.join(APP, "config.json")))
    c["archive_dir"] = os.path.expanduser(c["archive_dir"])
    return c

def load_credits():
    return _sops_decrypt(os.path.join(OPS_SECRETS, "credits.json"))
