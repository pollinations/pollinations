"""Invoice harvest tests. All hermetic — no real gog calls, no network, no SOPS.
Run: cd apps/operation/forager && python3 -m pytest tests/test_harvest.py -q
"""
import json
import os
import sys
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
    assert harvest.classify("billing@enty.io", "invoice")[1] == "admin"
    assert harvest.classify("billing@tele2.ee", "invoice")[1] == "office"
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

    downloaded_paths = []

    original_fake_run = fake_run

    def fake_run_tracking(cmd, **kwargs):
        r = original_fake_run(cmd, **kwargs)
        if "attachment" in cmd:
            out_dir = cmd[cmd.index("--out") + 1]
            name = cmd[cmd.index("--name") + 1]
            downloaded_paths.append(os.path.join(out_dir, name))
        return r

    monkeypatch.setattr("subprocess.run", fake_run_tracking)

    counts = harvest.gmail_sweep(cfg, FakeTB(), "2026-06-15")
    assert counts.get("pushed", 0) == 0
    assert counts.get("dup_sha", 0) == 1
    # Duplicate file must be deleted after the sweep
    assert downloaded_paths, "expected at least one file to be downloaded"
    for p in downloaded_paths:
        assert not os.path.exists(p), f"duplicate file was not deleted: {p}"


# ---------------------------------------------------------------------------
# inbox_sweep: single-agent-call behaviour
# ---------------------------------------------------------------------------

def test_inbox_sweep_extracts_pdf_once_per_file(monkeypatch, tmp_path):
    """inbox_sweep must call the AI extractor exactly once per inbox PDF."""
    import hashlib
    import ingest.invoices.extract as extract_mod
    import ingest.creds as creds_mod

    inbox = tmp_path / "inbox"
    inbox.mkdir()
    fake_pdf_bytes = b"%PDF-1.4 single-parse"
    pdf_path = inbox / "unknown_invoice.pdf"
    pdf_path.write_bytes(fake_pdf_bytes)

    cfg = {
        "gog_account": "test@myceli.ai",
        "archive_dir": str(tmp_path),
        "tb_ops_api": "https://fake.tinybird.co",
        "months_start": "2026/01/01",
        "fx_eur_usd": 1.14,
    }

    extract_calls = []

    def fake_extract_pdf(path, file_hash, slug, category, config, today,
                         provider_slugs=None, creds=None):
        extract_calls.append(path)
        return {
            "provider": "runpod",
            "category": "compute",
            "period_month": "2026-06",
            "amount": 100,
            "currency": "USD",
            "invoice_number": "INV-1",
            "issued_at": "2026-06-15",
            "status": "parsed",
            "credit_usd": 0,
        }

    monkeypatch.setattr(extract_mod, "extract_pdf", fake_extract_pdf)
    monkeypatch.setattr(extract_mod, "sha256", lambda p: hashlib.sha256(open(p, "rb").read()).hexdigest())
    monkeypatch.setattr(extract_mod, "_build_provider_slugs", lambda credits: {})
    monkeypatch.setattr(creds_mod, "_sops_decrypt", lambda p: {"pools": []})

    appended = []

    class FakeTB:
        def sql(self, query):
            return []

        def append(self, ds, rows):
            appended.append((ds, rows))
            return {"successful_rows": len(rows)}

    harvest.inbox_sweep(cfg, FakeTB(), "2026-06-15")

    assert len(extract_calls) == 1, (
        f"extract_pdf called {len(extract_calls)} times for a single PDF; expected 1"
    )
    assert appended[0][0] == "invoices"
    assert appended[0][1][0]["provider"] == "runpod"


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


# ---------------------------------------------------------------------------
# Finding B — vocabulary consistency test
# ---------------------------------------------------------------------------

def test_canonical_slugs_present_in_harvest_and_wise():
    """Canonical slugs must appear in BOTH harvest.PROVIDERS and wise.ALIAS.

    # Canonical source: credits.json pools
    """
    from ingest.connectors import wise

    canonical_slugs = {"vast.ai", "io.net", "ovhcloud", "google", "bytedance", "scaleway"}
    harvest_slugs = {slug for slug, _, _ in harvest.PROVIDERS}
    wise_slugs = set(wise.ALIAS.keys())

    missing_from_harvest = canonical_slugs - harvest_slugs
    missing_from_wise = canonical_slugs - wise_slugs

    assert not missing_from_harvest, (
        f"Canonical slugs missing from harvest.PROVIDERS: {missing_from_harvest}"
    )
    assert not missing_from_wise, (
        f"Canonical slugs missing from wise.ALIAS: {missing_from_wise}"
    )


# ---------------------------------------------------------------------------
# Finding D — daily Gmail query must not include after: clause
# ---------------------------------------------------------------------------

def test_make_queries_daily_uses_newer_than_only():
    """Daily path (since=None) produces queries with newer_than:3d, no after: clause."""
    queries = harvest._make_queries(start="2026/01/01", since=None)
    assert len(queries) == 2
    for q in queries:
        assert "newer_than:3d" in q, f"Expected 'newer_than:3d' in daily query: {q!r}"
        assert "after:" not in q, f"Daily query must not contain 'after:': {q!r}"


def test_make_queries_backfill_uses_after_clause():
    """Backfill path (since set) produces queries with after: and no newer_than:."""
    queries = harvest._make_queries(start="2026/01/01", since="2026/06/01")
    assert len(queries) == 2
    for q in queries:
        assert "after:2026/06/01" in q, f"Expected 'after:2026/06/01' in backfill query: {q!r}"
        assert "newer_than" not in q, f"Backfill query must not contain 'newer_than': {q!r}"
