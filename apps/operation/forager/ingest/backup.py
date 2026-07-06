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


def manual_meter_rows_lost(removed):
    lost = []
    for raw in removed:
        row = json.loads(raw)
        if "manual" in str(row.get("source", "")):
            lost.append(row)
    return lost
