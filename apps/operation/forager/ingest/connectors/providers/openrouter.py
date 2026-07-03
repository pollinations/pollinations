"""OpenRouter REST balance connector.

GET https://openrouter.ai/api/v1/credits
Auth: Authorization: Bearer <OPENROUTER_MANAGEMENT_API_KEY>
Mapping: data.total_credits → granted, data.total_usage → spent, granted−spent → left
"""
from ..common import http_json
from . import _brow


def balance(creds, now):
    key = creds["OPENROUTER_MANAGEMENT_API_KEY"]
    d = http_json(
        "https://openrouter.ai/api/v1/credits",
        {"Authorization": f"Bearer {key}"},
    )["data"]
    granted = float(d["total_credits"])
    spent = float(d["total_usage"])
    return _brow(now, "openrouter", granted=granted, spent=spent, left=granted - spent)
