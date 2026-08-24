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
