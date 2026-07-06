from ingest.run import splice_rows


def _row(month, provider, credit=1.0):
    return {"month": month, "provider": provider, "currency": "USD",
            "credit": credit, "paid": 0.0, "source": "api"}


def test_splice_replaces_only_in_scope_rows():
    existing = [_row("2026-06", "aws"), _row("2026-07", "aws"), _row("2026-07", "gcp")]
    fresh = [_row("2026-07", "aws", credit=9.9)]
    in_scope = lambda row: row["provider"] == "aws" and row["month"] == "2026-07"
    out = splice_rows(existing, fresh, in_scope)
    assert _row("2026-06", "aws") in out
    assert _row("2026-07", "gcp") in out
    assert _row("2026-07", "aws", credit=9.9) in out
    assert len(out) == 3
