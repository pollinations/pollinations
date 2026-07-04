"""PDF invoice extraction via Pollinations vision agent."""
import hashlib
import os
from datetime import datetime, timezone

from . import ai_agent
from .. import creds as _creds
from ..aliases import PROVIDER_ALIASES

_DS = "invoices"

_INVOICE_PROVIDER_ALIASES = {
    "amazon": "amazon",
    "ayushman bhattacharya": "self-issued",
    "ayushman_bhattacharya": "self-issued",
    "buffer": "buffer",
    "byteplus": "bytedance",
    "canva": "canva",
    "denns biomarkt": "denns-biomarkt",
    "denns_biomarkt": "denns-biomarkt",
    "gaswerksiedlung berlin": "gaswerksiedlung",
    "gaswerksiedlung_berlin": "gaswerksiedlung",
    "google-cloud": "google",
    "google cloud": "google",
    "ionet": "io.net",
    "myceli": "self-issued",
    "myceli.ai": "self-issued",
    "myceli_ai": "self-issued",
    "naturenergie hochrhein": "naturenergie",
    "naturenergie_hochrhein": "naturenergie",
    "notion": "notion",
    "ovh": "ovhcloud",
    "pollinations": "self-issued",
    "pollinations.ai": "self-issued",
    "proton": "protonvpn",
    "so lab x": "so-lab-x",
    "so_lab_x": "so-lab-x",
    "stripe": "stripe",
    "thot": "other",
    "zara home": "zara-home",
    "zara_home": "zara-home",
}


def sha256(path):
    with open(path, "rb") as f:
        return hashlib.sha256(f.read()).hexdigest()


def _build_provider_slugs(credits_data):
    """Provider slugs from credits.json pools."""
    slugs = set()
    for pool in credits_data.get("pools", []):
        slugs.update(pool.get("providers", []))
    return slugs


def extract_pdf(path, file_hash, slug, category, config, today, provider_slugs=None, creds=None):
    """Run the once-per-PDF AI extractor and return its semantic invoice result."""
    archive_month = os.path.basename(os.path.dirname(path))
    if len(archive_month) != 7 or archive_month[4] != "-":
        archive_month = ""
    known_provider_slugs = sorted(set(provider_slugs or set()) | ({slug} if slug else set()))
    hints = {
        "provider_hint": slug or "other",
        "category_hint": category or "other",
        "archive_month_hint": archive_month,
        "known_provider_slugs": known_provider_slugs,
        "filename": path.split("/")[-1],
    }
    agent_creds = creds or _load_agent_creds()
    return ai_agent.extract_pdf(path, file_hash, hints, config, today, creds=agent_creds)


def build_row(path, slug, category, msgid, source, config, today,
              provider_slugs=None, ingested_at=None, result=None, file_hash=None,
              creds=None):
    """Extract one PDF and return one invoices datasource row."""
    file_hash = file_hash or sha256(path)

    result = result or extract_pdf(
        path, file_hash, slug, category, config, today,
        provider_slugs=provider_slugs, creds=creds,
    )
    result = _with_canonical_provider(result, slug)
    return build_row_from_result(
        path, file_hash, result, source, today,
        ingested_at=ingested_at,
    )


def build_row_from_result(path, file_hash, result, source, today, ingested_at=None):
    """Map the agent result into the exact invoices datasource row shape."""
    inv = _invoice_result(result)

    if ingested_at is None:
        ingested_at = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")

    runner_values = {
        "sha256": file_hash,
        "source": source,
        "file_ref": path,
        "ingested_at": ingested_at,
    }
    row = {}
    for col in ai_agent.datasource_columns():
        name = col["name"]
        row[name] = runner_values[name] if name in runner_values else inv[name]
    return row


def canonical_invoice_provider(provider):
    value = _clean(provider).lower()
    if not value:
        return "other"
    if value in _INVOICE_PROVIDER_ALIASES:
        return _INVOICE_PROVIDER_ALIASES[value]
    for slug, aliases in PROVIDER_ALIASES.items():
        if value == slug or value in aliases:
            return slug
    return value


def extract_and_push(tb_ops, path, slug, category, msgid, source, config, today,
                     provider_slugs=None, result=None, file_hash=None, creds=None):
    """Append exactly one accepted AI-extracted invoice row."""
    result = result or extract_pdf(
        path, file_hash or sha256(path), slug, category, config, today,
        provider_slugs=provider_slugs, creds=creds,
    )
    row = build_row(
        path, slug, category, msgid, source, config, today,
        provider_slugs=provider_slugs, result=result, file_hash=file_hash, creds=creds,
    )
    status = document_status(result)
    row["_document_status"] = status
    if status == "parsed":
        append_row = dict(row)
        append_row.pop("_document_status", None)
        tb_ops.append(_DS, [append_row])
    return row


def document_status(result):
    """Return the internal PDF routing decision; legacy fixtures default to parsed."""
    inv = result.get("invoice") if isinstance(result, dict) and "invoice" in result else result
    if not isinstance(inv, dict):
        return "needs_review"
    status = inv.get(ai_agent.INTERNAL_STATUS_FIELD)
    if status in {"parsed", "not_invoice", "needs_review"}:
        return status
    legacy_status = inv.get("status")
    if legacy_status in {"parsed", "not_invoice", "needs_review"}:
        return legacy_status
    return "parsed"


def _invoice_result(result):
    inv = result.get("invoice") if isinstance(result, dict) and "invoice" in result else result
    if not isinstance(inv, dict):
        raise RuntimeError("invoice agent returned a non-object result")

    datasource_field_names = set(ai_agent.datasource_field_order())
    columns = [
        col for col in ai_agent.agent_columns()
        if col["name"] in datasource_field_names
    ]
    missing = [col["name"] for col in columns if col["name"] not in inv]
    if missing:
        raise RuntimeError(f"invoice agent result missing fields: {', '.join(missing)}")

    row = {
        col["name"]: _normalize(inv[col["name"]], col["type"])
        for col in columns
    }
    row["provider"] = canonical_invoice_provider(row.get("provider"))
    return row


def _with_canonical_provider(result, slug):
    if not slug or slug == "other":
        return result

    if isinstance(result, dict) and "invoice" in result and isinstance(result["invoice"], dict):
        out = dict(result)
        inv = dict(result["invoice"])
        inv["provider"] = slug
        out["invoice"] = inv
        return out

    if isinstance(result, dict):
        out = dict(result)
        out["provider"] = slug
        return out

    return result


def _normalize(value, tb_type):
    if _is_number_type(tb_type):
        return _to_float(value)
    return _clean(value)


def _is_number_type(tb_type):
    base = tb_type.split("(", 1)[0]
    return base.startswith(("Float", "Int", "UInt", "Decimal"))


def _clean(value):
    if value is None:
        return ""
    return str(value).strip()


def _to_float(value):
    try:
        if isinstance(value, str):
            value = value.replace(",", "")
        return float(value)
    except (TypeError, ValueError):
        raise RuntimeError(f"invoice agent returned a non-numeric value: {value!r}")


def _load_agent_creds():
    return _creds.load_creds()
