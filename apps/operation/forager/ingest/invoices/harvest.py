"""Harvest invoice PDFs from Gmail (via `gog`) and the local inbox drop folder.

gmail_sweep  — searches Gmail, downloads new PDFs into YYYY-MM/ dirs, pushes to TB.
inbox_sweep  — processes PDFs dropped into <archive_dir>/inbox/, moves to YYYY-MM/.
classify     — maps (from, subject) → (slug, category).
pick_primary — from an Invoice+Receipt pair keeps the Invoice PDF.
"""
import json
import os
import re
import subprocess
import sys
from collections import Counter, defaultdict
from datetime import datetime

from . import extract as _extract
from .. import creds as _creds


# ---------------------------------------------------------------------------
# Provider registry
# Each entry: (slug, category, keys)
# Order matters — specifics first.
# ---------------------------------------------------------------------------

PROVIDERS = [
    # ----- compute -----
    ("google-workspace", "saas",    ["google workspace"]),
    ("google-cloud",     "compute", ["google cloud", "cloud platform", "google llc", "google payments"]),
    ("anthropic",        "compute", ["anthropic"]),
    ("openai",           "compute", ["openai"]),
    ("azure",            "compute", ["azure", "microsoft"]),
    ("aws",              "compute", ["amazon web services", "aws ", "amazon.com", "aws,"]),
    ("alibaba",          "compute", ["alibaba", "aliyun", "alibabacloud", "dashscope"]),
    ("aws",              "compute", ["automat-it", "automat it"]),   # reseller
    ("replicate",        "compute", ["replicate"]),
    ("xai",              "compute", ["x.ai", "xai"]),
    ("fal",              "compute", ["fal - features", "fal.ai", "features & labels", "withorb"]),
    ("elevenlabs",       "compute", ["elevenlabs", "eleven labs"]),
    ("fireworks",        "compute", ["fireworks"]),
    ("deepinfra",        "compute", ["deepinfra", "deep infra"]),
    ("perplexity",       "compute", ["perplexity"]),
    ("runpod",           "compute", ["runpod"]),
    ("lambda",           "compute", ["lambda", "lambdal"]),
    ("vast",             "compute", ["vast.ai", "vast ai", "vast, inc"]),
    ("assemblyai",       "compute", ["assemblyai", "assembly ai"]),
    ("modal",            "compute", ["modal labs", "modal.com", "modal, inc"]),
    ("ionet",            "compute", ["io.net", "io net"]),
    ("byteplus",         "compute", ["byteplus", "bytedance", "volcengine"]),
    ("ovh",              "compute", ["ovh"]),
    ("stability",        "compute", ["stability ai", "stability"]),
    ("pruna",            "compute", ["pruna"]),
    ("openrouter",       "compute", ["openrouter", "open router"]),
    ("inception",        "compute", ["inception"]),
    # ----- infra -----
    ("tinybird",         "infra",   ["tinybird"]),
    ("cloudflare",       "infra",   ["cloudflare"]),
    ("vercel",           "infra",   ["vercel"]),
    ("digitalocean",     "infra",   ["digitalocean", "digital ocean"]),
    # ----- saas/office -----
    ("exafunction",      "saas",    ["exafunction"]),
    ("daytona",          "saas",    ["daytona"]),
    ("typeless",         "saas",    ["typeless"]),
    ("wispr",            "saas",    ["wispr"]),
    ("slack",            "saas",    ["slack"]),
    ("tele2",            "saas",    ["tele2"]),
    ("enty",             "saas",    ["enty"]),
    ("naturenergie",     "saas",    ["naturenergie"]),
    ("wise",             "saas",    ["wise "]),
    ("github",           "saas",    ["github"]),
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
        date_filter = f"after:{start} newer_than:3d"

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
    return re.sub(r"[^A-Za-z0-9._-]+", "-", s).strip("-")[:60]


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


# ---------------------------------------------------------------------------
# Gmail sweep
# ---------------------------------------------------------------------------

def search_all(config, since=None):
    """Search Gmail and return a merged dict of msgid → metadata (dedup by msgid)."""
    queries = _make_queries(config.get("months_start", "2026/01/01"), since)
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


def gmail_sweep(config, tb_ops, today, since=None):
    """Search Gmail for invoice PDFs, download new ones, push each to TB.

    Args:
        config:  forager config dict (archive_dir, gog_account, months_start, …)
        tb_ops:  TB instance
        today:   ISO date string "YYYY-MM-DD"
        since:   optional backfill start date "YYYY/MM/DD" (overrides daily 3d window)

    Returns:
        dict with counts: pushed, skipped_msgid, dup_sha, no_pdf
    """
    counts = Counter()
    known_shas = _known_sha256s(tb_ops)
    billing_map = _extract._build_billing_map(_creds.load_credits())

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
        mdir = os.path.join(config["archive_dir"], it["month"])
        os.makedirs(mdir, exist_ok=True)
        mid8 = it["id"][:8]

        # Idempotency: msgid8 already in month dir → skip
        if any(mid8 in f for f in os.listdir(mdir)):
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
                "--out", mdir, "--name", name)

            path = os.path.join(mdir, name)
            if not os.path.exists(path):
                sys.stderr.write(f"  !! download failed: {name}\n")
                continue

            # sha256 dedup against TB
            file_sha = _extract.sha256(path)
            if file_sha in known_shas:
                os.remove(path)
                counts["dup_sha"] += 1
                sys.stderr.write(f"  dup sha: {name}\n")
                continue

            known_shas.add(file_sha)

            # Only pass the primary PDF to extract; archive receipts without pushing
            if a is not primary:
                continue

            _extract.extract_and_push(
                tb_ops, path,
                it["provider"], it["category"],
                it["id"], "email",
                config, today,
                billing_map=billing_map,
            )
            counts["pushed"] += 1
            sys.stderr.write(f"  {it['month']} {it['provider']:14} {it['date'][:10]}\n")

    return dict(counts)


# ---------------------------------------------------------------------------
# Inbox sweep
# ---------------------------------------------------------------------------

def inbox_sweep(config, tb_ops, today):
    """Process PDFs dropped into <archive_dir>/inbox/.

    For each PDF:
    1. sha256 dedup vs TB — skip if known.
    2. Classify by filename prefix (<provider>_...) if it matches.
       Else run extract.parse for a parser hint; else ("other","other") + needs_label.
    3. Move to <archive_dir>/<YYYY-MM>/<provider>_<date>_<sha8>_<origname>.pdf
       (month from parsed period_month, fallback today's YYYY-MM).
    4. Push its row via extract_and_push.

    Args:
        config:  forager config dict
        tb_ops:  TB instance
        today:   ISO date string "YYYY-MM-DD"

    Returns:
        dict with counts: pushed, dup_sha
    """
    counts = Counter()
    inbox_dir = os.path.join(config["archive_dir"], "inbox")
    os.makedirs(inbox_dir, exist_ok=True)

    pdfs = sorted(
        f for f in os.listdir(inbox_dir)
        if f.lower().endswith(".pdf")
    )
    if not pdfs:
        return {"pushed": 0, "dup_sha": 0}

    known_shas = _known_sha256s(tb_ops)
    billing_map = _extract._build_billing_map(_creds.load_credits())

    for fname in pdfs:
        src = os.path.join(inbox_dir, fname)

        # sha256 dedup
        file_sha = _extract.sha256(src)
        if file_sha in known_shas:
            counts["dup_sha"] += 1
            sys.stderr.write(f"  inbox dup sha: {fname}\n")
            continue

        # Classify: try filename prefix first
        slug, category = _classify_inbox_name(fname)

        # Extract text once; reuse for both provider hint and period_month
        txt = _extract.pdf_text(src)
        result = _extract.parse(txt, slug, config, today)
        inv = result.get("invoice") or {}

        # If prefix match failed, try parser hint then re-parse with correct slug
        if slug == "other":
            hint_slug = (result.get("extras") or {}).get("provider_hint", "")
            if hint_slug:
                hint_slug_cat = _slug_to_category(hint_slug)
                slug, category = hint_slug, hint_slug_cat
                result = _extract.parse(txt, slug, config, today)
                inv = result.get("invoice") or {}

        period_month = inv.get("period_month", "") or today[:7]

        # Build destination filename
        sha8 = file_sha[:8]
        dest_name = f"{slug}_{period_month}_{sha8}_{safe(fname)}"
        dest_dir = os.path.join(config["archive_dir"], period_month)
        os.makedirs(dest_dir, exist_ok=True)
        dest_path = os.path.join(dest_dir, dest_name)
        os.rename(src, dest_path)

        known_shas.add(file_sha)

        _extract.extract_and_push(
            tb_ops, dest_path,
            slug, category,
            "",  # no msgid for inbox files
            "inbox",
            config, today,
            billing_map=billing_map,
        )
        counts["pushed"] += 1
        sys.stderr.write(f"  inbox: {fname} → {period_month}/{dest_name}\n")

    return {"pushed": counts.get("pushed", 0), "dup_sha": counts.get("dup_sha", 0)}


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
