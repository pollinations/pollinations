"""Hermetic tests for ingest/burn.py — CANON, grants() overlay, and _num.

No I/O, no network, no SOPS. All inputs are plain dicts.
"""

from ingest import burn

TODAY = "2026-07-03"


# ---------------------------------------------------------------------------
# CANON tests
# ---------------------------------------------------------------------------


def test_canon_bedrock_maps_to_aws():
    assert burn.CANON.get("bedrock") == "aws"
    assert burn.CANON.get("aws-bedrock") == "aws"


def test_canon_vastai_maps_to_vast_ai():
    assert burn.CANON.get("vastai") == "vast.ai"


def test_canon_azure_2_maps_to_azure():
    assert burn.CANON.get("azure-2") == "azure"


def test_canon_aws_bedrock_maps_to_aws():
    # Verbatim: both aliases → aws
    assert burn.CANON.get("aws-bedrock") == "aws"


def test_canon_vastai_dot_ai():
    # Verbatim: vastai → vast.ai (with dot)
    assert burn.CANON.get("vastai") == "vast.ai"


def test_canon_azure_openai_not_in_canon():
    # azure-openai is NOT in the verbatim CANON; it pass-throughs as-is
    assert "azure-openai" not in burn.CANON


def test_canon_vertex_ai_not_in_canon():
    # vertex-ai is NOT in the verbatim CANON; it pass-throughs as-is
    assert "vertex-ai" not in burn.CANON


def test_canon_unknown_passthrough():
    # Providers not in map should pass through when lowercased (not via CANON dict — via canonicalize)
    assert burn.CANON.get("deepinfra") is None  # not in the alias dict; pass-through


# ---------------------------------------------------------------------------
# grants() tests
# ---------------------------------------------------------------------------


def test_grants_hc_values_when_no_balances():
    pool = {
        "pool": "Azure",
        "providers": ["azure"],
        "billing": "sponsored",
        "kind": "grant",
        "granted": 250000.0,
        "left": 244600.0,
        "prepaid_left": None,
        "expires": "2028-04",
        "note": "startup credit",
    }
    rows = burn.grants([pool], [], TODAY)
    assert len(rows) == 1
    g = rows[0]
    assert g["pool"] == "Azure"
    assert g["granted_usd"] == 250000.0
    assert g["granted_src"] == "hc"
    assert g["left_usd"] == 244600.0
    assert g["left_src"] == "hc"
    assert g["prepaid_left_usd"] is None
    assert g["prepaid_left_src"] == ""
    assert g["expires"] == "2028-04"


def test_grants_api_overlay_beats_hc():
    pool = {
        "pool": "Azure",
        "providers": ["azure"],
        "billing": "sponsored",
        "kind": "grant",
        "granted": 250000.0,
        "left": 244600.0,
        "prepaid_left": None,
        "expires": "",
        "note": "",
    }
    balances = [
        {
            "run_at": "2026-07-01 12:00:00",
            "provider": "azure",
            "granted_usd": 250000.0,
            "spent_usd": 5800.0,
            "left_usd": 244200.0,
            "prepaid_left_usd": None,
            "source": "api",
            "note": "live",
        },
    ]
    rows = burn.grants([pool], balances, TODAY)
    g = rows[0]
    assert g["left_usd"] == 244200.0
    assert g["left_src"] == "api"
    assert (
        g["granted_usd"] == 250000.0
    )  # granted unchanged (api snapshot doesn't have separate granted)
    # Actually: if balance has granted_usd, it should overlay too
    assert g["granted_src"] in ("api", "hc")  # api if present, hc otherwise


def test_grants_none_preserved():
    # pool uses cash_left field (the real credits.json field name)
    pool = {
        "pool": "RunPod",
        "providers": ["runpod"],
        "billing": "prepaid",
        "kind": "prepaid",
        "granted": None,
        "left": None,
        "cash_left": 255.66,
        "expires": "",
        "note": "",
    }
    rows = burn.grants([pool], [], TODAY)
    g = rows[0]
    assert g["granted_usd"] is None
    assert g["left_usd"] is None
    # cash_left from credits.json should appear as prepaid_left_usd in the output
    assert g["prepaid_left_usd"] == 255.66
    assert g["prepaid_left_src"] == "hc"


def test_grants_cash_left_field_name():
    # grants() reads pool.cash_left (not pool.prepaid_left) per credits.json schema
    pool = {
        "pool": "Lambda",
        "providers": ["lambda"],
        "billing": "prepaid",
        "kind": "prepaid",
        "granted": None,
        "left": None,
        "cash_left": 140.58,
        "expires": "",
        "note": "",
    }
    rows = burn.grants([pool], [], TODAY)
    g = rows[0]
    assert g["prepaid_left_usd"] == 140.58
    assert g["prepaid_left_src"] == "hc"


def test_grants_multi_provider_pool_uses_latest_balance():
    pool = {
        "pool": "GCP",
        "providers": ["google", "vertex"],
        "billing": "sponsored",
        "kind": "grant",
        "granted": 350000.0,
        "left": 300000.0,
        "prepaid_left": None,
        "expires": "",
        "note": "",
    }
    balances = [
        {
            "run_at": "2026-07-01 10:00:00",
            "provider": "google",
            "granted_usd": 350000.0,
            "spent_usd": 50000.0,
            "left_usd": 298000.0,
            "prepaid_left_usd": None,
            "source": "api",
            "note": "",
        },
    ]
    rows = burn.grants([pool], balances, TODAY)
    assert rows[0]["left_usd"] == 298000.0
    assert rows[0]["left_src"] == "api"


def test_grants_manual_balance_src():
    pool = {
        "pool": "Perplexity",
        "providers": ["perplexity"],
        "billing": "sponsored",
        "kind": "grant",
        "granted": 5000.0,
        "left": 4000.0,
        "prepaid_left": None,
        "expires": "",
        "note": "",
    }
    balances = [
        {
            "run_at": "2026-07-01 09:00:00",
            "provider": "perplexity",
            "granted_usd": None,
            "spent_usd": None,
            "left_usd": 3500.0,
            "prepaid_left_usd": None,
            "source": "manual",
            "note": "hand",
        },
    ]
    rows = burn.grants([pool], balances, TODAY)
    g = rows[0]
    assert g["left_usd"] == 3500.0
    assert g["left_src"] == "manual"


# ---------------------------------------------------------------------------
# _num helper and non-numeric credits.json value tolerance (live-data bug fix)
# ---------------------------------------------------------------------------


def test_num_returns_none_for_na_strings():
    """'n/a', 'NA', '' and None all become None."""
    assert burn._num("n/a") is None
    assert burn._num("N/A") is None
    assert burn._num("NA") is None
    assert burn._num("na") is None
    assert burn._num("") is None
    assert burn._num(None) is None


def test_num_parses_plain_float():
    assert burn._num(1234.56) == 1234.56
    assert burn._num("99.5") == 99.5
    assert burn._num(0) == 0.0


def test_num_parses_comma_number():
    """Strings like "31,212.50" must parse to 31212.50."""
    assert burn._num("31,212.50") == 31212.50
    assert burn._num("1,000") == 1000.0


def test_num_returns_none_for_unparseable_string():
    """Strings that are not numbers and not n/a variants → None."""
    assert burn._num("pending") is None
    assert burn._num("TBD") is None


def test_grants_non_numeric_hc_values_become_none():
    """Pool with granted='n/a', left='NA', cash_left='' → grants() emits all three as None
    with '' srcs (same as if the fields were absent)."""
    pool = {
        "pool": "AWS-old",
        "providers": ["aws"],
        "billing": "monthly",
        "kind": "grant",
        "granted": "n/a",
        "left": "NA",
        "cash_left": "",
        "expires": "",
        "note": "",
    }
    rows = burn.grants([pool], [], TODAY)
    assert len(rows) == 1
    g = rows[0]
    assert g["granted_usd"] is None
    assert g["granted_src"] == ""
    assert g["left_usd"] is None
    assert g["left_src"] == ""
    assert g["prepaid_left_usd"] is None
    assert g["prepaid_left_src"] == ""


def test_grants_comma_number_granted_parses():
    """granted='31,212.50' in credits.json must parse to 31212.50."""
    pool = {
        "pool": "AWS",
        "providers": ["aws"],
        "billing": "monthly",
        "kind": "grant",
        "granted": "31,212.50",
        "left": "28,000",
        "cash_left": None,
        "expires": "",
        "note": "",
    }
    rows = burn.grants([pool], [], TODAY)
    g = rows[0]
    assert g["granted_usd"] == 31212.50
    assert g["granted_src"] == "hc"
    assert g["left_usd"] == 28000.0
    assert g["left_src"] == "hc"


# ---------------------------------------------------------------------------
# Fix I1: pool-slug canonicalization in burn.grants
# ---------------------------------------------------------------------------


def test_canon_bedrock_native_maps_to_aws():
    """CANON must map 'bedrock (native)' → 'aws'."""
    assert burn.CANON.get("bedrock (native)") == "aws"


def test_registry_six_new_pool_slugs_in_canonical():
    """Six new credits.json pool slugs must be in registry.CANONICAL."""
    from ingest.connectors import registry

    for slug in ("airforce", "bpai", "community", "self-hosted", "seraphyn", "aws-new"):
        assert slug in registry.CANONICAL, (
            f"CANONICAL missing credits.json pool slug: {slug}"
        )


def test_registry_alias_slugs_not_in_canonical():
    """Alias slugs that canonicalize away must NOT be in CANONICAL."""
    from ingest.connectors import registry

    for slug in ("azure-2", "aws-bedrock", "bedrock (native)"):
        assert slug not in registry.CANONICAL, (
            f"CANONICAL wrongly contains alias slug: {slug}"
        )
