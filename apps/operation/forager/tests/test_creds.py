"""creds is the ONLY env boundary. Run: cd apps/operation/treasury && python3 -m pytest tests/ -q"""
import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from ingest import creds

def test_config_loads():
    c = creds.load_config()
    assert c["fx_eur_usd"] == 1.14
    assert c["months_start"] == "2026-01"
    assert c["enty_ledger_dir"].endswith("/treasury-invoices/enty-ledger")

def test_env_overrides(monkeypatch):
    monkeypatch.setenv("WISE_API_TOKEN", "from-env")
    monkeypatch.setattr(creds, "_sops_decrypt", lambda p: {"WISE_API_TOKEN": "from-sops", "X": "y"})
    c = creds.load_creds()
    assert c["WISE_API_TOKEN"] == "from-env"
    assert c["X"] == "y"
