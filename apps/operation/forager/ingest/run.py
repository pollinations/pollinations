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


def dedupe_invoices(rows):
    """Deduplicate invoice rows per sha256.

    Prefers status='parsed' over status='needs_label'.
    Tie-breaks by latest ingested_at, then keeps the last-seen row.
    """
    # Status preference: parsed > needs_label (lower = better)
    _STATUS_RANK = {"parsed": 0, "needs_label": 1}
    best = {}
    for row in rows:
        sha = row["sha256"]
        if sha not in best:
            best[sha] = row
        else:
            prev = best[sha]
            prev_rank = _STATUS_RANK.get(prev["status"], 9)
            curr_rank = _STATUS_RANK.get(row["status"], 9)
            if curr_rank < prev_rank:
                best[sha] = row
            elif curr_rank == prev_rank and row["ingested_at"] > prev["ingested_at"]:
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
                    months, today, statuses, notes):
    """Run the full burn stage (steps 1–6 of the burn phase).

    Mutates `statuses` dict and `notes` list in place (same objects written to
    ingest_runs by the caller).  Prints runway alarms and needs_data notices.

    Steps:
      1. Balance connectors → append to balances
      2. Meter connectors  → append to meter_monthly
      3. usage.monthly_rows → replace usage_monthly (skip on 0 rows)
      4. stripe.revenue_rows → replace revenue_monthly (skip on 0 rows)
      5. Read back from TB, run burn engine → replace provider_month + grants
      6. Print runway alarms and needs_data notices
    """
    now = datetime.datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")
    fx = cfg.get("fx_eur_usd", 1.14)

    # ---- Step 1: balance connectors ----
    for slug, fn in registry.BALANCE:
        try:
            # ovhcloud balance takes fx= kwarg; pass it via inspect to avoid coupling
            import inspect
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
            import inspect
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
    usage_rows = _usage.monthly_rows(tb_prod, months_ytd_list, today)
    if usage_rows:
        ops_replace.replace("usage_monthly", usage_rows)
        statuses["usage"] = len(usage_rows)
    else:
        notes.append("usage: 0 rows — usage_monthly table unchanged (last good kept)")
        statuses["usage"] = 0

    # ---- Step 4: revenue_monthly (full replace) ----
    revenue_rows = _stripe.revenue_rows(creds, months_ytd_list, today)
    if revenue_rows:
        ops_replace.replace("revenue_monthly", revenue_rows)
        statuses["revenue"] = len(revenue_rows)
    else:
        notes.append("revenue: 0 rows — revenue_monthly table unchanged (last good kept)")
        statuses["revenue"] = 0

    # ---- Step 5: burn engine → provider_month + grants ----
    invoices = dedupe_invoices(ops_ingest.sql("SELECT * FROM invoices"))
    payments = ops_ingest.sql("SELECT * FROM payments")
    meter_rows = ops_ingest.sql("SELECT * FROM meter_monthly")
    usage_read = ops_ingest.sql("SELECT * FROM usage_monthly")
    balances = ops_ingest.sql("SELECT * FROM balances")

    pm_rows = burn.run(invoices, payments, meter_rows, usage_read, balances,
                       pools, months_ytd_list, cfg, today)
    # Always replace, even when empty — full-replace datasource; empty universe is valid
    ops_replace.replace("provider_month", pm_rows)

    grant_rows = burn.grants(pools, balances, today)
    ops_replace.replace("grants", grant_rows)

    statuses["burn_rows"] = len(pm_rows)
    statuses["grant_rows"] = len(grant_rows)

    # ---- Step 6: print runway alarms and needs_data notices ----

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
    for row in pm_rows:
        if row.get("status") == "needs_data" and row.get("month") == current_month:
            nd_note = row.get("note", "")
            if nd_note:
                print(f"  needs_data [{row['provider']}]: {nd_note}")


def main():
    backfill = "--backfill" in sys.argv
    import_mode = "--import-archive" in sys.argv
    today = datetime.date.today().isoformat()
    c, cfg = creds.load_creds(), creds.load_config()

    # One token for ingest — see MODULE DOCSTRING
    ops_ingest = tb.TB(cfg["tb_ops_api"], c["TINYBIRD_OPS_INGEST_TOKEN"])

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
            rows = wise.outflow_rows(c, [ym], cfg["fx_eur_usd"], today)
            if rows:
                ops_replace.replace("payments", rows, condition=f"month='{ym}'")
            else:
                notes.append(f"wise:{ym}: 0 rows — payments table unchanged")
            st[f"wise:{ym}"] = len(rows)
    except Exception as e:
        # Tradeoff: reconciliation still runs against whatever payments are already in the table;
        # verdicts may be stale for failed months but will self-heal on the next successful run.
        notes.append(f"wise FAILED, months kept: {e}")

    # 3. Gaps / reconciliation — read facts back, run pure engine, write result
    invoices = dedupe_invoices(ops_ingest.sql("SELECT * FROM invoices"))
    payments = ops_ingest.sql("SELECT * FROM payments")
    pools = creds.load_credits().get("pools", [])

    rrows = gaps.run(invoices, payments, pools, all_months, cfg, today)
    if rrows:
        ops_replace.replace("reconciliation", rrows)
    else:
        notes.append("gaps: 0 verdict rows — reconciliation table unchanged")
    st["recon"] = len(rrows)

    # 4. Burn stage — balances, meters, usage, revenue, provider_month, grants
    tb_prod = tb.TB(cfg["tb_ops_api"], c["TINYBIRD_PROD_READ_TOKEN"])
    _run_burn_stage(
        ops_ingest=ops_ingest,
        ops_replace=ops_replace,
        tb_prod=tb_prod,
        creds=c,
        cfg=cfg,
        pools=pools,
        months=all_months,
        today=today,
        statuses=st,
        notes=notes,
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
