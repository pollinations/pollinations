"""Table snapshots and guarded Tinybird writes.

Snapshots land in <backup_dir>/<UTC run stamp>/<datasource>.ndjson so any
table state can be restored by re-replacing with the snapshot file.
"""
import datetime
import json
import os
from pathlib import Path

DEFAULT_RETENTION = 20


def backup_root(config):
    raw = Path(os.path.expanduser(config["backup_dir"]))
    if raw.is_absolute():
        return raw
    return Path(__file__).resolve().parents[1] / raw


def run_directory(config, now=None):
    stamp = (now or datetime.datetime.now(datetime.timezone.utc)).strftime(
        "%Y%m%dT%H%M%SZ"
    )
    directory = backup_root(config) / stamp
    directory.mkdir(parents=True, exist_ok=True)
    return directory


def prune_backup_runs(config):
    keep = int(config.get("backup_retention", DEFAULT_RETENTION))
    if keep <= 0:
        return []
    root = backup_root(config)
    if not root.exists():
        return []
    runs = sorted(
        [
            path
            for path in root.iterdir()
            if path.is_dir() and _is_run_directory(path.name)
        ],
        key=lambda path: path.name,
        reverse=True,
    )
    removed = []
    for path in runs[keep:]:
        _remove_tree(path)
        removed.append(path)
    return removed


def _is_run_directory(name):
    try:
        datetime.datetime.strptime(name, "%Y%m%dT%H%M%SZ")
    except ValueError:
        return False
    return True


def _remove_tree(path):
    for child in path.iterdir():
        if child.is_dir():
            _remove_tree(child)
        else:
            child.unlink()
    path.rmdir()


def snapshot_table(client, datasource, directory):
    rows = client.sql(f"SELECT * FROM {datasource}")
    lines = "\n".join(json.dumps(row, sort_keys=True) for row in rows)
    (Path(directory) / f"{datasource}.ndjson").write_text(
        lines + "\n" if rows else ""
    )
    return rows


def backup_before_write(read_client, datasource, config, backup_dir=None):
    directory = backup_dir or run_directory(config)
    snapshot_table(read_client, datasource, directory)
    prune_backup_runs(config)
    return directory


def append_with_backup(client, datasource, rows, config, backup_dir=None):
    backup_dir = backup_before_write(client, datasource, config, backup_dir)
    return backup_dir, client.append(datasource, rows)


def replace_with_backup(
    read_client,
    write_client,
    datasource,
    rows,
    config,
    *,
    condition=None,
    backup_dir=None,
):
    directory = backup_before_write(read_client, datasource, config, backup_dir)
    if condition is None:
        return directory, write_client.replace(datasource, rows)
    return directory, write_client.replace(datasource, rows, condition=condition)


def _canonical(row):
    out = {}
    for key, value in row.items():
        if isinstance(value, float) and value.is_integer():
            value = int(value)
        out[key] = value
    return json.dumps(out, sort_keys=True)


def diff_rows(old, new):
    old_set = {_canonical(row) for row in old}
    new_set = {_canonical(row) for row in new}
    return sorted(new_set - old_set), sorted(old_set - new_set)


def _meter_key(row):
    return (row.get("vendor"), row.get("month"), row.get("currency"))


def manual_meter_rows_lost(removed, new_rows):
    """Removed manual rows with no surviving manual-sourced row for their key.

    A standalone manual row that gets consolidated into a merged ``manual,api``
    row for the same ``(vendor, month, currency)`` is NOT lost — its data
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
