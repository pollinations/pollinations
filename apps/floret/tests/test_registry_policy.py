from __future__ import annotations

import pytest

from floret import registry


@pytest.fixture(autouse=True)
def restore_registry_globals(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(registry, "_registry_cache", registry._registry_cache)
    monkeypatch.setattr(registry, "_policy_snapshot", registry._policy_snapshot)
    monkeypatch.setattr(registry, "_catalog_revision", registry._catalog_revision)


def raw_model(name: str, **metadata: object) -> dict[str, object]:
    return {
        "name": name,
        "category": "image",
        "input_modalities": ["text"],
        "output_modalities": ["image"],
        "supported_endpoints": ["/image/{prompt}"],
        "capabilities": [],
        **metadata,
    }


def install(
    recommendations: list[dict[str, str]] | None = None,
    *,
    review_catalog_revision: str = "catalog-2",
) -> None:
    registry.install_global_snapshot(
        {
            "version": "catalog-2",
            "catalog": [raw_model("old"), raw_model("new")],
            "review": {
                "revision": "review-2",
                "catalogRevision": review_catalog_revision,
                "incumbents": [{"task_family": "image.general", "model": "old"}],
                "recommendations": recommendations or [],
            },
        }
    )


def test_install_global_snapshot_drives_pick_model():
    install(
        [
            {
                "task_family": "image.general",
                "model": "new",
                "action": "promote",
                "reason": "reviewed catalog delta",
                "source": "advisory",
            }
        ]
    )

    assert registry.pick_model("image") == "new"


def test_stale_camel_case_review_does_not_promote():
    install(
        [
            {
                "task_family": "image.general",
                "model": "new",
                "action": "promote",
                "reason": "reviewed old catalog",
                "source": "advisory",
            }
        ],
        review_catalog_revision="catalog-1",
    )

    assert registry.pick_model("image") == "old"


def test_request_catalog_filters_pick_and_summary_without_global_mutation():
    install()
    token = registry.set_request_catalog({"old": {}})
    try:
        assert registry.pick_model("image") == "old"
        assert set(registry.get_model_catalog()) == {"old"}
    finally:
        registry.reset_request_catalog(token)

    assert set(registry.get_model_catalog()) == {"old", "new"}


def test_empty_request_catalog_never_falls_back_to_global_permissions():
    install()
    token = registry.set_request_catalog({})
    try:
        assert registry.pick_model("image") == ""
        assert registry.get_model_catalog() == {}
    finally:
        registry.reset_request_catalog(token)


def test_global_install_does_not_overwrite_request_permission_context():
    token = registry.set_request_catalog({"old": {}})
    try:
        install()
        assert registry.pick_model("image") == "old"
    finally:
        registry.reset_request_catalog(token)


def test_invalid_empty_install_preserves_last_known_good():
    install()
    previous_cache = registry._registry_cache
    previous_policy = registry._policy_snapshot

    with pytest.raises(ValueError, match="must contain models"):
        registry.install_global_snapshot({"version": "catalog-3", "catalog": []})

    assert registry._registry_cache is previous_cache
    assert registry._policy_snapshot is previous_policy


def test_installed_policy_never_falls_back_to_excluded_models():
    registry.install_global_snapshot(
        {
            "version": "catalog-2",
            "catalog": [raw_model("hidden", hidden=True)],
            "review": {
                "revision": "review-2",
                "catalogRevision": "catalog-2",
                "incumbents": [],
                "recommendations": [],
            },
        }
    )

    assert registry.pick_model("image") == ""
