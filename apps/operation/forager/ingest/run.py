"""Daily ingest → operations workspace.

    python3 -m ingest.run              # daily: harvest new invoices + repull last N months
    python3 -m ingest.run --backfill   # everything since config.months_start
    python3 -m ingest.run --import-archive  # one-off: push pre-organized YYYY-MM/ month dirs

TOKEN MODEL: three TB instances:
  ops_ingest  — TINYBIRD_OPS_INGEST_TOKEN  → .append() and .sql()
  ops_replace — TINYBIRD_OPS_REPLACE_TOKEN → every .replace() call (needs CREATE scope)
  tb_prod     — TINYBIRD_PROD_READ_TOKEN   → SQL read-only from pollinations_enter prod
"""
import datetime
import inspect
import json
import os
import re
import sys

from . import burn, creds, gaps, tb
from .connectors import registry, wise
from .connectors import usage as _usage
from .connectors.common import months_ytd
from .connectors.providers import stripe as _stripe
from .invoices import harvest
from .invoices import extract as _extract

# Derived fields (amount_usd, month) were dropped from the tables — engines
# still consume them, so the read queries reconstruct them with config fx.
_INV_SQL = "SELECT *, round(if(currency='EUR', amount * {fx}, amount), 6) AS amount_usd FROM invoices"
_PAY_SQL = ("SELECT *, substring(toString(paid_at), 1, 7) AS month, "
            "round(amount_eur * {fx}, 2) AS amount_usd FROM payments")


def load_overrides(ops_ingest):
    """Latest operator override per (scope, key, field) from the overrides datasource."""
    rows = ops_ingest.sql(
        "SELECT scope, key, field, argMax(value_num, entered_at) AS value_num, "
        "argMax(value_str, entered_at) AS value_str FROM overrides GROUP BY scope, key, field"
    )
    return {(r["scope"], r["key"], r["field"]):
            (r["value_num"] if r.get("value_num") is not None else r.get("value_str", ""))
            for r in rows}


def dedupe_invoices(rows):
    """Deduplicate invoice rows per sha256.

    Prefers source='label' (operator correction) over machine rows, then
    status='parsed' over status='needs_label'. Tie-breaks by latest
    ingested_at (DateTime since 2026-07), then keeps the last-seen row.
    """
    # Status preference: parsed/ignored > needs_label (lower = better).
    # 'ignored' only ever appears on source='label' rows, so ranking it with
    # 'parsed' just means the latest operator decision wins between labels.
    _STATUS_RANK = {"parsed": 0, "ignored": 0, "needs_label": 1}

    def _rank(row):
        return (0 if row.get("source") == "label" else 1,
                _STATUS_RANK.get(row["status"], 9))

    best = {}
    for row in rows:
        sha = row["sha256"]
        prev = best.get(sha)
        if (prev is None or _rank(row) < _rank(prev)
                or (_rank(row) == _rank(prev)
                    and row["ingested_at"] >= prev["ingested_at"])):
            best[sha] = row
    return list(best.values())


_MONTH_RE = re.compile(r'^\d{4}-(0[1-9]|1[0-2])$')


def import_archive(cfg, ops_ingest, today):
    """One-off import of pre-organized archive month directories.

    Walks <archive_dir>/YYYY-MM/ dirs (skips inbox/), sha256-dedups each *.pdf
    against TB and an in-run seen set, re-derives (slug, category) from the
    filename prefix, then calls extract_and_push with source="email".

    Returns dict of counts: pushed, dup_sha, unknown_prefix.
    """
    archive_dir = cfg["archive_dir"]
    known_shas = {r["sha256"] for r in ops_ingest.sql("SELECT sha256 FROM invoices")}
    seen_this_run: set = set()
    billing_map = _extract._build_billing_map(creds.load_credits())

    pushed = dup_sha = unknown_prefix = 0

    try:
        entries = sorted(os.listdir(archive_dir))
    except FileNotFoundError:
        return {"pushed": 0, "dup_sha": 0, "unknown_prefix": 0}

    for entry in entries:
        if entry == "inbox" or not _MONTH_RE.match(entry):
            continue
        month_dir = os.path.join(archive_dir, entry)
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

            # Re-derive slug+category from filename prefix: <slug>_<date>_<msgid8>_<origname>
            parts = os.path.splitext(fname)[0].split("_")
            slug = parts[0].lower() if parts else "other"
            category = harvest._slug_to_category(slug)
            if category == "other" and slug != "other":
                # Slug not in PROVIDERS — treat as other/unknown
                unknown_prefix += 1
            msgid = parts[2] if len(parts) >= 3 else ""

            _extract.extract_and_push(
                ops_ingest, path, slug, category, msgid, "email",
                cfg, today, billing_map=billing_map,
            )
            known_shas.add(file_sha)
            pushed += 1

    return {"pushed": pushed, "dup_sha": dup_sha, "unknown_prefix": unknown_prefix}


def _archive_pdfs(cfg):
    """Yield archived invoice PDFs as (path, slug, category, msgid)."""
    archive_dir = cfg["archive_dir"]
    try:
        entries = sorted(os.listdir(archive_dir))
    except FileNotFoundError:
        return

    for entry in entries:
        if entry == "inbox" or not _MONTH_RE.match(entry):
            continue
        month_dir = os.path.join(archive_dir, entry)
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


def reparse_invoices(cfg, ops_ingest, today, dry_run=True):
    """Re-extract archived PDFs and optionally append fresh parsed invoice rows.

    Dry-run prints old/new amount and credit values per changed sha and writes
    nothing. Real mode appends only parsed rows; append-only dedupe keeps labels
    ahead of machine reparses.
    """
    fx = cfg.get("fx_eur_usd", 1.14)
    existing = {
        r["sha256"]: r
        for r in dedupe_invoices(ops_ingest.sql(_INV_SQL.format(fx=fx)))
    }
    billing_map = _extract._build_billing_map(creds.load_credits())
    ingested_at = datetime.datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")

    scanned = changed = parsed = needs_label = 0
    to_append = []

    for path, slug, category, msgid in _archive_pdfs(cfg):
        scanned += 1
        row = _extract.build_row(
            path, slug, category, msgid, "email",
            cfg, today, billing_map=billing_map, ingested_at=ingested_at,
        )

        if row["status"] == "parsed":
            parsed += 1
        else:
            needs_label += 1

        old = existing.get(row["sha256"], {})
        old_amount = float(old.get("amount") or 0.0)
        old_credit = float(old.get("credit_usd") or 0.0)
        old_status = old.get("status", "missing")
        new_amount = float(row.get("amount") or 0.0)
        new_credit = float(row.get("credit_usd") or 0.0)
        differs = (
            round(old_amount, 6) != round(new_amount, 6)
            or round(old_credit, 6) != round(new_credit, 6)
            or old_status != row["status"]
        )
        if differs:
            changed += 1
            print(
                f"{row['sha256']} {slug} {row.get('period_month', '')} "
                f"{old_status} {old_amount:.2f}/{old_credit:.2f} -> "
                f"{row['status']} {new_amount:.2f}/{new_credit:.2f} {path}"
            )

        if not dry_run and row["status"] == "parsed":
            to_append.append(row)

    if not dry_run and to_append:
        ops_ingest.append("invoices", to_append)

    return {
        "dry_run": dry_run,
        "scanned": scanned,
        "changed": changed,
        "parsed": parsed,
        "needs_label": needs_label,
        "appended": 0 if dry_run else len(to_append),
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


def _run_burn_stage(ops_ingest, ops_replace, tb_prod, creds, cfg, pools,
                    today, statuses, notes, overrides=None):
    """Run the full burn stage (steps 1–6 of the burn phase).

    Mutates `statuses` dict and `notes` list in place (same objects written to
    ingest_runs by the caller).  Prints runway alarms and needs_data notices.

    Steps:
      1. Balance connectors → append to balances
      2. Meter connectors  → append to meter_monthly
      3. usage.monthly_rows → replace usage_monthly (skip on 0 rows)
      4. stripe.revenue_rows → replace revenue_monthly (skip on 0 rows)
      5. Read back from TB, run burn engine → replace provider_month + grants
         (guarded: any exception records statuses["burn"]="err:..." and returns)
      6. Print runway alarms and needs_data notices (guarded: parse errors are silent)
    """
    now = datetime.datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")
    fx = cfg.get("fx_eur_usd", 1.14)

    # ---- Step 1: balance connectors ----
    for slug, fn in registry.BALANCE:
        try:
            # ovhcloud balance takes fx= kwarg; pass it via inspect to avoid coupling
            sig = inspect.signature(fn)
            if "fx" in sig.parameters:
                rows = fn(creds, now, fx=fx)
            else:
                rows = fn(creds, now)
            # result may be a single dict or a list
            if isinstance(rows, dict):
                rows = [rows]
            if rows:
                ops_ingest.append("balances", rows)
            statuses[f"balance:{slug}"] = "ok"
        except Exception as e:
            statuses[f"balance:{slug}"] = "err:" + _sanitize_err(e, creds)

    # ---- Step 2: meter connectors ----
    months_ytd_list = months_ytd(cfg["months_start"], today)
    for slug, fn in registry.METER:
        try:
            sig = inspect.signature(fn)
            if "fx" in sig.parameters:
                rows = fn(creds, months_ytd_list, today, fx=fx)
            else:
                rows = fn(creds, months_ytd_list, today)
            if rows:
                ops_ingest.append("meter_monthly", rows)
            statuses[f"meter:{slug}"] = "ok"
        except Exception as e:
            statuses[f"meter:{slug}"] = "err:" + _sanitize_err(e, creds)

    # ---- Step 3: usage_monthly (full replace) ----
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

    # ---- Step 4: revenue_monthly (full replace) ----
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

    # ---- Step 5: burn engine → provider_month + grants ----
    # Wrapped in try/except so any TB network error, ValueError on 0-row replace,
    # or bug in burn.run never escapes and kills the ingest_runs log append.
    pm_rows = []
    balances = []
    try:
        invoices = dedupe_invoices(ops_ingest.sql(_INV_SQL.format(fx=fx)))
        payments = ops_ingest.sql(_PAY_SQL.format(fx=fx))
        meter_rows = ops_ingest.sql("SELECT * FROM meter_monthly")
        usage_read = ops_ingest.sql("SELECT * FROM usage_monthly")
        balances = ops_ingest.sql("SELECT * FROM balances")

        cat_map = {slug: cat for slug, cat, _ in harvest.PROVIDERS}
        pm_rows = burn.run(invoices, payments, meter_rows, usage_read, balances,
                           pools, months_ytd_list, cfg, today, cat_map=cat_map)
        # Skip replace on 0 rows — keep last good; replace only when burn produced output
        if pm_rows:
            ops_replace.replace("provider_month", pm_rows)
            statuses["burn_rows"] = len(pm_rows)
        else:
            notes.append("burn: 0 rows from burn.run — provider_month unchanged (last good kept)")
            statuses["burn_rows"] = 0

        grant_rows = burn.grants(pools, balances, today, overrides, cat_map=cat_map)
        if grant_rows:
            ops_replace.replace("grants", grant_rows)
            statuses["grant_rows"] = len(grant_rows)
        else:
            notes.append("burn: 0 grant rows — grants table unchanged (last good kept)")
            statuses["grant_rows"] = 0

    except Exception as e:
        statuses["burn"] = "err:" + _sanitize_err(e, creds)
        notes.append(f"burn stage failed: {statuses['burn']}")
        return

    # ---- Step 6: print runway alarms and needs_data notices ----
    try:
        # Runway alarm: find freshest runpod balance row
        runpod_rows = [r for r in balances if (r.get("provider") or "").lower() == "runpod"]
        if runpod_rows:
            latest = max(runpod_rows, key=lambda r: r.get("run_at", ""))
            note_str = latest.get("note", "") or ""
            prepaid = latest.get("prepaid_left_usd")
            # Parse spend_per_hr=<float> from note
            m = re.search(r"spend_per_hr=([\d.]+)", note_str)
            if m and prepaid is not None:
                try:
                    spend_hr = float(m.group(1))
                    if spend_hr > 0:
                        days = float(prepaid) / (spend_hr * 24)
                        if days < 14:
                            print(f"⚠ runpod ${prepaid:.2f} ≈ {days:.1f}d at ${spend_hr}/hr")
                except (ValueError, ZeroDivisionError):
                    pass

        # needs_data notices for current month
        current_month = today[:7]
        needs = sorted(row["provider"] for row in pm_rows
                       if row.get("status") == "needs_data" and row.get("month") == current_month)
        if needs:
            print(f"  needs_data ({current_month}): {', '.join(needs)} — "
                  f"python3 -m ingest.record meter <provider> {current_month} <usd> --funding credit")
    except Exception:
        pass


def main():
    backfill = "--backfill" in sys.argv
    import_mode = "--import-archive" in sys.argv
    reparse_mode = "--reparse-invoices" in sys.argv
    dry_run = "--dry-run" in sys.argv
    today = datetime.date.today().isoformat()
    c, cfg = creds.load_creds(), creds.load_config()

    # One token for ingest — see MODULE DOCSTRING
    ops_ingest = tb.TB(cfg["tb_ops_api"], c["TINYBIRD_OPS_INGEST_TOKEN"])

    # --reparse-invoices: safe append-only re-extraction of archived PDFs.
    # Use --dry-run before any real append.
    if reparse_mode:
        st = reparse_invoices(cfg, ops_ingest, today, dry_run=dry_run)
        print(f"reparse-invoices: {st}")
        return

    # --import-archive: one-off backfill from pre-organized month dirs, then exit
    if import_mode:
        st = import_archive(cfg, ops_ingest, today)
        now = datetime.datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")
        ops_ingest.append("ingest_runs", [{
            "run_at": now, "ok": 1,
            "statuses": json.dumps(st), "notes": "import-archive",
        }])
        print(f"import-archive: {st}")
        return

    # Replace token needed after import-mode returns — see MODULE DOCSTRING
    ops_replace = tb.TB(cfg["tb_ops_api"], c["TINYBIRD_OPS_REPLACE_TOKEN"])

    st, notes = {}, []
    all_months = months_ytd(cfg["months_start"], today)
    win = all_months if backfill else all_months[-cfg["repull_months"]:]

    # 1. Harvest invoices (append, deduped by sha256 inside harvest)
    since = cfg["months_start"].replace("-", "/") + "/01" if backfill else None
    st["harvest_gmail"] = harvest.gmail_sweep(cfg, ops_ingest, today, since=since)
    st["harvest_inbox"] = harvest.inbox_sweep(cfg, ops_ingest, today)

    # 2. Payments (Wise outflows) — per month in window
    try:
        for ym in win:
            rows = wise.outflow_rows(c, [ym])
            if rows:
                nxt = gaps._next_month(ym)
                ops_replace.replace(
                    "payments", rows,
                    condition=f"paid_at >= '{ym}-01' AND paid_at < '{nxt}-01'")
            else:
                notes.append(f"wise:{ym}: 0 rows — payments table unchanged")
            st[f"wise:{ym}"] = len(rows)
    except Exception as e:
        # Tradeoff: reconciliation still runs against whatever payments are already in the table;
        # verdicts may be stale for failed months but will self-heal on the next successful run.
        notes.append(f"wise FAILED, months kept: {e}")

    # 3. Gaps / reconciliation — read facts back, run pure engine, write result
    fx = cfg["fx_eur_usd"]
    invoices = dedupe_invoices(ops_ingest.sql(_INV_SQL.format(fx=fx)))
    payments = ops_ingest.sql(_PAY_SQL.format(fx=fx))
    pools = creds.load_credits().get("pools", [])

    try:
        overrides = load_overrides(ops_ingest)
    except Exception as e:
        overrides = {}
        notes.append(f"overrides read failed (treated as empty): {e}")

    gaps_cfg = dict(cfg)
    gaps_cfg["recon_accepted"] = list(cfg.get("recon_accepted", [])) + [
        key for (scope, key, field) in overrides
        if scope == "reconciliation" and field == "accepted"
    ]

    rrows = gaps.run(invoices, payments, pools, all_months, gaps_cfg, today)
    if rrows:
        ops_replace.replace("reconciliation", rrows)
    else:
        notes.append("gaps: 0 verdict rows — reconciliation table unchanged")
    st["recon"] = len(rrows)

    # 4. Burn stage — balances, meters, usage, revenue, provider_month, grants
    tb_prod = tb.TB(cfg["tb_prod_api"], c["TINYBIRD_PROD_READ_TOKEN"])
    _run_burn_stage(
        ops_ingest=ops_ingest,
        ops_replace=ops_replace,
        tb_prod=tb_prod,
        creds=c,
        cfg=cfg,
        pools=pools,
        today=today,
        statuses=st,
        notes=notes,
        overrides=overrides,
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

    # 6. Chase list — print providers that need attention
    chase = [r for r in rrows if r["status"] in ("missing_invoice", "amount_mismatch", "needs_label")]
    if chase:
        print("CHASE LIST:")
        for r in chase:
            print(f"  {r['month']} {r['provider']:14} {r['status']:16} "
                  f"inv=${r['invoice_usd']:.0f} pay=${r['payment_usd']:.0f}")


if __name__ == "__main__":
    main()
