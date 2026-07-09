#!/usr/bin/env python3
import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path


ALLOWED_TABLES = {"op_transactions", "op_cloud"}
ALLOWED_TYPES = {"billed_usage_match", "legacy_note", "source_note"}
ALLOWED_STATUSES = {"matched", "partial", "review", "unmatched", "ignored"}


def _load_json(path):
    with Path(path).open() as handle:
        return json.load(handle)


def _loads_existing_evidence(value):
    value = value or ""
    if not value.strip():
        return []
    try:
        parsed = json.loads(value)
    except json.JSONDecodeError:
        return [{"type": "legacy_note", "notes": value}]
    if isinstance(parsed, list):
        return parsed
    return [{"type": "legacy_note", "notes": json.dumps(parsed, ensure_ascii=False)}]


def _validate_entry(entry, index):
    if not isinstance(entry, dict):
        raise ValueError(f"evidence_entries[{index}] must be an object")
    entry_type = entry.get("type")
    if entry_type not in ALLOWED_TYPES:
        raise ValueError(f"evidence_entries[{index}].type is invalid: {entry_type!r}")
    if entry_type == "billed_usage_match":
        status = entry.get("status")
        if status not in ALLOWED_STATUSES:
            raise ValueError(f"evidence_entries[{index}].status is invalid: {status!r}")
        if status not in {"unmatched", "ignored"} and not entry.get("source_id"):
            raise ValueError(f"evidence_entries[{index}] missing source_id")
        confidence = entry.get("confidence")
        if not isinstance(confidence, (int, float)) or not 0 <= confidence <= 1:
            raise ValueError(f"evidence_entries[{index}].confidence must be 0..1")
    notes = entry.get("notes")
    if notes is not None and not isinstance(notes, str):
        raise ValueError(f"evidence_entries[{index}].notes must be a string")


def _validate_update(update, index):
    table = update.get("table")
    if table not in ALLOWED_TABLES:
        raise ValueError(f"proposed_updates[{index}].table is invalid: {table!r}")
    if not isinstance(update.get("row_selector"), dict) or not update["row_selector"]:
        raise ValueError(f"proposed_updates[{index}].row_selector must be a non-empty object")
    entries = update.get("evidence_entries")
    if not isinstance(entries, list) or not entries:
        raise ValueError(f"proposed_updates[{index}].evidence_entries must be a non-empty array")
    confidence = update.get("confidence")
    if not isinstance(confidence, (int, float)) or not 0 <= confidence <= 1:
        raise ValueError(f"proposed_updates[{index}].confidence must be 0..1")
    for entry_index, entry in enumerate(entries):
        _validate_entry(entry, entry_index)


def format_reconciliation(agent_output):
    updates = agent_output.get("proposed_updates")
    if not isinstance(updates, list):
        raise ValueError("agent output must include proposed_updates array")

    formatted_updates = []
    summary = {status: 0 for status in sorted(ALLOWED_STATUSES)}
    for index, update in enumerate(updates):
        _validate_update(update, index)
        previous_entries = _loads_existing_evidence(update.get("previous_evidence", ""))
        new_entries = previous_entries + update["evidence_entries"]
        evidence = json.dumps(new_entries, ensure_ascii=False, separators=(",", ":"))
        for entry in update["evidence_entries"]:
            if entry.get("type") == "billed_usage_match":
                summary[entry["status"]] += 1
        formatted_updates.append(
            {
                "table": update["table"],
                "row_selector": update["row_selector"],
                "previous_evidence": update.get("previous_evidence", ""),
                "evidence": evidence,
                "confidence": update["confidence"],
                "reason": update.get("reason", ""),
            }
        )

    return {
        "schema_version": "billed_usage_reconciliation_formatted.v1",
        "formatted_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "updates": formatted_updates,
        "summary": summary,
    }


def parse_args(argv=None):
    parser = argparse.ArgumentParser(
        description="Validate agent reconciliation output and format Tinybird evidence JSON strings."
    )
    parser.add_argument("agent_output", help="path to agent reconciliation JSON")
    parser.add_argument(
        "--output",
        help="write formatted JSON here instead of stdout",
    )
    return parser.parse_args(argv)


def main(argv=None):
    args = parse_args(argv)
    try:
        result = format_reconciliation(_load_json(args.agent_output))
    except ValueError as error:
        print(f"error: {error}", file=sys.stderr)
        return 1
    output = json.dumps(result, ensure_ascii=False, indent=2) + "\n"
    if args.output:
        Path(args.output).write_text(output)
    else:
        print(output, end="")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
