"""Daily ingest → operations workspace.

    python3 -m ingest.run              # daily: refresh non-invoice data planes
    python3 -m ingest.invoices.run     # invoice-only: Gmail + inbox PDF pipeline
    python3 -m ingest.run --skip-revenue  # cost/provider refresh only
    python3 -m ingest.run --backfill-usage  # rebuild usage_monthly only; no invoice AI
    python3 -m ingest.run --backfill   # repull all configured payment months

TOKEN MODEL: three TB instances:
  ops_ingest  — TINYBIRD_OPS_INGEST_TOKEN  → .append() and .sql()
  ops_replace — TINYBIRD_OPS_REPLACE_TOKEN → every .replace() call (needs CREATE scope)
  tb_prod     — TINYBIRD_PROD_READ_TOKEN   → SQL read-only from pollinations_enter prod
"""
import datetime
import concurrent.futures
import inspect
import json
import os
import sys

from . import creds, tb
from .aliases import PROVIDER_ALIASES
from .connectors import registry, wise
from .connectors import usage as _usage
from .connectors.common import months_ytd
from .connectors.providers import _validate_meter_values
from .connectors.providers import stripe as _stripe
from .invoices import harvest
from .invoices import extract as _extract

# Derived fields (amount_usd, month) were dropped from the tables — engines
# still consume them, so the read queries reconstruct them with config fx.
_INV_SQL = (
    "SELECT *, round(if(currency='EUR', amount * {fx}, amount), 6) AS amount_usd "
    "FROM invoices"
)

ALLOWED_CATEGORIES = {
    "compute", "infra", "saas", "admin", "office", "payroll", "other", "unmatched",
}


def load_overrides(ops_ingest):
    """Latest operator override per (scope, key, field) from the overrides datasource."""
    rows = ops_ingest.sql(
        "SELECT scope, key, field, argMax(value_num, entered_at) AS value_num, "
        "argMax(value_str, entered_at) AS value_str FROM overrides GROUP BY scope, key, field"
    )
    return {(r["scope"], r["key"], r["field"]):
            (r["value_num"] if r.get("value_num") is not None else r.get("value_str", ""))
            for r in rows}


def apply_payment_rules(rows, overrides, slug_cat):
    """Re-stamp payment rows via operator counterparty rules.

    An overrides row (scope='payments', key=<counterparty>, field='provider')
    maps every payment from that counterparty to a provider slug; category
    follows the slug's default. A field='category' override maps every payment
    from that counterparty to a category without changing provider. Mutates rows
    in place, returns changed count.
    """
    provider_rules = {
        key: str(val)
        for (scope, key, field), val in overrides.items()
        if scope == "payments" and field == "provider" and val
    }
    category_rules = {
        key: str(val)
        for (scope, key, field), val in overrides.items()
        if scope == "payments" and field == "category" and val
    }
    if not provider_rules and not category_rules:
        return 0
    changed = 0
    for row in rows:
        counterparty = row.get("counterparty", "")
        target_provider = provider_rules.get(counterparty)
        target_category = category_rules.get(counterparty)
        before = (row.get("provider"), row.get("category"))

        if target_provider:
            row["provider"] = target_provider
            row["category"] = slug_cat.get(target_provider, "compute")
        if target_category:
            row["category"] = target_category

        if before != (row.get("provider"), row.get("category")):
            changed += 1
    return changed


def allowed_payment_providers():
    return (
        set(PROVIDER_ALIASES)
        | {provider for provider, _category, _subs in wise.OPS_ALIAS if provider}
        | {""}
    )


def validate_payment_rows(rows):
    providers = allowed_payment_providers()
    for row in rows:
        provider = row.get("provider", "")
        category = row.get("category", "")
        if provider not in providers:
            raise ValueError(f"unknown provider slug for payments: {provider}")
        if category not in ALLOWED_CATEGORIES:
            raise ValueError(f"unknown category for payments: {category}")


def dedupe_invoices(rows):
    """Deduplicate invoice rows per sha256.

    Prefers source='manual' (operator correction) over machine rows, then
    final decisions over review rows. Tie-breaks by latest
    ingested_at (DateTime since 2026-07), then keeps the last-seen row.
    """
    _STATUS_RANK = {
        "parsed": 0,
        "not_invoice": 0,
        "ignored": 0,
        "needs_review": 1,
        "needs_label": 1,
    }

    def _rank(row):
        return (0 if row.get("source") in ("manual", "label") else 1,
                _STATUS_RANK.get(row.get("status", "parsed"), 0))

    best = {}
    for row in rows:
        sha = row["sha256"]
        prev = best.get(sha)
        if (prev is None or _rank(row) < _rank(prev)
                or (_rank(row) == _rank(prev)
                    and row["ingested_at"] >= prev["ingested_at"])):
            best[sha] = row
    return list(best.values())


_SRC_RANK = {"manual": 0, "api": 1, "cli": 2, "bq": 3}


def _next_month(month):
    """Return the YYYY-MM string for the month following `month`."""
    y, m = int(month[:4]), int(month[5:7])
    if m == 12:
        return f"{y + 1:04d}-01"
    return f"{y:04d}-{m + 1:02d}"


def dedupe_meter(rows):
    """One row per (provider, month, funding).

    Manual rows are operator overrides and replace connector values for the
    same provider/month/funding bucket. Ties keep the last-seen row.
    """
    def _rank(row):
        src = row.get("source", "manual")
        return _SRC_RANK.get(src, 99)

    best = {}
    for row in rows:
        key = (row.get("provider", ""), row.get("month", ""),
               row.get("funding", ""))
        prev = best.get(key)
        if prev is None or _rank(row) <= _rank(prev):
            best[key] = row
    return list(best.values())


def validate_meter_rows(rows):
    """Fail before replacing meter_monthly with unknown enum-like values."""
    for row in rows:
        _validate_meter_values(
            row.get("provider", ""),
            row.get("funding", ""),
            row.get("source", ""),
        )


def split_valid_meter_rows(rows):
    """Return valid meter rows and rows rejected by the current vocabulary."""
    valid = []
    invalid = []
    for row in rows:
        try:
            _validate_meter_values(
                row.get("provider", ""),
                row.get("funding", ""),
                row.get("source", ""),
            )
        except ValueError:
            invalid.append(row)
        else:
            valid.append(row)
    return valid, invalid


def _is_month_dir(name):
    if len(name) != 7 or name[4] != "-":
        return False
    year, month = name[:4], name[5:]
    return year.isdigit() and month.isdigit() and 1 <= int(month) <= 12


def import_archive(cfg, ops_ingest, today):
    """One-off import of pre-organized archive month directories.

    Walks <archive_dir>/YYYY-MM/ dirs (skips inbox/), sha256-dedups each *.pdf
    against TB and an in-run seen set, re-derives (slug, category) from the
    filename prefix, then calls the AI extractor with source="email".

    Returns dict of counts: pushed, dup_sha, unknown_prefix.
    """
    archive_dir = cfg["archive_dir"]
    known_shas = {r["sha256"] for r in ops_ingest.sql("SELECT sha256 FROM invoices")}
    seen_this_run: set = set()
    provider_slugs = _extract._build_provider_slugs(creds.load_credits())

    pushed = dup_sha = skipped = unknown_prefix = 0

    try:
        entries = sorted(os.listdir(archive_dir))
    except FileNotFoundError:
        return {"pushed": 0, "dup_sha": 0, "skipped": 0, "unknown_prefix": 0}

    for entry in entries:
        if entry == harvest.VALIDATED_DIR:
            validated_root = os.path.join(archive_dir, entry)
            month_entries = sorted(os.listdir(validated_root))
        elif _is_month_dir(entry):
            validated_root = archive_dir
            month_entries = [entry]
        else:
            continue
        for month_entry in month_entries:
            if not _is_month_dir(month_entry):
                continue
            month_dir = os.path.join(validated_root, month_entry)
            if not os.path.isdir(month_dir):
                continue
            for fname in sorted(os.listdir(month_dir)):
                if not fname.lower().endswith(".pdf"):
                    continue
                path = os.path.join(month_dir, fname)
                file_sha = _extract.sha256(path)
                if file_sha in known_shas or file_sha in seen_this_run:
                    dup_sha += 1
                    continue
                seen_this_run.add(file_sha)

                # Re-derive slug+category from filename prefix.
                parts = os.path.splitext(fname)[0].split("_")
                slug = parts[0].lower() if parts else "other"
                category = harvest._slug_to_category(slug)
                if category == "other" and slug != "other":
                    unknown_prefix += 1
                msgid = parts[2] if len(parts) >= 3 else ""

                row = _extract.extract_and_push(
                    ops_ingest, path, slug, category, msgid, "email",
                    cfg, today, provider_slugs=provider_slugs,
                )
                if row.get("_document_status", "parsed") == "parsed":
                    row.pop("_document_status", None)
                    known_shas.add(file_sha)
                    pushed += 1
                else:
                    skipped += 1
    return {
        "pushed": pushed,
        "dup_sha": dup_sha,
        "skipped": skipped,
        "unknown_prefix": unknown_prefix,
    }


def _archive_pdfs(cfg):
    """Yield archived invoice PDFs as (path, slug, category, msgid)."""
    archive_dir = cfg["archive_dir"]
    try:
        entries = sorted(os.listdir(archive_dir))
    except FileNotFoundError:
        return

    for entry in entries:
        if entry == harvest.VALIDATED_DIR:
            validated_root = os.path.join(archive_dir, entry)
            month_entries = sorted(os.listdir(validated_root))
        elif _is_month_dir(entry):
            validated_root = archive_dir
            month_entries = [entry]
        else:
            continue
        for month_entry in month_entries:
            if not _is_month_dir(month_entry):
                continue
            month_dir = os.path.join(validated_root, month_entry)
            if not os.path.isdir(month_dir):
                continue
            for fname in sorted(os.listdir(month_dir)):
                if not fname.lower().endswith(".pdf"):
                    continue
                path = os.path.join(month_dir, fname)
                parts = os.path.splitext(fname)[0].split("_")
                slug = parts[0].lower() if parts else "other"
                category = harvest._slug_to_category(slug)
                msgid = parts[2] if len(parts) >= 3 else ""
                yield path, slug, category, msgid


def rebuild_archive_invoices(cfg, today):
    """Build one fresh agent row per archived PDF, deduped by sha256."""
    provider_slugs = _extract._build_provider_slugs(creds.load_credits())
    agent_creds = creds.load_creds()
    items = list(_archive_pdfs(cfg))
    seen = set()
    tasks = []
    stats = {
        "scanned": 0,
        "rebuilt": 0,
        "dup_sha": 0,
        "parsed": 0,
        "not_invoice": 0,
        "needs_review": 0,
    }

    total = len(items)
    for idx, (path, slug, category, msgid) in enumerate(items, start=1):
        stats["scanned"] += 1
        file_sha = _extract.sha256(path)
        if file_sha in seen:
            stats["dup_sha"] += 1
            sys.stderr.write(f"  invoice {idx}/{total} dup_sha      {os.path.basename(path)}\n")
            sys.stderr.flush()
            continue
        seen.add(file_sha)
        tasks.append((idx, path, slug, category, msgid, file_sha))

    parallelism = max(1, int(cfg.get("invoice_ai_parallelism", 10)))
    sys.stderr.write(
        f"  rebuilding invoices: {len(tasks)} unique PDFs, "
        f"{stats['dup_sha']} dup_sha, parallelism={parallelism}\n"
    )
    sys.stderr.flush()

    rows_by_idx = {}
    with concurrent.futures.ThreadPoolExecutor(max_workers=parallelism) as executor:
        futures = {
            executor.submit(
                _build_archive_invoice_row,
                task, cfg, today, provider_slugs, agent_creds,
            ): task
            for task in tasks
        }
        for future in concurrent.futures.as_completed(futures):
            idx, path, _slug, _category, _msgid, _file_sha = futures[future]
            row, status = future.result()
            rows_by_idx[idx] = row

            stats["rebuilt"] += 1
            if status in stats:
                stats[status] += 1
            sys.stderr.write(
                f"  invoice {idx}/{total} {status or 'unknown':12} "
                f"{row.get('provider', ''):14} {row.get('period_month', ''):7} "
                f"{os.path.basename(path)} ({stats['rebuilt']}/{len(tasks)} done)\n"
            )
            sys.stderr.flush()

    rows = [
        rows_by_idx[idx]
        for idx, _path, _slug, _category, _msgid, _file_sha in tasks
        if rows_by_idx[idx].get("_document_status", "parsed") == "parsed"
    ]
    for row in rows:
        row.pop("_document_status", None)
    return rows, stats


def _build_archive_invoice_row(task, cfg, today, provider_slugs, agent_creds):
    idx, path, slug, category, msgid, file_sha = task
    try:
        result = _extract.extract_pdf(
            path, file_sha, slug, category, cfg, today,
            provider_slugs=provider_slugs, creds=agent_creds,
        )
        status = _extract.document_status(result)
        row = _extract.build_row(
            path, slug, category, msgid, "agent",
            cfg, today, provider_slugs=provider_slugs,
            file_hash=file_sha, creds=agent_creds, result=result,
        )
        row["_document_status"] = status
        return row, status
    except RuntimeError as e:
        if "pdftoppm failed" not in str(e):
            raise
        result = {
            "provider": slug or "other",
            "category": category or "other",
            "period_month": "",
            "amount": 0,
            "currency": "USD",
            "invoice_number": "unreadable_pdf",
            "issued_at": today,
            "document_status": "needs_review",
            "credit_usd": 0,
        }
        row = _extract.build_row_from_result(path, file_sha, result, "agent", today)
        row["_document_status"] = "needs_review"
        return row, "needs_review"


def reparse_invoices(cfg, ops_ingest, today, dry_run=True):
    """Scan archived PDFs without re-running the once-only AI extractor."""
    fx = cfg.get("fx_eur_usd", 1.14)
    existing = {
        r["sha256"]: r
        for r in dedupe_invoices(ops_ingest.sql(_INV_SQL.format(fx=fx)))
    }

    scanned = known = missing = 0

    for path, slug, category, msgid in _archive_pdfs(cfg):
        scanned += 1
        file_sha = _extract.sha256(path)
        if file_sha in existing:
            known += 1
        else:
            missing += 1
            print(f"{file_sha} missing in invoices; label or import explicitly: {path}")

    return {
        "dry_run": dry_run,
        "scanned": scanned,
        "known": known,
        "missing": missing,
        "changed": 0,
        "parsed": 0,
        "needs_review": 0,
        "appended": 0,
    }


def _sanitize_err(e, creds_dict):
    """Produce a safe error string: type + message, no creds values, max 200 chars.

    Iterates over creds dict VALUES and redacts any that appear in the message.
    Truncates the result to 200 chars.
    """
    msg = type(e).__name__ + ": " + str(e)
    for val in creds_dict.values():
        if val and isinstance(val, str) and len(val) > 3:
            msg = msg.replace(val, "***")
    return msg[:200]


def _run_data_stage(ops_ingest, ops_replace, tb_prod, creds, cfg,
                    today, statuses, notes, overrides=None, skip_revenue=False):
    """Refresh the raw operations planes.

    The P&L burn engine and reconciliation were removed 2026-07-04; crossing the
    raw planes is now a simple minus in the treasury frontend / spend-audit PoC.
    Provider balance/grants snapshots were removed; provider usage is the
    monthly source of truth for manually filled dashboard values.

    Mutates `statuses` dict and `notes` list in place (same objects written to
    ingest_runs by the caller).

    Steps:
      1. Meter connectors  → dedupe + full replace of meter_monthly
         (one row per provider-month-funding; skip on 0 rows or read-back error)
      2. usage.monthly_rows → replace usage_monthly (skip on 0 rows)
      3. stripe.revenue_rows → replace revenue_monthly (skip on 0 rows)
    """
    fx = cfg.get("fx_eur_usd", 1.14)

    # ---- Step 1: meter connectors (collect → dedupe → full replace) ----
    # Connectors re-report the whole YTD window every run, so appending stacks
    # a duplicate snapshot per provider-month each run. Instead: merge fresh
    # rows with the current table (keeps manual entries and last-good values
    # for failed connectors), collapse to one row per (provider, month,
    # funding), and replace. Replace is skipped if the read-back fails — a TB
    # hiccup never wipes manual rows.
    months_ytd_list = months_ytd(cfg["months_start"], today)
    meter_new = []
    for slug, fn in registry.METER:
        try:
            sig = inspect.signature(fn)
            if "fx" in sig.parameters:
                rows = fn(creds, months_ytd_list, today, fx=fx)
            else:
                rows = fn(creds, months_ytd_list, today)
            meter_new.extend(rows or [])
            statuses[f"meter:{slug}"] = "ok"
        except Exception as e:
            statuses[f"meter:{slug}"] = "err:" + _sanitize_err(e, creds)
    try:
        validate_meter_rows(meter_new)
        meter_table = ops_ingest.sql("SELECT * FROM meter_monthly")
        meter_table, invalid_existing = split_valid_meter_rows(meter_table)
        if invalid_existing:
            notes.append(f"meter: dropped {len(invalid_existing)} invalid existing rows")
            statuses["meter_invalid_existing"] = len(invalid_existing)
        meter_merged = dedupe_meter(meter_table + meter_new)
        if meter_merged:
            validate_meter_rows(meter_merged)
            ops_replace.replace("meter_monthly", meter_merged)
            statuses["meter_rows"] = len(meter_merged)
        else:
            notes.append("meter: 0 rows — meter_monthly unchanged")
    except Exception as e:
        statuses["meter"] = "err:" + _sanitize_err(e, creds)
        notes.append(f"meter replace failed: {statuses['meter']}")

    # ---- Step 2: usage_monthly (full replace) ----
    try:
        usage_rows = _usage.monthly_rows(tb_prod, months_ytd_list, today)
        if usage_rows:
            ops_replace.replace("usage_monthly", usage_rows)
            statuses["usage"] = len(usage_rows)
        else:
            notes.append("usage: 0 rows — usage_monthly table unchanged (last good kept)")
            statuses["usage"] = 0
    except Exception as e:
        statuses["usage"] = "err:" + _sanitize_err(e, creds)
        notes.append(f"usage pull failed: {statuses['usage']}")

    # ---- Step 3: revenue_monthly (full replace) ----
    if skip_revenue:
        statuses["revenue"] = "skipped"
    else:
        try:
            revenue_rows = _stripe.revenue_rows(creds, months_ytd_list, today)
            if revenue_rows:
                ops_replace.replace("revenue_monthly", revenue_rows)
                statuses["revenue"] = len(revenue_rows)
            else:
                notes.append("revenue: 0 rows — revenue_monthly table unchanged (last good kept)")
                statuses["revenue"] = 0
        except Exception as e:
            statuses["revenue"] = "err:" + _sanitize_err(e, creds)
            notes.append(f"revenue pull failed: {statuses['revenue']}")

    return


def backfill_usage_monthly(ops_replace, tb_prod, months, today):
    """Rebuild usage_monthly from generation_event without touching invoices."""
    notes = []
    usage_rows = _usage.monthly_rows(tb_prod, months, today)
    statuses = {"usage": len(usage_rows), "months": len(months)}
    if usage_rows:
        ops_replace.replace("usage_monthly", usage_rows)
    else:
        notes.append("usage: 0 rows — usage_monthly table unchanged")
    return statuses, notes


def main():
    backfill = "--backfill" in sys.argv
    usage_backfill = "--backfill-usage" in sys.argv
    skip_revenue = "--skip-revenue" in sys.argv
    import_mode = "--import-archive" in sys.argv
    reparse_mode = "--reparse-invoices" in sys.argv
    dry_run = "--dry-run" in sys.argv
    today = datetime.date.today().isoformat()
    c, cfg = creds.load_creds(), creds.load_config()

    # One token for ingest — see MODULE DOCSTRING
    ops_ingest = tb.TB(cfg["tb_ops_api"], c["TINYBIRD_OPS_INGEST_TOKEN"])

    if reparse_mode or import_mode or dry_run:
        raise SystemExit(
            "Invoice maintenance moved to: python3 -m ingest.invoices.run "
            "[--import-archive | --reparse --dry-run]"
        )

    if usage_backfill:
        all_months = months_ytd(cfg["months_start"], today)
        ops_replace = tb.TB(cfg["tb_ops_api"], c["TINYBIRD_OPS_REPLACE_TOKEN"])
        tb_prod = tb.TB(cfg["tb_prod_api"], c["TINYBIRD_PROD_READ_TOKEN"])
        st, notes = backfill_usage_monthly(ops_replace, tb_prod, all_months, today)
        now = datetime.datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")
        ops_ingest.append("ingest_runs", [{
            "run_at": now,
            "ok": 0 if notes else 1,
            "statuses": json.dumps(st),
            "notes": "; ".join(["backfill-usage"] + notes),
        }])
        print(f"backfill-usage: {st}" + (f"  NOTES: {notes}" if notes else ""))
        return

    # Replace token needed after import-mode returns — see MODULE DOCSTRING
    ops_replace = tb.TB(cfg["tb_ops_api"], c["TINYBIRD_OPS_REPLACE_TOKEN"])

    st, notes = {}, []
    all_months = months_ytd(cfg["months_start"], today)
    win = all_months if backfill else all_months[-cfg["repull_months"]:]

    # 1. Payments (Wise outflows) — per month in window
    try:
        for ym in win:
            rows = wise.outflow_rows(c, [ym])
            if rows:
                validate_payment_rows(rows)
                nxt = _next_month(ym)
                ops_replace.replace(
                    "payments", rows,
                    condition=f"paid_at >= '{ym}-01' AND paid_at < '{nxt}-01'")
            else:
                notes.append(f"wise:{ym}: 0 rows — payments table unchanged")
            st[f"wise:{ym}"] = len(rows)
    except Exception as e:
        # Tradeoff: keep whatever payments are already in the table; failed
        # months self-heal on the next successful run.
        notes.append(f"wise FAILED, months kept: {e}")

    # 3. Shared operator truth
    try:
        overrides = load_overrides(ops_ingest)
    except Exception as e:
        overrides = {}
        notes.append(f"overrides read failed (treated as empty): {e}")

    # 3.5 Operator counterparty rules → re-stamp the whole payments table
    # (history included, so one rule drains the (unmatched) bucket everywhere).
    try:
        if any(s == "payments" and f == "provider" for (s, _k, f) in overrides):
            slug_cat = {slug: cat for slug, cat, _ in harvest.PROVIDERS}
            pay_rows = ops_ingest.sql("SELECT * FROM payments")
            n = apply_payment_rules(pay_rows, overrides, slug_cat)
            if n:
                validate_payment_rows(pay_rows)
                ops_replace.replace("payments", pay_rows)
            st["payment_rules"] = n
    except Exception as e:
        notes.append(f"payment rules failed: {_sanitize_err(e, c)}")

    # 4. Refresh raw planes
    tb_prod = tb.TB(cfg["tb_prod_api"], c["TINYBIRD_PROD_READ_TOKEN"])
    _run_data_stage(
        ops_ingest=ops_ingest,
        ops_replace=ops_replace,
        tb_prod=tb_prod,
        creds=c,
        cfg=cfg,
        today=today,
        statuses=st,
        notes=notes,
        overrides=overrides,
        skip_revenue=skip_revenue,
    )

    # 5. Ingest run log
    now = datetime.datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")
    ops_ingest.append("ingest_runs", [{
        "run_at": now,
        "ok": 0 if notes else 1,
        "statuses": json.dumps(st),
        "notes": "; ".join(notes),
    }])

    print(f"ingested: {st}" + (f"  NOTES: {notes}" if notes else ""))


if __name__ == "__main__":
    main()
