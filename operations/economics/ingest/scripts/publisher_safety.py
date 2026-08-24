from datetime import datetime


def parse_recorded_at(value):
    try:
        return datetime.fromisoformat(str(value))
    except ValueError as error:
        raise RuntimeError(
            f"Invalid recorded_at {value!r}; expected an ISO date and time"
        ) from error


def validate_recorded_at(rows):
    invalid = []
    for row in rows:
        try:
            parse_recorded_at(row.get("recorded_at", ""))
        except RuntimeError:
            invalid.append(row.get("entry_id", "<missing>"))
    if invalid:
        raise RuntimeError(
            "Rows require valid recorded_at timestamps: " + ", ".join(invalid)
        )


def latest_version_query(table, entry_ids):
    if table not in {
        "op_transactions",
        "op_cloud",
        "op_forecast",
        "op_pollen_history",
    }:
        raise RuntimeError(f"Unsupported versioned datasource: {table}")
    quoted = ",".join(
        "'" + str(value).replace("'", "''") + "'" for value in entry_ids
    )
    return f"""
        SELECT
            entry_id,
            formatDateTime(max(recorded_at), '%F %T.%f') AS recorded_at
        FROM {table}
        WHERE entry_id IN ({quoted})
        GROUP BY entry_id
        FORMAT JSON
    """


def assert_newer_versions(rows, current_rows):
    current_by_id = {
        row["entry_id"]: parse_recorded_at(row["recorded_at"])
        for row in current_rows
    }
    stale = []
    for row in rows:
        current = current_by_id.get(row["entry_id"])
        if current is not None and parse_recorded_at(row["recorded_at"]) <= current:
            stale.append(row["entry_id"])
    if stale:
        raise RuntimeError(
            "Corrections require recorded_at later than the stored version: "
            + ", ".join(stale)
        )


def assert_base_versions(rows, current_rows):
    current_by_id = {row["entry_id"]: row for row in current_rows}
    missing = []
    stale = []
    for row in rows:
        current = current_by_id.get(row["entry_id"])
        if current is None:
            continue
        base_recorded_at = row.get("base_recorded_at")
        if not base_recorded_at:
            missing.append(row["entry_id"])
            continue
        if parse_recorded_at(base_recorded_at) != parse_recorded_at(
            current["recorded_at"]
        ):
            stale.append(row["entry_id"])
    if missing:
        raise RuntimeError(
            "Corrections require base_recorded_at from the source snapshot: "
            + ", ".join(missing)
        )
    if stale:
        raise RuntimeError(
            "Correction source snapshot is stale; regenerate these rows: "
            + ", ".join(stale)
        )


def assert_immutable_fields(rows, current_rows, fields):
    current_by_id = {row["entry_id"]: row for row in current_rows}
    changed = []
    for row in rows:
        current = current_by_id.get(row["entry_id"])
        if current is None:
            continue
        for field in fields:
            if row.get(field) != current.get(field):
                changed.append(f"{row['entry_id']}.{field}")
    if changed:
        raise RuntimeError(
            "Corrections cannot change immutable fields: " + ", ".join(changed)
        )


def assert_explicit_tombstones(rows, value_fields):
    invalid = []
    implicit = []
    for row in rows:
        tombstone = row.get("source") == "tombstone"
        if tombstone and any(float(row.get(field, 0)) != 0 for field in value_fields):
            invalid.append(row.get("entry_id", "<missing>"))
        if not tombstone and "superseded" in str(row.get("evidence", "")).lower():
            implicit.append(row.get("entry_id", "<missing>"))
    if invalid:
        raise RuntimeError(
            "Tombstones require zero financial values: " + ", ".join(invalid)
        )
    if implicit:
        raise RuntimeError(
            "Superseded rows require source=tombstone: " + ", ".join(implicit)
        )


def canonical_pollen_provider(month, provider, model):
    if month == "2026-03" and provider == "io.net" and model in {"flux", "zimage"}:
        return "vast.ai"
    return provider


def assert_no_new_duplicates(rows, current_rows, fields):
    current_signatures = {}
    for row in current_rows:
        signature = tuple(row.get(field) for field in fields)
        current_signatures.setdefault(signature, set()).add(row["entry_id"])

    seen = {}
    duplicates = []
    for row in rows:
        signature = tuple(row.get(field) for field in fields)
        prior_input_id = seen.get(signature)
        if prior_input_id is not None and prior_input_id != row["entry_id"]:
            duplicates.append(f"{prior_input_id}/{row['entry_id']}")
        seen[signature] = row["entry_id"]
        existing_ids = current_signatures.get(signature, set())
        if existing_ids and row["entry_id"] not in existing_ids:
            duplicates.append(f"{sorted(existing_ids)[0]}/{row['entry_id']}")

    if duplicates:
        raise RuntimeError(
            "New rows duplicate existing ledger facts: " + ", ".join(duplicates)
        )
