from __future__ import annotations

import pytest

from floret.model_policy import (
    SelectionRequest,
    comparable_price,
    eligible_models,
    parse_policy_snapshot,
    select_model,
)


def model(
    modality: str = "image",
    *,
    endpoint: str = "/image/{prompt}",
    **metadata: object,
) -> dict[str, object]:
    return {
        "modalities": [modality],
        "supported_endpoints": [endpoint],
        "capabilities": [],
        "input_modalities": ["text"],
        "output_modalities": [modality],
        **metadata,
    }


def request(**changes: object) -> SelectionRequest:
    values: dict[str, object] = {
        "task_family": "image.general",
        "modality": "image",
        "endpoint": "/image/{prompt}",
    }
    values.update(changes)
    return SelectionRequest(**values)  # type: ignore[arg-type]


def policy(
    *, recommendations: list[dict[str, str]] | None = None, revision: str = "cat-2"
):
    return parse_policy_snapshot(
        {
            "revision": "policy-2",
            "catalogRevision": revision,
            "incumbents": {"image.general": "old"},
            "recommendations": recommendations or [],
        }
    )


def test_catalog_add_remove_keeps_stable_incumbent_without_review():
    assert (
        select_model(
            {"old": model(), "new": model()},
            policy(),
            request(),
            catalog_revision="cat-2",
        )
        == "old"
    )
    assert (
        select_model({"new": model()}, policy(), request(), catalog_revision="cat-2")
        == "new"
    )


def test_price_units_must_match_and_unknown_price_is_not_comparable():
    assert (
        comparable_price(
            {"pricing": {"price": 1, "unit": "image"}},
            {"pricing": {"price": 2, "unit": "second"}},
        )
        is None
    )
    assert (
        comparable_price({"pricing": {}}, {"pricing": {"price": 2, "unit": "image"}})
        is None
    )
    assert comparable_price(
        {"pricing": {"price": 1, "unit": "image"}},
        {"pricing": {"price": 2, "unit": "image"}},
    ) == (1.0, 2.0, "image")


def test_no_quality_evidence_means_no_automatic_quality_claim_or_promotion():
    catalog = {"old": model(), "new": model()}

    assert select_model(catalog, policy(), request(), catalog_revision="cat-2") == "old"


def test_pin_is_preserved_but_still_requires_access_and_compatibility():
    catalog = {
        "old": model(),
        "hidden-pin": model(hidden=True),
        "wrong": model("video", endpoint="/video/{prompt}"),
    }

    assert (
        select_model(
            catalog,
            policy(),
            request(
                pinned_model="hidden-pin",
                eligible_model_ids=frozenset({"hidden-pin"}),
            ),
            catalog_revision="cat-2",
        )
        == "hidden-pin"
    )
    assert (
        select_model(
            catalog,
            policy(),
            request(pinned_model="hidden-pin", eligible_model_ids=frozenset({"old"})),
            catalog_revision="cat-2",
        )
        is None
    )
    assert (
        select_model(
            catalog,
            policy(),
            request(pinned_model="wrong"),
            catalog_revision="cat-2",
        )
        is None
    )


def test_hidden_fallback_alpha_and_request_ineligible_are_excluded():
    catalog = {
        "old": model(),
        "hidden": model(hidden=True),
        "fallback": model(fallback=True),
        "fallback-only": model(fallbackOnly=True),
        "fallback-snake": model(fallback_only=True),
        "alpha": model(status="alpha"),
        "alpha-flag": model(alpha=True),
        "other-user": model(),
    }

    assert eligible_models(
        catalog, request(eligible_model_ids=frozenset({"old", "other-user"}))
    ) == ("old", "other-user")


def test_paid_false_preserves_existing_zero_or_unknown_price_semantics():
    catalog = {
        "free": model(pricing={"prompt": 0, "completion": 0}),
        "unknown": model(pricing={}),
        "paid": model(pricing={"completion": 0.1}),
    }

    assert eligible_models(catalog, request(paid=False)) == ("free", "unknown")


def test_revision_scoped_advisory_promotes_and_stale_advisory_does_not():
    catalog = {"old": model(), "new": model()}
    recommendation = [
        {
            "task_family": "image.general",
            "model": "new",
            "action": "promote",
            "reason": "reviewed new catalog entry against incumbent",
            "source": "advisory",
        }
    ]

    assert (
        select_model(
            catalog,
            policy(recommendations=recommendation),
            request(),
            catalog_revision="cat-2",
        )
        == "new"
    )
    assert (
        select_model(
            catalog,
            policy(recommendations=recommendation, revision="cat-1"),
            request(),
            catalog_revision="cat-2",
        )
        == "old"
    )


def test_avoid_excludes_incumbent_and_candidate_is_not_accepted():
    catalog = {"old": model(), "safe": model()}
    avoided = [
        {
            "task_family": "image.general",
            "model": "old",
            "action": "avoid",
            "reason": "review found incompatibility",
            "source": "advisory",
        }
    ]
    assert (
        select_model(
            catalog,
            policy(recommendations=avoided),
            request(),
            catalog_revision="cat-2",
        )
        == "safe"
    )
    with pytest.raises(ValueError, match="unsupported recommendation action"):
        policy(
            recommendations=[
                {
                    "task_family": "image.general",
                    "model": "safe",
                    "action": "candidate",
                    "reason": "not a promotion decision",
                    "source": "advisory",
                }
            ]
        )


def test_measured_rollback_is_applied_without_fabricating_measurement():
    rollback = [
        {
            "task_family": "image.general",
            "model_id": "previous",
            "action": "rollback",
            "reason": "trusted success evidence regressed",
            "source": "measured",
        }
    ]
    catalog = {"old": model(), "previous": model()}

    assert (
        select_model(
            catalog,
            policy(recommendations=rollback),
            request(),
            catalog_revision="cat-2",
        )
        == "previous"
    )


def test_policy_parser_rejects_unattributed_or_ambiguous_claims():
    with pytest.raises(ValueError, match="recommendation fields"):
        parse_policy_snapshot(
            {
                "revision": "p",
                "catalog_revision": "c",
                "recommendations": [
                    {
                        "task_family": "image.general",
                        "model": "new",
                        "action": "promote",
                    }
                ],
            }
        )
    with pytest.raises(ValueError, match="source"):
        parse_policy_snapshot(
            {
                "revision": "p",
                "catalog_revision": "c",
                "recommendations": [
                    {
                        "task_family": "image.general",
                        "model": "new",
                        "action": "promote",
                        "reason": "unsupported",
                        "source": "invented",
                    }
                ],
            }
        )
