#!/usr/bin/env python3

import argparse
import json
from pathlib import Path

from publisher_safety import parse_recorded_at


def arguments():
    parser = argparse.ArgumentParser(
        description="Prepare explicit tombstones from a raw op_cloud export."
    )
    parser.add_argument("input", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--recorded-at", required=True)
    return parser.parse_args()


def read_rows(path):
    return [json.loads(line) for line in path.read_text().splitlines() if line.strip()]


def latest_rows(rows):
    latest = {}
    for row in rows:
        entry_id = str(row.get("entry_id", "")).strip()
        if not entry_id:
            raise RuntimeError("Raw op_cloud rows require entry_id")
        recorded_at = parse_recorded_at(row.get("recorded_at", ""))
        current = latest.get(entry_id)
        if current is None:
            latest[entry_id] = row
            continue
        current_time = parse_recorded_at(current["recorded_at"])
        if recorded_at == current_time and row != current:
            raise RuntimeError(f"Conflicting latest rows for {entry_id}")
        if recorded_at > current_time:
            latest[entry_id] = row
    return list(latest.values())


def legacy_tombstones(rows, recorded_at):
    correction_time = parse_recorded_at(recorded_at)
    corrections = []
    for row in latest_rows(rows):
        implicit = (
            row.get("source") != "tombstone"
            and float(row.get("credit", 0)) == 0
            and float(row.get("paid", 0)) == 0
            and "superseded" in str(row.get("evidence", "")).lower()
        )
        if not implicit:
            continue
        source_time = parse_recorded_at(row["recorded_at"])
        if correction_time <= source_time:
            raise RuntimeError(
                f"recorded_at must be later than {row['entry_id']} source version"
            )
        corrections.append(
            {
                **row,
                "base_recorded_at": row["recorded_at"],
                "source": "tombstone",
                "recorded_at": recorded_at,
            }
        )
    return sorted(corrections, key=lambda row: row["entry_id"])


def main():
    args = arguments()
    corrections = legacy_tombstones(read_rows(args.input.resolve()), args.recorded_at)
    if not corrections:
        raise RuntimeError("No implicit op_cloud tombstones found")
    args.output.resolve().write_text(
        "".join(json.dumps(row) + "\n" for row in corrections)
    )
    print(json.dumps({"rows": len(corrections), "output": str(args.output.resolve())}))


if __name__ == "__main__":
    main()
