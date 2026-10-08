"""API changes between two APIDOCS.surface.json files (written by gen's docs generator).

The docs PR is regenerated after each production deploy, so its changes are already live.
"""
import json
import subprocess
from typing import Dict, List, Optional

API_SURFACE = "APIDOCS.surface.json"


def _types(field: Optional[Dict]) -> set:
    return set(field["type"].split("|")) if field else set()


def _field_change(name: str, before: Optional[Dict], after: Optional[Dict]) -> Optional[Dict]:
    """One parameter or body field; None when nothing a client relies on changed."""
    # "any" means the docs lost the schema: the change is unknown, not a change.
    if before == after or "any" in _types(before) | _types(after):
        return None
    breaking = (
        (before is not None and after is None)  # removed
        or (after is not None and after["required"] and not (before or {}).get("required"))  # newly required
        or (before is not None and after is not None and not _types(before) <= _types(after))  # narrowed
    )
    return {"field": name, "before": before, "after": after, "breaking": breaking}


def api_changes(before: Dict, after: Dict, pr: Dict) -> List[Dict]:
    """ADD / REMOVE / DEPRECATE / CHANGE per endpoint (`METHOD /path`), with breaking flags."""
    events = []
    for endpoint in sorted(before.keys() | after.keys()):
        old, new = before.get(endpoint), after.get(endpoint)
        changes = []
        if old is None:
            action = "ADD"
        elif new is None:
            action = "REMOVE"
        else:
            for kind in ("parameters", "body"):
                # A body documented on one side only is a documentation gap, not an API change.
                if kind == "body" and (not old[kind] or not new[kind]):
                    continue
                for name in sorted(old[kind].keys() | new[kind].keys()):
                    change = _field_change(f"{kind}:{name}", old[kind].get(name), new[kind].get(name))
                    if change:
                        changes.append(change)
            deprecated = new.get("deprecated") and not old.get("deprecated")
            if not changes and not deprecated:
                continue
            action = "DEPRECATE" if deprecated else "CHANGE"
        events.append({
            "id": f"pr-{pr['number']}:{endpoint}",
            "endpoint": endpoint,
            "action": action,
            "breaking": action == "REMOVE" or any(change["breaking"] for change in changes),
            "changes": changes,
            "effective_status": "live",
        })
    return events


def api_changes_for_pr(pr: Dict, root) -> List[Dict]:
    """API changes of a merged PR that updates the surface (the post-deploy docs PR)."""
    from model_announcements import pr_comparison_refs

    def surface(ref):
        shown = subprocess.run(["git", "show", f"{ref}:{API_SURFACE}"], cwd=root, capture_output=True, text=True)
        return json.loads(shown.stdout) if shown.returncode == 0 else None

    before, after = (surface(ref) for ref in pr_comparison_refs(pr, root))
    # Without an earlier surface there is no baseline: nothing is reported as new.
    return api_changes(before, after, pr) if before and after else []
