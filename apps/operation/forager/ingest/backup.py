"""Table snapshots and row diffs — every replace is preceded by a backup.

Snapshots land in <backup_dir>/<UTC run stamp>/<datasource>.ndjson so any
table state can be restored by re-replacing with the snapshot file.
"""
import datetime
import json
import os
from pathlib import Path


def run_directory(config, now=None):
    stamp = (now or datetime.datetime.now(datetime.timezone.utc)).strftime(
        "%Y%m%dT%H%M%SZ"
    )
    directory = Path(os.path.expanduser(config["backup_dir"])) / stamp
    directory.mkdir(parents=True, exist_ok=True)
    return directory


def snapshot_table(client, datasource, directory):
    rows = client.sql(f"SELECT * FROM {datasource}")
    lines = "\n".join(json.dumps(row, sort_keys=True) for row in rows)
    (Path(directory) / f"{datasource}.ndjson").write_text(
        lines + "\n" if rows else ""
    )
    return rows


def diff_rows(old, new):
    old_set = {json.dumps(row, sort_keys=True) for row in old}
    new_set = {json.dumps(row, sort_keys=True) for row in new}
    return sorted(new_set - old_set), sorted(old_set - new_set)


def _meter_key(row):
    return (row.get("provider"), row.get("month"), row.get("currency"))


def manual_meter_rows_lost(removed, new_rows):
    """Removed manual rows with no surviving manual-sourced row for their key.

    A standalone manual row that gets consolidated into a merged ``manual,api``
    row for the same ``(provider, month, currency)`` is NOT lost — its data
    survives in the merged row. A removed manual row is truly lost only when no
    ``new_rows`` entry shares its key with ``"manual"`` in ``source``.
    """
    surviving_manual_keys = {
        _meter_key(row)
        for row in new_rows
        if "manual" in str(row.get("source", ""))
    }
    lost = []
    for raw in removed:
        row = json.loads(raw)
        if "manual" not in str(row.get("source", "")):
            continue
        if _meter_key(row) in surviving_manual_keys:
            continue
        lost.append(row)
    return lost
