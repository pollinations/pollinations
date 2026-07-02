"""Invoice harvest tests. All hermetic — no real gog calls, no network, no SOPS.
Run: cd apps/operation/forager && python3 -m pytest tests/test_harvest.py -q
"""
import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from ingest.invoices import harvest


# ---------------------------------------------------------------------------
# Brief-specified tests (verbatim)
# ---------------------------------------------------------------------------

def test_classify_specifics_beat_generics():
    assert harvest.classify("billing@automat-it.com", "Tax Invoice")[0] == "aws"
    assert harvest.classify("Google Workspace <noreply@google.com>", "Invoice")[0] == "google-workspace"
    assert harvest.classify("x@lambdal.com", "receipt")[0] == "lambda"


def test_classify_categories():
    assert harvest.classify("invoice+statements@mail.anthropic.com", "receipt")[1] == "compute"
    assert harvest.classify("billing@tinybird.co", "invoice")[1] == "infra"
    assert harvest.classify("no-reply@deel.com", "payment summary")[1] == "payroll"


def test_invoice_receipt_pair_prefers_invoice():
    pdfs = [{"filename": "Receipt-2876.pdf"}, {"filename": "Invoice-PYGJ-0024.pdf"}]
    assert harvest.pick_primary(pdfs)["filename"].startswith("Invoice")


# ---------------------------------------------------------------------------
# pick_primary: additional edge cases
# ---------------------------------------------------------------------------

def test_pick_primary_single_pdf():
    pdfs = [{"filename": "Receipt-001.pdf"}]
    assert harvest.pick_primary(pdfs)["filename"] == "Receipt-001.pdf"


def test_pick_primary_invoice_wins_regardless_of_order():
    pdfs = [{"filename": "Invoice-A.pdf"}, {"filename": "Receipt-B.pdf"}, {"filename": "other.pdf"}]
    assert harvest.pick_primary(pdfs)["filename"] == "Invoice-A.pdf"


# ---------------------------------------------------------------------------
# safe: sanitize filenames
# ---------------------------------------------------------------------------

def test_safe_strips_bad_chars():
    assert "/" not in harvest.safe("foo/bar baz")
    assert harvest.safe("hello world") == "hello-world"


def test_safe_length_limit():
    assert len(harvest.safe("a" * 100)) <= 60


# ---------------------------------------------------------------------------
# classify: default category
# ---------------------------------------------------------------------------

def test_classify_unknown_returns_other():
    slug, cat = harvest.classify("billing@unknown-vendor.xyz", "payment notice")
    assert slug == "other"
    assert cat == "other"


# ---------------------------------------------------------------------------
# sha256 dedup: sweep skips files already in TB
# ---------------------------------------------------------------------------

def test_gmail_sweep_skips_known_sha(monkeypatch, tmp_path):
    """Files whose sha256 is already in TB are deleted without re-pushing."""
    import hashlib

    # Patch gog to return one email result
    fake_pdf_bytes = b"%PDF-1.4 fake"
    fake_sha = hashlib.sha256(fake_pdf_bytes).hexdigest()

    cfg = {
        "gog_account": "test@myceli.ai",
        "archive_dir": str(tmp_path),
        "tb_ops_api": "https://fake.tinybird.co",
        "months_start": "2026/01/01",
        "fx_eur_usd": 1.14,
    }

    search_result = json.dumps([{
        "id": "msg1234567890",
        "from": "billing@anthropic.com",
        "subject": "Anthropic Invoice",
        "date": "2026-06-01",
    }])

    get_result = json.dumps([{
        "attachmentId": "att001",
        "filename": "Invoice-ANT-001.pdf",
        "mimeType": "application/pdf",
        "size": 1024,
    }])

    import subprocess as sp_mod

    call_log = []

    def fake_run(cmd, **kwargs):
        call_log.append(cmd)
        r = sp_mod.CompletedProcess(cmd, 0)
        if "search" in cmd:
            r.stdout = search_result
            r.stderr = ""
        elif "get" in cmd:
            r.stdout = get_result
            r.stderr = ""
        elif "attachment" in cmd:
            # Simulate gog writing the file
            out_dir = cmd[cmd.index("--out") + 1]
            name = cmd[cmd.index("--name") + 1]
            path = os.path.join(out_dir, name)
            os.makedirs(out_dir, exist_ok=True)
            with open(path, "wb") as f:
                f.write(fake_pdf_bytes)
            r.stdout = ""
            r.stderr = ""
        else:
            r.stdout = ""
            r.stderr = ""
        return r

    monkeypatch.setattr("subprocess.run", fake_run)

    import ingest.creds as creds_mod
    monkeypatch.setattr(creds_mod, "_sops_decrypt", lambda p: {"pools": []})

    # TB returns this sha as already known
    class FakeTB:
        def sql(self, query):
            return [{"sha256": fake_sha}]

        def append(self, ds, rows):
            raise AssertionError("append should not be called for known sha")

    counts = harvest.gmail_sweep(cfg, FakeTB(), "2026-06-15")
    assert counts.get("pushed", 0) == 0
    assert counts.get("dup_sha", 0) == 1


# ---------------------------------------------------------------------------
# inbox_sweep: empty inbox returns zero counts
# ---------------------------------------------------------------------------

def test_inbox_sweep_empty_returns_zeros(monkeypatch, tmp_path):
    inbox = tmp_path / "inbox"
    inbox.mkdir()

    cfg = {
        "gog_account": "test@myceli.ai",
        "archive_dir": str(tmp_path),
        "tb_ops_api": "https://fake.tinybird.co",
        "months_start": "2026/01/01",
        "fx_eur_usd": 1.14,
    }

    class FakeTB:
        def sql(self, query):
            return []

        def append(self, ds, rows):
            return {"successful_rows": len(rows)}

    counts = harvest.inbox_sweep(cfg, FakeTB(), "2026-06-15")
    assert counts["pushed"] == 0
    assert counts["dup_sha"] == 0


import json  # used in test_gmail_sweep_skips_known_sha
