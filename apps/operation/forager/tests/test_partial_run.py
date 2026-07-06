import pytest

from ingest.run import assert_fresh_in_scope, splice_rows


def _row(month, vendor, credit=1.0):
    return {"month": month, "vendor": vendor, "currency": "USD",
            "credit": credit, "paid": 0.0, "source": "api"}


def test_splice_replaces_only_in_scope_rows():
    existing = [_row("2026-06", "aws"), _row("2026-07", "aws"), _row("2026-07", "gcp")]
    fresh = [_row("2026-07", "aws", credit=9.9)]
    in_scope = lambda row: row["vendor"] == "aws" and row["month"] == "2026-07"
    out = splice_rows(existing, fresh, in_scope)
    assert _row("2026-06", "aws") in out
    assert _row("2026-07", "gcp") in out
    assert _row("2026-07", "aws", credit=9.9) in out
    assert len(out) == 3


def test_assert_fresh_in_scope_passes_when_all_in_scope():
    fresh = [_row("2026-07", "aws"), _row("2026-07", "gcp")]
    in_scope = lambda row: row["month"] == "2026-07"
    # No exception, no return value contract — just must not raise.
    assert_fresh_in_scope("meter_monthly", fresh, in_scope)


def test_assert_fresh_in_scope_raises_on_out_of_scope_row():
    fresh = [_row("2026-07", "aws"), _row("2026-06", "gcp")]
    in_scope = lambda row: row["month"] == "2026-07"
    with pytest.raises(RuntimeError) as exc:
        assert_fresh_in_scope("meter_monthly", fresh, in_scope)
    # Error must name the offending datasource and row.
    assert "meter_monthly" in str(exc.value)
    assert "2026-06" in str(exc.value)
    assert "gcp" in str(exc.value)
