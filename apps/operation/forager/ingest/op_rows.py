"""Transform legacy Operations rows into the new prefixed raw model."""

import datetime

from .aliases import GPU_VENDORS, VENDOR_ALIASES, VENDOR_CATEGORIES


CLOUD_SOURCES = {"api", "cli", "bq", "manual"}
CLOUD_TYPES = {"inference", "gpu", "infra"}
TRANSACTION_CATEGORIES = {
    "revenue",
    "saas",
    "payroll",
    "admin",
    "office",
    "cloud",
}


def utc_now():
    return datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%d %H:%M:%S")


def month_bounds(month):
    year, mon = [int(part) for part in month.split("-")]
    next_year, next_mon = (year + 1, 1) if mon == 12 else (year, mon + 1)
    return (
        f"{year:04d}-{mon:02d}-01 00:00:00",
        f"{next_year:04d}-{next_mon:02d}-01 00:00:00",
    )


def utc_midnight(value):
    value = str(value or "")
    return f"{value} 00:00:00" if len(value) == 10 else value


def signed_negative(value):
    value = round(float(value or 0), 2)
    return -abs(value) if value else 0.0


def signed_positive(value):
    value = round(float(value or 0), 2)
    return abs(value) if value else 0.0


def resource_count(value=None):
    count = float(value or 1)
    if count <= 0:
        raise ValueError(f"resource_count must be > 0, got {value!r}")
    return count


def cloud_type_for_provider_category(category):
    category = category or "compute"
    if category == "compute":
        return "inference"
    if category == "compute-gpu":
        return "gpu"
    if category == "infra":
        return "infra"
    raise ValueError(f"unknown provider_monthly category for op_cloud: {category!r}")


def _legacy_manual_evidence(table):
    return f"legacy {table} manual row"


def provider_monthly_to_cloud(row, recorded_at):
    start, end = month_bounds(row["month"])
    manual = "manual" in str(row.get("source", ""))
    return {
        "source": row.get("source", ""),
        "vendor": row.get("vendor", ""),
        "type": cloud_type_for_provider_category(row.get("category") or "compute"),
        "start": start,
        "end": end,
        "credit": signed_negative(row.get("credit")),
        "paid": signed_negative(row.get("paid")),
        "currency": row.get("currency", ""),
        "resource_id": "",
        "resource_name": "",
        "resource_sku": "",
        "resource_count": 1.0,
        "model": "",
        "evidence": _legacy_manual_evidence("provider_monthly") if manual else "",
        "recorded_at": recorded_at,
    }


def _looks_like_infrastructure_gpu_row(row):
    text = " ".join(
        str(row.get(field, ""))
        for field in ("run_id", "deployment", "gpu")
    ).lower()
    markers = ("storage", "volume", "network volume", "100gb")
    return any(marker in text for marker in markers)


def gpu_run_to_cloud(row, recorded_at):
    kind = row.get("kind") or "gpu"
    if kind == "serverless":
        cloud_type = "inference"
    elif _looks_like_infrastructure_gpu_row(row):
        cloud_type = "infra"
    else:
        cloud_type = "gpu"

    start, end = month_bounds(row["month"])
    if row.get("started_at"):
        start = row["started_at"]
    if row.get("ended_at"):
        end = row["ended_at"]
    elif row.get("started_at"):
        end = ""
    elif row.get("hours") is None:
        end = ""

    manual = row.get("source") == "manual"
    return {
        "source": row.get("source", ""),
        "vendor": row.get("vendor", ""),
        "type": cloud_type,
        "start": start,
        "end": end,
        "credit": 0.0,
        "paid": signed_negative(row.get("cost")),
        "currency": row.get("currency", ""),
        "resource_id": row.get("run_id", ""),
        "resource_name": row.get("deployment", ""),
        "resource_sku": row.get("gpu", ""),
        "resource_count": resource_count(row.get("gpu_count")),
        "model": row.get("model", ""),
        "evidence": _legacy_manual_evidence("gpu_runs") if manual else "",
        "recorded_at": recorded_at,
    }


def _cloud_type_for_grant_vendor(vendor):
    if vendor in GPU_VENDORS:
        return "gpu"
    if VENDOR_CATEGORIES.get(vendor) == "infra":
        return "infra"
    return "inference"


def grant_to_cloud(row, recorded_at):
    expires = str(row.get("expires", ""))
    return {
        "source": "manual",
        "vendor": row.get("vendor", ""),
        "type": _cloud_type_for_grant_vendor(row.get("vendor", "")),
        "start": utc_midnight(row.get("start_date", "")),
        "end": "" if expires == "1970-01-01" else utc_midnight(expires),
        "credit": signed_positive(row.get("granted")),
        "paid": 0.0,
        "currency": row.get("currency", ""),
        "resource_id": "",
        "resource_name": row.get("label", ""),
        "resource_sku": "",
        "resource_count": 1.0,
        "model": "",
        "evidence": f"legacy grants row: {row.get('label', '')}".strip(),
        "recorded_at": recorded_at,
    }


def legacy_transaction_to_op(row, recorded_at):
    return {
        "source": "wise",
        "date": row.get("date", ""),
        "vendor": row.get("vendor", ""),
        "category": transaction_category(row.get("category", "")),
        "amount": signed_negative(row.get("charged_amount")),
        "currency": row.get("charged_currency", ""),
        "description": "",
        "evidence": "",
        "recorded_at": recorded_at,
    }


def pollen_monthly_to_op(row):
    requests_paid = (
        row.get("requests_paid")
        if "requests_paid" in row
        else row.get("requests")
    )
    requests_paid = int(requests_paid or 0)
    requests_quests = int(row.get("requests_quests") or 0)
    if "requests" in row:
        requests = int(row.get("requests") or 0)
        if requests != requests_paid + requests_quests:
            raise ValueError(
                "op_pollen row request split does not match requests: "
                f"{requests_paid} + {requests_quests} != {requests}"
            )
    return {
        "source": row.get("source") or "tinybird",
        "month": row.get("month", ""),
        "vendor": row.get("vendor", ""),
        "model": row.get("model", ""),
        "currency": row.get("currency", ""),
        "cost_paid": float(row.get("cost_paid") or 0),
        "cost_quests": float(row.get("cost_quests") or 0),
        "price_paid": float(row.get("price_paid") or 0),
        "price_quests": float(row.get("price_quests") or 0),
        "byop_paid": float(row.get("byop_paid") or 0),
        "byop_quests": float(row.get("byop_quests") or 0),
        "model_paid": float(row.get("model_paid") or 0),
        "model_quests": float(row.get("model_quests") or 0),
        "requests_paid": requests_paid,
        "requests_quests": requests_quests,
    }


def transaction_category(old_category):
    if old_category in ("compute", "compute-gpu", "infra"):
        return "cloud"
    return old_category


def build_cloud_rows(provider_rows, gpu_rows, grant_rows, recorded_at=None):
    recorded_at = recorded_at or utc_now()
    detailed_gpu_keys = {
        (row.get("vendor", ""), row.get("month", ""), row.get("currency", ""))
        for row in gpu_rows
    }
    rows = []
    for row in provider_rows:
        key = (row.get("vendor", ""), row.get("month", ""), row.get("currency", ""))
        if cloud_type_for_provider_category(row.get("category") or "compute") == "gpu":
            if key in detailed_gpu_keys:
                continue
        rows.append(provider_monthly_to_cloud(row, recorded_at))
    rows.extend(gpu_run_to_cloud(row, recorded_at) for row in gpu_rows)
    rows.extend(grant_to_cloud(row, recorded_at) for row in grant_rows)
    validate_cloud_rows(rows)
    return rows


def build_pollen_rows(pollen_rows):
    rows = [pollen_monthly_to_op(row) for row in pollen_rows]
    validate_pollen_rows(rows)
    return rows


def validate_cloud_rows(rows):
    for row in rows:
        if row.get("source") not in CLOUD_SOURCES:
            raise ValueError(f"op_cloud row has invalid source: {row.get('source')!r}")
        if row.get("vendor") not in VENDOR_ALIASES:
            raise ValueError(f"op_cloud row has invalid vendor: {row.get('vendor')!r}")
        if row.get("type") not in CLOUD_TYPES:
            raise ValueError(f"op_cloud row has invalid type: {row.get('type')!r}")
        if not row.get("start"):
            raise ValueError("op_cloud row missing start")
        if not row.get("currency"):
            raise ValueError("op_cloud row missing currency")
        float(row.get("credit", 0))
        float(row.get("paid", 0))
        resource_count(row.get("resource_count"))
        if row.get("source") == "manual" and not row.get("evidence"):
            raise ValueError("manual op_cloud row missing evidence")


def validate_transactions(rows):
    for row in rows:
        if row.get("source") != "wise":
            raise ValueError(f"op_transactions row has invalid source: {row.get('source')!r}")
        if row.get("vendor") and row.get("vendor") not in VENDOR_ALIASES:
            raise ValueError(f"op_transactions row has invalid vendor: {row.get('vendor')!r}")
        if row.get("category") not in TRANSACTION_CATEGORIES:
            raise ValueError(
                f"op_transactions row has invalid category: {row.get('category')!r}"
            )
        if not row.get("date"):
            raise ValueError("op_transactions row missing date")
        if not row.get("currency"):
            raise ValueError("op_transactions row missing currency")
        float(row.get("amount", 0))


def validate_pollen_rows(rows):
    for row in rows:
        if row.get("source") != "tinybird":
            raise ValueError(f"op_pollen row has invalid source: {row.get('source')!r}")
        if row.get("vendor") not in VENDOR_ALIASES:
            raise ValueError(f"op_pollen row has invalid vendor: {row.get('vendor')!r}")
        if not row.get("month"):
            raise ValueError("op_pollen row missing month")
        if not row.get("currency"):
            raise ValueError("op_pollen row missing currency")
        int(row.get("requests_paid") or 0)
        int(row.get("requests_quests") or 0)
