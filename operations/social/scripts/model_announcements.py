"""Exact official model changes from merged registry revisions."""
import json
import subprocess
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
IGNORED = {"health", "pending_change", "name", "title", "description", "publisher",
           "brand_url", "brand_icon_url", "added_date", "community", "agent", "retirement_at"}


def model_changes(before, after, pr):
    old = {m["name"]: m for m in before if not m.get("community")}
    new = {m["name"]: m for m in after if not m.get("community")}
    aliases = {alias for model in new.values() for alias in model.get("aliases", [])}
    removed = old.keys() - new.keys()
    renamed = {name: next((alias for alias in model.get("aliases", []) if alias in removed), None)
               for name, model in new.items() if name not in old}
    events = []
    for name in sorted(old.keys() | new.keys()):
        if name in removed and name in aliases:
            continue  # This ID still works through an alias; it is not retired.
        previous, current = old.get(renamed.get(name) or name), new.get(name)
        changes = {}
        for field in sorted((previous or {}).keys() | (current or {}).keys()):
            if field in IGNORED:
                continue
            a, b = (previous or {}).get(field), (current or {}).get(field)
            if field == "paid_only" and previous and current:
                a, b = bool(a), bool(b)
            if a != b:
                changes[field] = {"before": a, "after": b}
        if renamed.get(name):
            changes["model_id"] = {"before": renamed[name], "after": name}
        if previous is None or current is None:
            changes["availability"] = {"before": "Available" if previous else "Unavailable",
                                       "after": "Available" if current else "Retired"}
        if (previous or {}).get("retirement_at") and not (current or {}).get("retirement_at") and current:
            changes["retirement_at"] = {"before": previous["retirement_at"], "after": None}
        kind = "added" if previous is None else "removed" if current is None else "changed"
        if changes or previous is None or current is None:
            events.append({"id": f"pr-{pr['number']}:{name}", "model_id": name,
                           "title": (current or previous).get("title", name), "action": {"added": "NEW", "removed": "RETIRE", "changed": "UPDATE"}[kind],
                           "category": (current or previous).get("category"),
                           "pricing_units": {"before": (previous or {}).get("pricing_units"), "after": (current or {}).get("pricing_units")},
                           "changes": changes, "effective_at": None, "effective_status": "unconfirmed", "official": True})
        retirement = (current or {}).get("retirement_at")
        if retirement and retirement != (previous or {}).get("retirement_at"):
            events.append({"id": f"pr-{pr['number']}:{name}:retirement", "model_id": name,
                           "title": current.get("title", name), "action": "RETIRE",
                           "changes": {"availability": {"before": "Available", "after": "Retired"}},
                           "effective_at": retirement, "effective_status": "scheduled", "official": True})
    return events


def export_at(ref, root=ROOT):
    # Only tracked files enter the temporary checkout; local credentials are never copied.
    with tempfile.TemporaryDirectory(prefix="news-catalog-") as directory:
        target = Path(directory)
        archive = subprocess.run(["git", "archive", ref], cwd=root, check=True, capture_output=True)
        subprocess.run(["tar", "-x", "-C", directory], input=archive.stdout, check=True)
        (target / "node_modules").symlink_to(root / "node_modules", target_is_directory=True)
        result = subprocess.run(["node", "--import", "tsx", str(ROOT / "operations/social/scripts/export_model_catalog.ts"), directory],
                                cwd=root, check=True, capture_output=True, text=True)
        return json.loads(result.stdout)


def pr_comparison_refs(pr, root=ROOT):
    sha = pr["merge_commit_sha"]
    parents = subprocess.run(["git", "rev-list", "--parents", "-n", "1", sha], cwd=root,
                             check=True, capture_output=True, text=True).stdout.split()
    before = f"{sha}^1"
    # For rebases, match the complete PR commit sequence by stable patch ID.
    # Squashes and merge commits compare the actual first-parent merged trees.
    if len(parents) == 2 and pr.get("commits", 1) > 1:
        count = pr["commits"]
        originals = pr.get("_commit_shas")
        if not originals or len(originals) != count:
            raise ValueError("Multi-commit PR requires its commit list to distinguish squash from rebase")
        merged = subprocess.run(["git", "rev-list", f"--max-count={count}", sha], cwd=root, check=True, capture_output=True, text=True).stdout.splitlines()[::-1]
        def patch_id(*refs):
            command = (["git", "diff", "--no-ext-diff", *refs] if len(refs) == 2
                       else ["git", "show", "--pretty=format:", "--no-ext-diff", refs[0]])
            patch = subprocess.run(command, cwd=root, check=True, capture_output=True).stdout
            result = subprocess.run(["git", "patch-id", "--stable"], input=patch, check=True, capture_output=True).stdout.decode().split()
            return result[0] if result else None
        expected = [patch_id(commit) for commit in originals]
        if all(expected) and expected == [patch_id(commit) for commit in merged]:
            before = f"{sha}~{count}"
        else:
            source_base = subprocess.run(["git", "merge-base", before, originals[-1]], cwd=root,
                                         check=True, capture_output=True, text=True).stdout.strip()
            combined = patch_id(source_base, originals[-1])
            if not combined or combined != patch_id(before, sha):
                raise ValueError("Cannot verify the full PR range as a rebase or squash")
    return before, sha


def announcements_for_pr(pr, files, root=ROOT, refs=None):
    if not any(path.startswith("shared/") for path in files):
        return []
    before, after = refs or pr_comparison_refs(pr, root)
    return model_changes(export_at(before, root), export_at(after, root), pr)

