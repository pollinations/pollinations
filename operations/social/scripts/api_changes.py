"""API changes of the post-deploy docs PR, read from the APIDOCS.md it regenerates.

APIDOCS.md lists every endpoint with its parameter and request-body tables, so the
docs PR diff is the live API change.
"""
import re
import subprocess
from typing import Dict, List, Optional

API_DOCS = "APIDOCS.md"
HEADING = re.compile(r"^#### `(\w+)` `([^`]+)`(?: — (.*))?")
NAME = re.compile(r"^`([^`]+)`( \*)?$")


def api_surface(markdown: str) -> Dict:
    """Each endpoint's summary, parameters and top-level body fields: {"POST /x": {"summary", "parameters", "body"}}."""
    surface, endpoint, section = {}, None, None
    for line in markdown.splitlines():
        if heading := HEADING.match(line):
            endpoint, section = f"{heading[1].upper()} {heading[2]}", None
            surface[endpoint] = {"summary": heading[3] or "", "parameters": {}, "body": {}}
        elif line.startswith(("## ", "### ")):
            endpoint = section = None
        elif endpoint and "**Parameters**" in line:
            section = "parameters"
        elif endpoint and "**Request body**" in line:
            section = "body"
        elif endpoint and line.startswith(("📤", "💻", "🔎")):
            section = None
        elif endpoint and section and line.startswith("| `"):
            cells = [cell.strip() for cell in re.split(r"(?<!\\)\|", line)[1:-1]]
            name = NAME.match(cells[0])
            if not name or (section == "body" and "." in name[1]):
                continue  # nested body fields follow their parent
            key = f"{cells[1].strip('`')}:{name[1]}" if section == "parameters" else name[1]
            type_ = cells[2] if section == "parameters" else cells[1]
            type_ = re.sub(r"enum \(\d+\) — .*", "enum", type_.replace("\\|", "|").replace("`", ""))
            surface[endpoint][section][key] = {"type": "|".join(t.strip() for t in type_.split("|")),
                                               "required": bool(name[2])}
    return surface


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
    """ADD / REMOVE / CHANGE per endpoint (`METHOD /path`), with breaking flags."""
    events = []
    for endpoint in sorted(before.keys() | after.keys()):
        old, new = before.get(endpoint), after.get(endpoint)
        changes = []
        if old and new:
            for kind in ("parameters", "body"):
                # A body documented on one side only is a documentation gap, not an API change.
                if kind == "body" and (not old[kind] or not new[kind]):
                    continue
                for name in sorted(old[kind].keys() | new[kind].keys()):
                    if change := _field_change(f"{kind}:{name}", old[kind].get(name), new[kind].get(name)):
                        changes.append(change)
            if not changes:
                continue
        action = "ADD" if not old else "REMOVE" if not new else "CHANGE"
        events.append({
            "id": f"pr-{pr['number']}:{endpoint}",
            "endpoint": endpoint,
            "summary": (new or old).get("summary", ""),
            "action": action,
            "breaking": action == "REMOVE" or any(change["breaking"] for change in changes),
            "changes": changes,
        })
    return events


def api_changes_for_pr(pr: Dict, root) -> List[Dict]:
    """API changes of a merged PR that regenerates APIDOCS.md (the post-deploy docs PR)."""
    from model_announcements import pr_comparison_refs

    def surface(ref):
        return api_surface(subprocess.run(["git", "show", f"{ref}:{API_DOCS}"], cwd=root,
                                          capture_output=True, text=True, check=True).stdout)

    return api_changes(*(surface(ref) for ref in pr_comparison_refs(pr, root)), pr)
