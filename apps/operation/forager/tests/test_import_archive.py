"""Hermetic tests for --import-archive mode in ingest.run.

No network, no SOPS, no real TB calls.
Run: cd apps/operation/forager && python3 -m pytest tests/test_import_archive.py -v
"""
import hashlib
import os
import sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import ingest.creds as creds_mod
import ingest.invoices.extract as extract_mod
from ingest.run import import_archive, rebuild_archive_invoices


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _write_pdf(path, content=b"%PDF-1.4 fake"):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "wb") as f:
        f.write(content)
    return hashlib.sha256(content).hexdigest()


class RecordingTB:
    """Stub TB that records appended rows and returns a preset known-sha list."""

    def __init__(self, known_shas=None):
        self._known_shas = known_shas or []
        self.appended = []  # list of (datasource, rows) tuples

    def sql(self, query):
        # Simulate SELECT sha256 FROM invoices
        return [{"sha256": s} for s in self._known_shas]

    def append(self, ds, rows):
        self.appended.append((ds, list(rows)))
        return {"successful_rows": len(rows)}


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

def test_import_archive_pushes_new_pdfs(monkeypatch, tmp_path):
    """Two PDFs in two different month dirs → both get pushed (extract_and_push called twice)."""
    # Create month dirs with one PDF each
    sha1 = _write_pdf(str(tmp_path / "2026-05" / "google_2026-05-01_aabbccdd_invoice.pdf"))
    sha2 = _write_pdf(str(tmp_path / "2026-06" / "azure_2026-06-01_eeff0011_invoice.pdf"),
                      b"%PDF-1.4 azure")

    cfg = {
        "archive_dir": str(tmp_path),
        "tb_ops_api": "https://fake.tinybird.co",
        "fx_eur_usd": 1.14,
    }

    push_log = []

    def fake_extract_and_push(tb_ops, path, slug, category, msgid, source,
                               config, today, billing_map=None):
        push_log.append({"path": path, "slug": slug, "msgid": msgid, "source": source})

    monkeypatch.setattr(extract_mod, "extract_and_push", fake_extract_and_push)
    monkeypatch.setattr(extract_mod, "sha256", lambda p: hashlib.sha256(open(p, "rb").read()).hexdigest())
    monkeypatch.setattr(creds_mod, "_sops_decrypt", lambda p: {"pools": []})
    monkeypatch.setattr(creds_mod, "load_credits", lambda: {"pools": []})
    monkeypatch.setattr(extract_mod, "_build_billing_map", lambda credits: {})

    tb = RecordingTB(known_shas=[])
    counts = import_archive(cfg, tb, "2026-07-03")

    assert counts["pushed"] == 2, f"expected 2 pushed, got {counts['pushed']}"
    assert counts["dup_sha"] == 0
    slugs = {entry["slug"] for entry in push_log}
    assert "google" in slugs
    assert "azure" in slugs


def test_import_archive_skips_known_sha(monkeypatch, tmp_path):
    """A PDF whose sha256 is already in TB is skipped without pushing."""
    content = b"%PDF-1.4 dup"
    known_sha = hashlib.sha256(content).hexdigest()
    _write_pdf(str(tmp_path / "2026-05" / "google_2026-05-01_aabbccdd_invoice.pdf"), content)

    cfg = {
        "archive_dir": str(tmp_path),
        "tb_ops_api": "https://fake.tinybird.co",
        "fx_eur_usd": 1.14,
    }

    push_log = []

    def fake_extract_and_push(*a, **kw):
        push_log.append(True)

    monkeypatch.setattr(extract_mod, "extract_and_push", fake_extract_and_push)
    monkeypatch.setattr(extract_mod, "sha256", lambda p: hashlib.sha256(open(p, "rb").read()).hexdigest())
    monkeypatch.setattr(creds_mod, "_sops_decrypt", lambda p: {"pools": []})
    monkeypatch.setattr(creds_mod, "load_credits", lambda: {"pools": []})
    monkeypatch.setattr(extract_mod, "_build_billing_map", lambda credits: {})

    tb = RecordingTB(known_shas=[known_sha])
    counts = import_archive(cfg, tb, "2026-07-03")

    assert counts["pushed"] == 0, "should not push duplicate"
    assert counts["dup_sha"] == 1, "should count 1 dup"
    assert not push_log, "extract_and_push must not be called for known sha"


def test_import_archive_in_run_dedup(monkeypatch, tmp_path):
    """Two PDFs with identical content in different month dirs → only first is pushed."""
    content = b"%PDF-1.4 same"
    _write_pdf(str(tmp_path / "2026-05" / "google_2026-05-01_aabb1111_invoice.pdf"), content)
    _write_pdf(str(tmp_path / "2026-06" / "azure_2026-06-01_ccdd2222_invoice.pdf"), content)

    cfg = {
        "archive_dir": str(tmp_path),
        "tb_ops_api": "https://fake.tinybird.co",
        "fx_eur_usd": 1.14,
    }

    push_log = []

    def fake_extract_and_push(*a, **kw):
        push_log.append(True)

    monkeypatch.setattr(extract_mod, "extract_and_push", fake_extract_and_push)
    monkeypatch.setattr(extract_mod, "sha256", lambda p: hashlib.sha256(open(p, "rb").read()).hexdigest())
    monkeypatch.setattr(creds_mod, "_sops_decrypt", lambda p: {"pools": []})
    monkeypatch.setattr(creds_mod, "load_credits", lambda: {"pools": []})
    monkeypatch.setattr(extract_mod, "_build_billing_map", lambda credits: {})

    tb = RecordingTB(known_shas=[])
    counts = import_archive(cfg, tb, "2026-07-03")

    assert counts["pushed"] == 1, f"only 1 should push (in-run dedup), got {counts['pushed']}"
    assert counts["dup_sha"] == 1


def test_rebuild_archive_invoices_returns_unique_rows(monkeypatch, tmp_path):
    """Fresh rebuild creates rows in memory and sha-dedups before Tinybird replace."""
    content = b"%PDF-1.4 same"
    _write_pdf(str(tmp_path / "2026-05" / "google_2026-05-01_aabb1111_invoice.pdf"), content)
    _write_pdf(str(tmp_path / "2026-06" / "google_2026-06-01_ccdd2222_invoice.pdf"), content)

    cfg = {
        "archive_dir": str(tmp_path),
        "tb_ops_api": "https://fake.tinybird.co",
        "fx_eur_usd": 1.14,
    }

    def fake_build_row(path, slug, category, msgid, source, config, today,
                       billing_map=None, file_hash=None, creds=None):
        return {
            "sha256": file_hash,
            "provider": slug,
            "category": category,
            "kind": "monthly_bill",
            "period_month": "2026-05",
            "amount": 12.0,
            "currency": "USD",
            "invoice_number": "INV-1",
            "issued_at": "2026-05-01",
            "source": source,
            "file_ref": path,
            "status": "parsed",
            "ingested_at": "2026-07-03 12:00:00",
            "credit_usd": 0.0,
        }

    monkeypatch.setattr(extract_mod, "build_row", fake_build_row)
    monkeypatch.setattr(creds_mod, "load_credits", lambda: {"pools": []})
    monkeypatch.setattr(creds_mod, "load_creds", lambda: {})
    monkeypatch.setattr(extract_mod, "_build_billing_map", lambda credits: {})

    rows, stats = rebuild_archive_invoices(cfg, "2026-07-03")

    assert len(rows) == 1
    assert stats["scanned"] == 2
    assert stats["rebuilt"] == 1
    assert stats["dup_sha"] == 1
    assert stats["parsed"] == 1
    assert rows[0]["source"] == "agent"


def test_import_archive_msgid_from_filename(monkeypatch, tmp_path):
    """msgid passed to extract_and_push is the 3rd underscore segment of the filename."""
    _write_pdf(str(tmp_path / "2026-05" / "google_2026-05-01_cafebabe_invoice.pdf"))

    cfg = {
        "archive_dir": str(tmp_path),
        "tb_ops_api": "https://fake.tinybird.co",
        "fx_eur_usd": 1.14,
    }

    captured = {}

    def fake_extract_and_push(tb_ops, path, slug, category, msgid, source,
                               config, today, billing_map=None):
        captured["msgid"] = msgid
        captured["source"] = source

    monkeypatch.setattr(extract_mod, "extract_and_push", fake_extract_and_push)
    monkeypatch.setattr(extract_mod, "sha256", lambda p: hashlib.sha256(open(p, "rb").read()).hexdigest())
    monkeypatch.setattr(creds_mod, "_sops_decrypt", lambda p: {"pools": []})
    monkeypatch.setattr(creds_mod, "load_credits", lambda: {"pools": []})
    monkeypatch.setattr(extract_mod, "_build_billing_map", lambda credits: {})

    tb = RecordingTB(known_shas=[])
    import_archive(cfg, tb, "2026-07-03")

    assert captured.get("msgid") == "cafebabe", (
        f"expected msgid='cafebabe', got {captured.get('msgid')!r}"
    )
    assert captured.get("source") == "email", (
        f"expected source='email', got {captured.get('source')!r}"
    )


def test_import_archive_skips_inbox_dir(monkeypatch, tmp_path):
    """inbox/ directory must not be walked."""
    _write_pdf(str(tmp_path / "inbox" / "google_2026-05-01_aabbccdd_invoice.pdf"))
    _write_pdf(str(tmp_path / "2026-05" / "google_2026-05-01_11223344_invoice.pdf"),
               b"%PDF-1.4 real")

    cfg = {
        "archive_dir": str(tmp_path),
        "tb_ops_api": "https://fake.tinybird.co",
        "fx_eur_usd": 1.14,
    }

    push_log = []

    def fake_extract_and_push(tb_ops, path, *a, **kw):
        push_log.append(path)

    monkeypatch.setattr(extract_mod, "extract_and_push", fake_extract_and_push)
    monkeypatch.setattr(extract_mod, "sha256", lambda p: hashlib.sha256(open(p, "rb").read()).hexdigest())
    monkeypatch.setattr(creds_mod, "_sops_decrypt", lambda p: {"pools": []})
    monkeypatch.setattr(creds_mod, "load_credits", lambda: {"pools": []})
    monkeypatch.setattr(extract_mod, "_build_billing_map", lambda credits: {})

    tb = RecordingTB(known_shas=[])
    counts = import_archive(cfg, tb, "2026-07-03")

    # Only the 2026-05/ PDF should be pushed, not the inbox one
    assert counts["pushed"] == 1
    assert all("inbox" not in p for p in push_log), "inbox PDF must not be pushed"


def test_import_archive_unknown_prefix_goes_through_other(monkeypatch, tmp_path):
    """A file with an unknown prefix slug gets slug='other', category='other' and is still pushed."""
    _write_pdf(str(tmp_path / "2026-05" / "unknownvendor_2026-05-01_deadbeef_invoice.pdf"))

    cfg = {
        "archive_dir": str(tmp_path),
        "tb_ops_api": "https://fake.tinybird.co",
        "fx_eur_usd": 1.14,
    }

    captured = {}

    def fake_extract_and_push(tb_ops, path, slug, category, msgid, source,
                               config, today, billing_map=None):
        captured["slug"] = slug
        captured["category"] = category

    monkeypatch.setattr(extract_mod, "extract_and_push", fake_extract_and_push)
    monkeypatch.setattr(extract_mod, "sha256", lambda p: hashlib.sha256(open(p, "rb").read()).hexdigest())
    monkeypatch.setattr(creds_mod, "_sops_decrypt", lambda p: {"pools": []})
    monkeypatch.setattr(creds_mod, "load_credits", lambda: {"pools": []})
    monkeypatch.setattr(extract_mod, "_build_billing_map", lambda credits: {})

    tb = RecordingTB(known_shas=[])
    import_archive(cfg, tb, "2026-07-03")

    assert captured.get("slug") == "unknownvendor", (
        f"slug should be the raw prefix, got {captured.get('slug')!r}"
    )
    # Category should fall back to "other" for unknown slugs
    assert captured.get("category") == "other", (
        f"category should be 'other' for unknown slug, got {captured.get('category')!r}"
    )
