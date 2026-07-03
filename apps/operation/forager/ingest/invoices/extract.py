"""PDF invoice extraction via Pollinations vision agent."""
import hashlib
import os
from datetime import datetime, timezone

from . import ai_agent
from .. import creds as _creds


_DS = "invoices"

_BILLING_KIND = {
    "monthly": "monthly_bill",
    "prepaid": "prepaid_topup",
    "reseller": "monthly_bill",
    "subscription": "subscription",
    "sponsored": "monthly_bill",
}


def sha256(path):
    with open(path, "rb") as f:
        return hashlib.sha256(f.read()).hexdigest()


def _build_billing_map(credits_data):
    """Build {provider_slug: kind_string} from credits.json pools."""
    bmap = {}
    for pool in credits_data.get("pools", []):
        billing = pool.get("billing", "")
        kind = _BILLING_KIND.get(billing, "monthly_bill")
        for prov in pool.get("providers", []):
            bmap[prov] = kind
    return bmap


def extract_pdf(path, file_hash, slug, category, config, today, billing_map=None, creds=None):
    """Run the once-per-PDF AI extractor and return its semantic invoice result."""
    archive_month = os.path.basename(os.path.dirname(path))
    if len(archive_month) != 7 or archive_month[4] != "-":
        archive_month = ""
    known_provider_slugs = sorted(set((billing_map or {}).keys()) | ({slug} if slug else set()))
    hints = {
        "provider_hint": slug or "other",
        "category_hint": category or "other",
        "kind_hint": (billing_map or {}).get(slug or "", ""),
        "archive_month_hint": archive_month,
        "known_provider_slugs": known_provider_slugs,
        "filename": path.split("/")[-1],
    }
    agent_creds = creds or _load_agent_creds()
    return ai_agent.extract_pdf(path, file_hash, hints, config, today, creds=agent_creds)


def build_row(path, slug, category, msgid, source, config, today,
              billing_map=None, ingested_at=None, result=None, file_hash=None,
              creds=None):
    """Extract one PDF and return one invoices datasource row."""
    file_hash = file_hash or sha256(path)
    if billing_map is None:
        billing_map = _build_billing_map(_creds.load_credits())

    result = result or extract_pdf(
        path, file_hash, slug, category, config, today,
        billing_map=billing_map, creds=creds,
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


def extract_and_push(tb_ops, path, slug, category, msgid, source, config, today,
                     billing_map=None, result=None, file_hash=None, creds=None):
    """Append exactly one AI-extracted invoice row."""
    row = build_row(
        path, slug, category, msgid, source, config, today,
        billing_map=billing_map, result=result, file_hash=file_hash, creds=creds,
    )
    tb_ops.append(_DS, [row])
    return row


def _invoice_result(result):
    inv = result.get("invoice") if isinstance(result, dict) and "invoice" in result else result
    if not isinstance(inv, dict):
        raise RuntimeError("invoice agent returned a non-object result")

    columns = ai_agent.agent_columns()
    missing = [col["name"] for col in columns if col["name"] not in inv]
    if missing:
        raise RuntimeError(f"invoice agent result missing fields: {', '.join(missing)}")

    return {
        col["name"]: _normalize(inv[col["name"]], col["type"])
        for col in columns
    }


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
