"""RunPod GraphQL balance connector.

POST https://api.runpod.io/graphql
Auth: Authorization: Bearer <RUNPOD_API_KEY>  (NOT api_key in URL — keeps key out of error strings)
Mapping: data.myself.clientBalance → prepaid_left_usd
         note includes currentSpendPerHr for runway alarm in run.py
"""
from ..common import http_json
from . import _brow


def balance(creds, now):
    key = creds["RUNPOD_API_KEY"]
    d = http_json(
        "https://api.runpod.io/graphql",
        {"Authorization": f"Bearer {key}"},
        data={"query": "query { myself { clientBalance currentSpendPerHr } }"},
    )
    m = d["data"]["myself"]
    return _brow(
        now, "runpod",
        prepaid=m["clientBalance"],
        note=f"spend_per_hr={m.get('currentSpendPerHr', 0)}",
    )
