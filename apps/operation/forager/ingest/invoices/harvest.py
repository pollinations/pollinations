"""Harvest invoice PDFs from Gmail (via `gog`) and the local inbox drop folder.

gmail_sweep  — searches Gmail, downloads new PDFs into inbox/, then routes them.
inbox_sweep  — processes PDFs dropped into <archive_dir>/inbox/ and drains it.
classify     — maps (from, subject) → (slug, category).
pick_primary — from an Invoice+Receipt pair keeps the Invoice PDF.
"""
import json
import os
import shutil
import subprocess
import sys
from collections import Counter, defaultdict
from datetime import datetime

from . import extract as _extract
from .. import creds as _creds


INBOX_DIR = "inbox"
VALIDATED_DIR = "validated"
QUARANTINE_DIR = "quarantine"
DELETED_DIR = "deleted"


# ---------------------------------------------------------------------------
# Provider registry
# Each entry: (slug, category, keys)
# Order matters — specifics first.
# ---------------------------------------------------------------------------

PROVIDERS = [
    # ----- compute -----
    ("google-workspace", "saas",    ["google workspace"]),
    ("google",           "compute", ["google cloud", "cloud platform", "google llc", "google payments"]),
    ("anthropic",        "compute", ["anthropic"]),
    ("openai",           "compute", ["openai"]),
    ("azure",            "compute", ["azure", "microsoft"]),
    ("aws",              "compute", ["amazon web services", "aws ", "amazon.com", "aws,"]),
    ("alibaba",          "compute", ["alibaba", "aliyun", "alibabacloud", "dashscope"]),
    ("aws",              "compute", ["automat-it", "automat it"]),   # intermediary billing
    ("replicate",        "compute", ["replicate"]),
    ("xai",              "compute", ["x.ai", "xai"]),
    ("fal",              "compute", ["fal - features", "fal.ai", "features & labels", "withorb"]),
    ("elevenlabs",       "compute", ["elevenlabs", "eleven labs"]),
    ("fireworks",        "compute", ["fireworks"]),
    ("deepinfra",        "compute", ["deepinfra", "deep infra"]),
    ("perplexity",       "compute", ["perplexity"]),
    ("runpod",           "compute", ["runpod"]),
    ("lambda",           "compute", ["lambda", "lambdal"]),
    ("vast.ai",          "compute", ["vast.ai", "vast ai", "vast, inc"]),
    ("assemblyai",       "compute", ["assemblyai", "assembly ai"]),
    ("modal",            "compute", ["modal labs", "modal.com", "modal, inc"]),
    ("io.net",           "compute", ["io.net", "io net"]),
    ("bytedance",        "compute", ["byteplus", "bytedance", "volcengine"]),
    ("ovhcloud",         "compute", ["ovh"]),
    ("scaleway",         "compute", ["scaleway"]),
    ("stability",        "compute", ["stability ai", "stability"]),
    ("pruna",            "compute", ["pruna"]),
    ("openrouter",       "compute", ["openrouter", "open router"]),
    ("inception",        "compute", ["inception"]),
    # ----- infra -----
    ("tinybird",         "infra",   ["tinybird"]),
    ("cloudflare",       "infra",   ["cloudflare"]),
    ("vercel",           "infra",   ["vercel"]),
    ("digitalocean",     "infra",   ["digitalocean", "digital ocean"]),
    # ----- internal software -----
    ("exafunction",      "saas",    ["exafunction"]),
    ("daytona",          "saas",    ["daytona"]),
    ("buffer",           "saas",    ["buffer"]),
    ("notion",           "saas",    ["notion"]),
    ("protonvpn",        "saas",    ["protonvpn", "proton vpn", "proton"]),
    ("canva",            "saas",    ["canva"]),
    ("typeless",         "saas",    ["typeless"]),
    ("wispr",            "saas",    ["wispr"]),
    ("slack",            "saas",    ["slack"]),
    ("github",           "saas",    ["github"]),
    # ----- finance/admin -----
    ("stripe",           "admin",   ["stripe"]),
    ("so-lab-x",         "admin",   ["so lab x", "so_lab_x"]),
    ("enty",             "admin",   ["enty"]),
    ("wise",             "admin",   ["wise "]),
    # ----- office/operations -----
    ("amazon",           "office",  ["amazon"]),
    ("gaswerksiedlung",  "office",  ["gaswerksiedlung"]),
    ("zara-home",        "office",  ["zara home", "zara_home"]),
    ("denns-biomarkt",   "office",  ["denns biomarkt", "denns_biomarkt"]),
    ("tele2",            "office",  ["tele2"]),
    ("naturenergie",     "office",  ["naturenergie"]),
    # ----- payroll -----
    ("deel",             "payroll", ["deel"]),
    # ----- self -----
    ("self-issued",      "other",   ["myceli.ai o", "invoice+statements@myceli.ai"]),
]

# from: domains for the precision sweep
DOMAINS = ["lambdal.com", "x.ai", "replicate.com", "withorb.com", "elevenlabs.io",
           "fireworks.ai", "deepinfra.com", "perplexity.ai", "runpod.io", "vast.ai",
           "assemblyai.com", "modal.com", "io.net", "byteplus.com", "ovh.com", "ovh.net",
           "stability.ai", "pruna.ai", "openrouter.ai", "anthropic.com", "openai.com",
           "tinybird.co", "cloudflare.com", "vercel.com", "digitalocean.com", "wise.com",
           "deel.com", "google.com", "amazonaws.com", "aws.amazon.com", "microsoft.com",
           "alibabacloud.com", "aliyun.com", "stripe.com"]


def _make_queries(start, since=None):
    """Build search queries for the given window."""
    if since:
        date_filter = f"after:{since}"
    else:
        date_filter = "newer_than:3d"

    q1 = (f'{date_filter} has:attachment filename:pdf (invoice OR receipt OR facture OR statement OR '
          f'billing OR "payment received" OR rechnung OR quittung OR "tax invoice")')
    q2 = (f'{date_filter} has:attachment filename:pdf {{' +
          " ".join(f"from:{d}" for d in DOMAINS) + '}')
    return [q1, q2]


def _month_bounds(month):
    """Return Gmail after/before bounds for a YYYY-MM month."""
    if len(month) != 7 or month[4] != "-":
        raise ValueError("month must be YYYY-MM")
    year, month_num = int(month[:4]), int(month[5:7])
    if not 1 <= month_num <= 12:
        raise ValueError("month must be YYYY-MM")
    next_year = year + 1 if month_num == 12 else year
    next_month = 1 if month_num == 12 else month_num + 1
    return (
        f"{year:04d}/{month_num:02d}/01",
        f"{next_year:04d}/{next_month:02d}/01",
    )


def _make_month_queries(month):
    """Build Gmail invoice queries for exactly one calendar month."""
    after, before = _month_bounds(month)
    date_filter = f"after:{after} before:{before}"
    q1 = (f'{date_filter} has:attachment filename:pdf (invoice OR receipt OR facture OR statement OR '
          f'billing OR "payment received" OR rechnung OR quittung OR "tax invoice")')
    q2 = (f'{date_filter} has:attachment filename:pdf {{' +
          " ".join(f"from:{d}" for d in DOMAINS) + '}')
    return [q1, q2]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def gog(config, *args):
    """Run gog with the configured account."""
    cmd = ["gog", "-a", config["gog_account"], *args]
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode not in (0,):
        sys.stderr.write(f"[gog {' '.join(args)}] rc={r.returncode} {r.stderr[:200]}\n")
    return r.stdout


def classify(frm, subject):
    """Map (from, subject) → (slug, category). Returns ("other", "other") if no match."""
    t = f"{frm} {subject}".lower()
    for slug, category, keys in PROVIDERS:
        if any(k in t for k in keys):
            return slug, category
    return "other", "other"


def safe(s):
    """Sanitize a string for use in a filename."""
    out = []
    prev_dash = False
    for ch in s:
        keep = ch.isascii() and (ch.isalnum() or ch in "._-")
        if keep:
            out.append(ch)
            prev_dash = False
        elif not prev_dash:
            out.append("-")
            prev_dash = True
    return "".join(out).strip("-")[:60]


def pick_primary(pdfs):
    """From a list of PDF attachment dicts, prefer an Invoice-*.pdf over Receipt-*.pdf."""
    if not pdfs:
        return None
    for a in pdfs:
        if (a.get("filename", "") or "").startswith("Invoice"):
            return a
    return pdfs[0]


def _known_sha256s(tb_ops):
    """Fetch the set of sha256 hashes already in the invoices datasource."""
    rows = tb_ops.sql("SELECT sha256 FROM invoices")
    return {r["sha256"] for r in rows}


def ensure_invoice_folders(config):
    """Create the invoice pipeline's explicit state folders."""
    archive_dir = config["archive_dir"]
    paths = {
        "inbox": os.path.join(archive_dir, INBOX_DIR),
        "validated": os.path.join(archive_dir, VALIDATED_DIR),
        "quarantine": os.path.join(archive_dir, QUARANTINE_DIR),
        "deleted": os.path.join(archive_dir, DELETED_DIR),
    }
    for path in paths.values():
        os.makedirs(path, exist_ok=True)
    return paths


def _known_local_sha256s(config):
    """Local outcome folders are part of idempotency because only parsed rows hit TB."""
    known = set()
    paths = ensure_invoice_folders(config)
    for root in (paths["validated"], paths["quarantine"], paths["deleted"]):
        for dirpath, _dirs, files in os.walk(root):
            for fname in files:
                if not fname.lower().endswith(".pdf"):
                    continue
                try:
                    known.add(_extract.sha256(os.path.join(dirpath, fname)))
                except OSError:
                    continue
    return known


def _archive_has_msgid(config, msgid8):
    paths = ensure_invoice_folders(config)
    for root in (paths["validated"], paths["quarantine"], paths["deleted"]):
        for _dirpath, _dirs, files in os.walk(root):
            if any(msgid8 in fname for fname in files):
                return True
    return False


def _move_unique(src, dest_dir, dest_name):
    os.makedirs(dest_dir, exist_ok=True)
    base, ext = os.path.splitext(dest_name)
    dest = os.path.join(dest_dir, dest_name)
    n = 2
    while os.path.exists(dest):
        dest = os.path.join(dest_dir, f"{base}-{n}{ext}")
        n += 1
    shutil.move(src, dest)
    return dest


def _move_deleted(config, src, fname, file_sha, reason):
    paths = ensure_invoice_folders(config)
    dest_name = f"{file_sha[:8]}_{safe(reason)}_{safe(fname)}"
    return _move_unique(src, paths["deleted"], dest_name)


def _move_quarantine(config, src, fname, file_sha, reason):
    paths = ensure_invoice_folders(config)
    dest_name = f"{file_sha[:8]}_{safe(reason)}_{safe(fname)}"
    return _move_unique(src, paths["quarantine"], dest_name)


def _move_validated(config, src, fname, file_sha, row):
    paths = ensure_invoice_folders(config)
    period_month = row.get("period_month") or "unknown"
    dest_slug = row.get("provider") or "other"
    dest_name = f"{dest_slug}_{period_month}_{file_sha[:8]}_{safe(fname)}"
    return _move_unique(src, os.path.join(paths["validated"], period_month), dest_name)


def _route_processed_pdf(config, src, fname, file_sha, result, row=None):
    status = _extract.document_status(result)
    if status == "parsed" and row:
        return status, _move_validated(config, src, fname, file_sha, row)
    if status == "not_invoice":
        return status, _move_deleted(config, src, fname, file_sha, "not_invoice")
    return "needs_review", _move_quarantine(config, src, fname, file_sha, status)


# ---------------------------------------------------------------------------
# Gmail sweep
# ---------------------------------------------------------------------------

def search_all(config, since=None):
    """Search Gmail and return a merged dict of msgid → metadata (dedup by msgid)."""
    return _search_queries(config, _make_queries(config.get("months_start", "2026/01/01"), since))


def search_month(config, month):
    """Search Gmail and return invoice-like messages for one YYYY-MM month."""
    return _search_queries(config, _make_month_queries(month))


def _search_queries(config, queries):
    """Run Gmail queries and return a merged dict of msgid → metadata."""
    seen = {}
    for q in queries:
        out = gog(config, "gmail", "search", q, "--all", "--json", "--results-only")
        try:
            rows = json.loads(out)
        except Exception as e:
            sys.stderr.write(f"parse fail: {e}\n{out[:300]}\n")
            continue
        for r in rows or []:
            mid = r.get("id")
            if not mid or mid in seen:
                continue
            frm, sub, date = r.get("from", ""), r.get("subject", ""), r.get("date", "")
            slug, category = classify(frm, sub)
            seen[mid] = {
                "id": mid, "from": frm, "subject": sub, "date": date,
                "month": date[:7].replace("/", "-"),
                "provider": slug, "category": category,
            }
    return seen


def _message_pdfs(config, msgid):
    """Return PDF attachment dicts for one Gmail message."""
    try:
        parsed = json.loads(
            gog(config, "gmail", "get", msgid, "--json", "--results-only") or "[]"
        )
    except Exception:
        parsed = []

    if isinstance(parsed, dict):
        parsed = [parsed] if parsed.get("attachmentId") else (parsed.get("attachments") or [])
    atts = [a for a in parsed if isinstance(a, dict) and a.get("attachmentId")]
    return [
        a for a in atts
        if (a.get("filename", "") or "").lower().endswith(".pdf")
        or a.get("mimeType") == "application/pdf"
    ]


def gmail_gather_month(config, month):
    """Download invoice-like Gmail PDF attachments for one month into inbox/.

    This stage intentionally does no AI extraction and writes nothing to Tinybird.
    """
    counts = Counter()
    paths = ensure_invoice_folders(config)
    inbox_dir = paths["inbox"]
    items = list(search_month(config, month).values())
    items.sort(key=lambda x: (x["date"], x["provider"]))

    for it in items:
        mid8 = it["id"][:8]
        if _archive_has_msgid(config, mid8) or any(mid8 in f for f in os.listdir(inbox_dir)):
            counts["skipped_msgid"] += 1
            continue

        pdfs = _message_pdfs(config, it["id"])
        if not pdfs:
            counts["no_pdf"] += 1
            continue

        for a in pdfs:
            fn = a.get("filename", "") or "invoice.pdf"
            name = f"{it['provider']}_{it['date'][:10].replace('/', '-')}_{mid8}_{safe(fn)}"
            gog(config, "gmail", "attachment", it["id"], a["attachmentId"],
                "--out", inbox_dir, "--name", name)
            path = os.path.join(inbox_dir, name)
            if os.path.exists(path):
                counts["downloaded"] += 1
                sys.stderr.write(f"  gmail: {name}\n")
            else:
                counts["failed"] += 1
                sys.stderr.write(f"  !! download failed: {name}\n")

    return {
        "month": month,
        "messages": len(items),
        "downloaded": counts.get("downloaded", 0),
        "skipped_msgid": counts.get("skipped_msgid", 0),
        "no_pdf": counts.get("no_pdf", 0),
        "failed": counts.get("failed", 0),
    }


def gmail_sweep(config, tb_ops, today, since=None):
    """Search Gmail for invoice PDFs, download new ones, push each to TB.

    Args:
        config:  forager config dict (archive_dir, gog_account, months_start, …)
        tb_ops:  TB instance
        today:   ISO date string "YYYY-MM-DD"
        since:   optional backfill start date "YYYY/MM/DD" (overrides daily 3d window)

    Returns:
        dict with counts: pushed, deleted, quarantined, skipped_msgid, dup_sha, no_pdf
    """
    counts = Counter()
    ensure_invoice_folders(config)
    known_shas = _known_sha256s(tb_ops) | _known_local_sha256s(config)
    provider_slugs = _extract._build_provider_slugs(_creds.load_credits())
    agent_creds = _creds.load_creds()

    items = list(search_all(config, since).values())
    items.sort(key=lambda x: (x["month"], x["provider"]))

    # Print catalog summary
    by_pm = defaultdict(Counter)
    for it in items:
        by_pm[it["provider"]][it["month"]] += 1
    months = sorted({it["month"] for it in items}) if items else []
    if months:
        sys.stderr.write(
            f"\n{len(items)} invoice emails, {len(by_pm)} providers, "
            f"months {months[0]}..{months[-1]}\n\n"
        )
        sys.stderr.write(f"{'provider':18} " + " ".join(f"{m[5:]:>4}" for m in months) + "  tot\n")
        for prov in sorted(by_pm, key=lambda p: -sum(by_pm[p].values())):
            row = by_pm[prov]
            sys.stderr.write(
                f"{prov:18} " + " ".join(f"{row.get(m,''):>4}" for m in months) +
                f"  {sum(row.values()):>3}\n"
            )

    for it in items:
        paths = ensure_invoice_folders(config)
        download_dir = paths["inbox"]
        mid8 = it["id"][:8]

        # Idempotency: msgid8 already landed in an outcome folder.
        if _archive_has_msgid(config, mid8):
            counts["skipped_msgid"] += 1
            continue

        # Fetch attachment list
        try:
            parsed = json.loads(
                gog(config, "gmail", "get", it["id"], "--json", "--results-only") or "[]"
            )
        except Exception:
            parsed = []

        # Normalize to a list of attachment dicts (get may return a list, a single dict,
        # or a message dict with an "attachments" key)
        if isinstance(parsed, dict):
            parsed = [parsed] if parsed.get("attachmentId") else (parsed.get("attachments") or [])
        atts = [a for a in parsed if isinstance(a, dict) and a.get("attachmentId")]
        pdfs = [
            a for a in atts
            if (a.get("filename", "") or "").lower().endswith(".pdf")
            or a.get("mimeType") == "application/pdf"
        ]

        if not pdfs:
            counts["no_pdf"] += 1
            sys.stderr.write(
                f"  !! no pdf: {it['provider']:12} {it['date'][:10]} {it['subject'][:45]}\n"
            )
            continue

        primary = pick_primary(pdfs)

        for a in pdfs:
            fn = a.get("filename", "") or "invoice.pdf"
            name = f"{it['provider']}_{it['date'][:10].replace('/', '-')}_{mid8}_{safe(fn)}"
            gog(config, "gmail", "attachment", it["id"], a["attachmentId"],
                "--out", download_dir, "--name", name)

            path = os.path.join(download_dir, name)
            if not os.path.exists(path):
                sys.stderr.write(f"  !! download failed: {name}\n")
                continue

            # sha256 dedup against TB
            file_sha = _extract.sha256(path)
            if file_sha in known_shas:
                _move_deleted(config, path, name, file_sha, "duplicate")
                counts["dup_sha"] += 1
                sys.stderr.write(f"  dup sha: {name}\n")
                continue

            known_shas.add(file_sha)

            # Only pass the primary PDF to extract; duplicate receipt PDFs are discarded.
            if a is not primary:
                _move_deleted(config, path, name, file_sha, "secondary_pdf")
                continue

            try:
                result = _extract.extract_pdf(
                    path, file_sha, it["provider"], it["category"], config, today,
                    provider_slugs=provider_slugs, creds=agent_creds,
                )
                row = _extract.build_row_from_result(
                    path, file_sha, result, "email", today,
                )
                status, dest_path = _route_processed_pdf(
                    config, path, name, file_sha, result, row=row,
                )
            except Exception as e:
                dest_path = _move_quarantine(config, path, name, file_sha, type(e).__name__)
                counts["quarantined"] += 1
                sys.stderr.write(f"  quarantined error: {it['provider']:14} {dest_path} {e}\n")
                continue

            if status == "parsed":
                row["file_ref"] = dest_path
                tb_ops.append("invoices", [row])
                counts["pushed"] += 1
                sys.stderr.write(f"  {it['month']} {it['provider']:14} {it['date'][:10]}\n")
            elif status == "not_invoice":
                counts["deleted"] += 1
                sys.stderr.write(
                    f"  deleted not_invoice: {it['provider']:14} {it['date'][:10]}\n"
                )
            else:
                counts["quarantined"] += 1
                sys.stderr.write(
                    f"  quarantined {status}: {it['provider']:14} {it['date'][:10]}\n"
                )

    return dict(counts)


# ---------------------------------------------------------------------------
# Inbox sweep
# ---------------------------------------------------------------------------

def inbox_sweep(config, tb_ops, today):
    """Process PDFs dropped into <archive_dir>/inbox/.

    For each PDF:
    1. sha256 dedup vs TB and local outcome folders — move duplicates to deleted/.
    2. Classify by filename prefix (<provider>_...) if it matches.
       The AI agent can override the hint from the PDF itself.
    3. Move to validated/<YYYY-MM>/, quarantine/, or deleted/.
    4. Push the already-extracted row.

    Args:
        config:  forager config dict
        tb_ops:  TB instance
        today:   ISO date string "YYYY-MM-DD"

    Returns:
        dict with counts: pushed, dup_sha, deleted, quarantined
    """
    counts = Counter()
    paths = ensure_invoice_folders(config)
    inbox_dir = paths["inbox"]

    pdfs = sorted(
        f for f in os.listdir(inbox_dir)
        if f.lower().endswith(".pdf")
    )
    if not pdfs:
        return {"pushed": 0, "dup_sha": 0, "deleted": 0, "quarantined": 0}

    known_shas = _known_sha256s(tb_ops) | _known_local_sha256s(config)
    provider_slugs = _extract._build_provider_slugs(_creds.load_credits())
    agent_creds = _creds.load_creds()

    for fname in pdfs:
        src = os.path.join(inbox_dir, fname)

        # sha256 dedup
        file_sha = _extract.sha256(src)
        if file_sha in known_shas:
            counts["dup_sha"] += 1
            _move_deleted(config, src, fname, file_sha, "duplicate")
            sys.stderr.write(f"  inbox dup sha: {fname}\n")
            continue

        # Classify: try filename prefix first
        slug, category = _classify_inbox_name(fname)

        try:
            result = _extract.extract_pdf(
                src, file_sha, slug, category, config, today,
                provider_slugs=provider_slugs, creds=agent_creds,
            )
            row = _extract.build_row_from_result(
                src, file_sha, result, "inbox", today,
            )
            status, dest_path = _route_processed_pdf(
                config, src, fname, file_sha, result, row=row,
            )
        except Exception as e:
            dest_path = _move_quarantine(config, src, fname, file_sha, type(e).__name__)
            counts["quarantined"] += 1
            sys.stderr.write(f"  inbox quarantined error: {fname} -> {dest_path} {e}\n")
            continue

        if status != "parsed":
            counts["deleted" if status == "not_invoice" else "quarantined"] += 1
            sys.stderr.write(f"  inbox {status}: {fname} -> {dest_path}\n")
            continue

        known_shas.add(file_sha)

        row["file_ref"] = dest_path
        tb_ops.append("invoices", [row])
        counts["pushed"] += 1
        rel = os.path.relpath(dest_path, config["archive_dir"])
        sys.stderr.write(f"  inbox: {fname} -> {rel}\n")

    return {
        "pushed": counts.get("pushed", 0),
        "dup_sha": counts.get("dup_sha", 0),
        "deleted": counts.get("deleted", 0),
        "quarantined": counts.get("quarantined", 0),
    }


def _classify_inbox_name(fname):
    """Try to classify an inbox filename by its prefix: <provider>_<rest>.pdf."""
    base = os.path.splitext(fname)[0]
    prefix = base.split("_")[0].lower() if "_" in base else ""
    if prefix:
        for slug, category, keys in PROVIDERS:
            if prefix == slug:
                return slug, category
    return "other", "other"


def _slug_to_category(slug):
    """Look up a slug's category from PROVIDERS."""
    for s, cat, _ in PROVIDERS:
        if s == slug:
            return cat
    return "other"
