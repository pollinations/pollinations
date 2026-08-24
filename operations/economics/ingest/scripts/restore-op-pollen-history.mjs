import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const [
    legacyArgument,
    currentArgument,
    cutoverArgument,
    historyArgument,
    outputBaseArgument,
    evidenceUrl,
] = process.argv.slice(2);
if (
    !legacyArgument ||
    !currentArgument ||
    !cutoverArgument ||
    !historyArgument ||
    !outputBaseArgument
) {
    throw new Error(
        "Usage: node restore-op-pollen-history.mjs <legacy-op-pollen.ndjson> <current-op-pollen.json> <post-cutoff.json> <workspace-history.json> <output-base> [evidence-url]",
    );
}

const metricFields = [
    "cost_paid",
    "cost_quests",
    "price_paid",
    "price_quests",
    "requests_paid",
    "requests_quests",
    "byop_paid",
    "byop_quests",
    "model_paid",
    "model_quests",
];
const targetMonths = new Set([
    "2026-01",
    "2026-02",
    "2026-03",
    "2026-04",
    "2026-05",
    "2026-06",
    "2026-07",
]);

function readJson(pathArgument) {
    const path = resolve(pathArgument);
    const contents = readFileSync(path, "utf8");
    const payload = JSON.parse(contents);
    const rows = Array.isArray(payload) ? payload : payload.data;
    if (!Array.isArray(rows)) throw new Error(`${path} has no data array`);
    return {
        path,
        contents,
        payload,
        rows,
        sha256: createHash("sha256").update(contents).digest("hex"),
    };
}

function readNdjson(pathArgument) {
    const path = resolve(pathArgument);
    const contents = readFileSync(path, "utf8");
    return {
        path,
        contents,
        rows: contents
            .split("\n")
            .filter((line) => line.trim())
            .map((line) => JSON.parse(line)),
        sha256: createHash("sha256").update(contents).digest("hex"),
    };
}

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const registryPath = resolve(scriptDirectory, "../../provider-registry.json");
const registry = JSON.parse(readFileSync(registryPath, "utf8"));
const aliasMap = new Map();
for (const provider of registry.providers) {
    for (const value of [provider.id, ...provider.aliases]) {
        aliasMap.set(value.trim().toLowerCase(), provider.id);
    }
}

function canonicalProvider(value, month, model) {
    const normalized = String(value ?? "")
        .trim()
        .toLowerCase();
    const canonical = aliasMap.get(normalized) ?? normalized;
    if (
        month === "2026-03" &&
        canonical === "io.net" &&
        ["flux", "zimage"].includes(model)
    ) {
        return "vast.ai";
    }
    return canonical;
}

function key(row) {
    return `${row.month}|${row.vendor}|${row.model}`;
}

function rawRow(input) {
    return {
        ...input,
        vendor: String(input.vendor ?? input.provider ?? "")
            .trim()
            .toLowerCase(),
        model: String(input.model ?? "").trim(),
    };
}

function normalizedMetrics(row) {
    const metrics = Object.fromEntries(
        metricFields.map((field) => [field, Number(row[field]) || 0]),
    );
    if (row.vendor === "community") {
        metrics.cost_paid = 0;
        metrics.cost_quests = 0;
    }
    return metrics;
}

function aggregate(rows, label) {
    const output = new Map();
    for (const input of rows) {
        if (!targetMonths.has(input.month)) continue;
        const model = String(input.model ?? "").trim();
        const vendor = canonicalProvider(
            input.vendor ?? input.provider,
            input.month,
            model,
        );
        if (!vendor || !model)
            throw new Error(`${label} contains an empty key`);
        const row = { month: input.month, vendor, model };
        const rowKey = key(row);
        const existing = output.get(rowKey) ?? {
            ...row,
            ...Object.fromEntries(metricFields.map((field) => [field, 0])),
        };
        const metrics = normalizedMetrics({ ...input, vendor });
        for (const field of metricFields) existing[field] += metrics[field];
        output.set(rowKey, existing);
    }
    return output;
}

function addMaps(...maps) {
    const result = new Map();
    for (const map of maps) {
        for (const row of map.values()) {
            const rowKey = key(row);
            const existing = result.get(rowKey) ?? {
                month: row.month,
                vendor: row.vendor,
                model: row.model,
                ...Object.fromEntries(metricFields.map((field) => [field, 0])),
            };
            for (const field of metricFields) existing[field] += row[field];
            result.set(rowKey, existing);
        }
    }
    return result;
}

function sortedRows(map) {
    return [...map.values()].sort((left, right) =>
        key(left).localeCompare(key(right)),
    );
}

function totalsByMonth(rows) {
    const months = new Map();
    for (const row of rows) {
        const totals = months.get(row.month) ?? {
            month: row.month,
            rows: 0,
            ...Object.fromEntries(metricFields.map((field) => [field, 0])),
        };
        totals.rows += 1;
        for (const field of metricFields) totals[field] += row[field];
        months.set(row.month, totals);
    }
    return [...months.values()].sort((left, right) =>
        left.month.localeCompare(right.month),
    );
}

function assertFinite(rows) {
    for (const row of rows) {
        for (const field of metricFields) {
            if (!Number.isFinite(row[field]) || row[field] < 0) {
                throw new Error(`${key(row)} has invalid ${field}`);
            }
        }
        for (const field of ["requests_paid", "requests_quests"]) {
            if (!Number.isInteger(row[field])) {
                throw new Error(`${key(row)} has fractional ${field}`);
            }
        }
    }
}

function assertNoJulyRegression(currentRows, desiredRows) {
    const current = totalsByMonth(currentRows).find(
        (row) => row.month === "2026-07",
    );
    const desired = totalsByMonth(desiredRows).find(
        (row) => row.month === "2026-07",
    );
    if (!current || !desired) {
        throw new Error(
            "July continuity check requires both current and restored totals",
        );
    }

    const regressions = metricFields.filter(
        (field) => desired[field] + Number.EPSILON < current[field],
    );
    if (regressions.length > 0) {
        throw new Error(
            `July restoration would decrease existing metrics: ${regressions.join(", ")}. Rebuild the post-cutoff source before publishing.`,
        );
    }
}

const legacy = readNdjson(legacyArgument);
const current = readJson(currentArgument);
const cutover = readJson(cutoverArgument);
const history = readJson(historyArgument);
if (
    current.payload.workspace !== "pollinations_enter_staging" ||
    current.payload.source !== "op_pollen_api"
) {
    throw new Error(
        "Current endpoint source must be a staging op_pollen_api export",
    );
}
if (cutover.payload.workspace !== "pollinations_enter_staging") {
    throw new Error(
        "Post-cutoff source must come from pollinations_enter_staging",
    );
}
if (cutover.rows.some((row) => row.month !== "2026-07")) {
    throw new Error("Post-cutoff source must contain only July 2026 rows");
}
if (cutover.payload.cutoff_boundary_events !== 0) {
    throw new Error(
        "Post-cutoff source has events exactly on the backup boundary",
    );
}
if (
    history.payload.workspace !== "pollinations_enter_staging" ||
    history.payload.reason !== "workspace_snapshot"
) {
    throw new Error(
        "History source must be a staging workspace_snapshot export",
    );
}

const legacyMap = aggregate(legacy.rows, "legacy backup");
const currentMap = aggregate(current.rows, "current endpoint");
const cutoverMap = aggregate(cutover.rows, "post-cutoff source");
const currentRawRows = current.rows
    .filter((row) => targetMonths.has(row.month))
    .map(rawRow);
const existingHistoryRows = history.rows
    .filter((row) => targetMonths.has(row.month))
    .map(rawRow);
if (
    new Set(existingHistoryRows.map((row) => row.entry_id)).size !==
    existingHistoryRows.length
) {
    throw new Error("History source contains duplicate entry IDs");
}
const closedLegacyMap = new Map(
    [...legacyMap].filter(([, row]) => row.month !== "2026-07"),
);
const julyLegacyMap = new Map(
    [...legacyMap].filter(([, row]) => row.month === "2026-07"),
);
const desiredMap = addMaps(closedLegacyMap, julyLegacyMap, cutoverMap);
const desiredRows = sortedRows(desiredMap);
assertFinite(desiredRows);
assertNoJulyRegression(sortedRows(currentMap), desiredRows);

const targetKeys = new Set([...desiredMap.keys(), ...currentMap.keys()]);
const suppressedCurrentRows = [...currentMap.keys()].filter(
    (rowKey) => !desiredMap.has(rowKey),
);
const restoredMissingRows = [...desiredMap.keys()].filter(
    (rowKey) => !currentMap.has(rowKey),
);
const outputBase = resolve(outputBaseArgument);
const generatedAt = new Date().toISOString();
const evidencePacket = {
    generated_at: generatedAt,
    purpose:
        "Restore the complete January-July 2026 model-level Pollen ledger without double-counting the retained post-cutoff generation events.",
    workspace: cutover.payload.workspace,
    cutoff_exclusive_utc: cutover.payload.cutoff_exclusive_utc,
    end_exclusive_utc: cutover.payload.end_exclusive_utc,
    cutoff_boundary_events: cutover.payload.cutoff_boundary_events,
    overlap_policy: {
        january_to_june:
            "Replace the partial live endpoint with the immutable 2026-07-09 op_pollen backup.",
        july: "Use the immutable backup through its cutoff and add generation_event_v2 rows whose start_time is after the cutoff and before 2026-08-01.",
        current_only_keys:
            "Publish zero-valued workspace_snapshot rows so partial overlapping base keys do not survive.",
        community:
            "Normalize provider cost to zero; preserve price, request, BYOP, and model-reward metrics.",
    },
    provenance: {
        legacy_backup: legacy.path,
        legacy_backup_sha256: legacy.sha256,
        current_endpoint_snapshot: current.path,
        current_endpoint_snapshot_sha256: current.sha256,
        post_cutoff_snapshot: cutover.path,
        post_cutoff_snapshot_sha256: cutover.sha256,
        workspace_history_snapshot: history.path,
        workspace_history_snapshot_sha256: history.sha256,
    },
    counts: {
        legacy_raw_rows: legacy.rows.length,
        legacy_canonical_rows: legacyMap.size,
        current_target_rows: currentMap.size,
        current_raw_target_rows: currentRawRows.length,
        existing_workspace_snapshot_rows: existingHistoryRows.length,
        post_cutoff_raw_rows: cutover.rows.length,
        post_cutoff_canonical_rows: cutoverMap.size,
        desired_rows: desiredRows.length,
        target_snapshot_rows: targetKeys.size,
        restored_missing_rows: restoredMissingRows.length,
        suppressed_current_only_rows: suppressedCurrentRows.length,
    },
    legacy_totals: totalsByMonth(sortedRows(legacyMap)),
    post_cutoff_totals: totalsByMonth(sortedRows(cutoverMap)),
    desired_totals: totalsByMonth(desiredRows),
    desired_rows: desiredRows,
    suppressed_current_only_keys: suppressedCurrentRows.sort(),
};
writeFileSync(
    `${outputBase}.evidence.json`,
    `${JSON.stringify(evidencePacket, null, 2)}\n`,
);
writeFileSync(
    `${outputBase}.simulated.json`,
    `${JSON.stringify(
        {
            workspace: cutover.payload.workspace,
            source: "op_pollen_api_restoration_preview",
            generated_at: generatedAt,
            rows: desiredRows.length,
            data: desiredRows,
        },
        null,
        2,
    )}\n`,
);

if (!evidenceUrl) {
    console.log(
        JSON.stringify({
            evidence_file: `${outputBase}.evidence.json`,
            simulated_file: `${outputBase}.simulated.json`,
            desired_rows: desiredRows.length,
            snapshot_rows: targetKeys.size,
            restored_missing_rows: restoredMissingRows.length,
            suppressed_current_only_rows: suppressedCurrentRows.length,
        }),
    );
    process.exit(0);
}
if (!evidenceUrl.startsWith("https://drive.google.com/")) {
    throw new Error("Evidence URL must be an archived Google Drive URL");
}

const recordedAt = generatedAt.replace("T", " ").replace("Z", "");
const zeroMetrics = Object.fromEntries(metricFields.map((field) => [field, 0]));
const historyRowsById = new Map();
const existingByRawKey = new Map();
for (const existing of existingHistoryRows) {
    const rowKey = key(existing);
    const rows = existingByRawKey.get(rowKey) ?? [];
    rows.push(existing);
    existingByRawKey.set(rowKey, rows);
    historyRowsById.set(existing.entry_id, {
        entry_id: existing.entry_id,
        month: existing.month,
        provider: existing.vendor,
        model: existing.model,
        ...zeroMetrics,
        evidence: evidenceUrl,
        reason: "workspace_snapshot",
        recorded_at: recordedAt,
    });
}

for (const currentRow of currentRawRows) {
    const rowKey = key(currentRow);
    if (existingByRawKey.has(rowKey)) continue;
    const entryId = `history:workspace-suppress:2026:${rowKey}`;
    historyRowsById.set(entryId, {
        entry_id: entryId,
        month: currentRow.month,
        provider: currentRow.vendor,
        model: currentRow.model,
        ...zeroMetrics,
        evidence: evidenceUrl,
        reason: "workspace_snapshot",
        recorded_at: recordedAt,
    });
}

for (const desired of desiredRows) {
    const rowKey = key(desired);
    const reusable = existingByRawKey.get(rowKey)?.[0];
    const entryId =
        reusable?.entry_id ?? `history:workspace-snapshot:2026:${rowKey}`;
    historyRowsById.set(entryId, {
        entry_id: entryId,
        month: desired.month,
        provider: desired.vendor,
        model: desired.model,
        ...desired,
        evidence: evidenceUrl,
        reason: "workspace_snapshot",
        recorded_at: recordedAt,
    });
}
const historyRows = [...historyRowsById.values()].sort((left, right) =>
    left.entry_id.localeCompare(right.entry_id),
);
const simulatedEndpoint = new Map();
for (const row of historyRows) {
    const provider =
        row.month === "2026-03" &&
        row.provider === "io.net" &&
        ["flux", "zimage"].includes(row.model)
            ? "vast.ai"
            : row.provider;
    const rowKey = `${row.month}|${provider}|${row.model}`;
    const metrics = simulatedEndpoint.get(rowKey) ?? { ...zeroMetrics };
    for (const field of metricFields) metrics[field] += row[field];
    simulatedEndpoint.set(rowKey, metrics);
}
const nonzeroSimulated = new Map(
    [...simulatedEndpoint].filter(([, metrics]) =>
        metricFields.some((field) => metrics[field] !== 0),
    ),
);
if (nonzeroSimulated.size !== desiredMap.size) {
    throw new Error(
        `Simulated endpoint has ${nonzeroSimulated.size} rows; expected ${desiredMap.size}`,
    );
}
for (const [rowKey, desired] of desiredMap) {
    const simulated = nonzeroSimulated.get(rowKey);
    if (!simulated) throw new Error(`Simulated endpoint is missing ${rowKey}`);
    for (const field of metricFields) {
        if (Math.abs(simulated[field] - desired[field]) > 0.000000001) {
            throw new Error(
                `Simulated endpoint differs for ${rowKey} ${field}`,
            );
        }
    }
}
if (
    new Set(historyRows.map((row) => row.entry_id)).size !== historyRows.length
) {
    throw new Error("Generated duplicate history entry IDs");
}
writeFileSync(
    `${outputBase}.history.ndjson`,
    `${historyRows.map((row) => JSON.stringify(row)).join("\n")}\n`,
);
writeFileSync(
    `${outputBase}.report.json`,
    `${JSON.stringify(
        {
            generated_at: generatedAt,
            evidence: evidenceUrl,
            desired_rows: desiredRows.length,
            history_rows: historyRows.length,
            existing_history_rows_updated: existingHistoryRows.length,
            suppressed_current_only_rows: suppressedCurrentRows.length,
            desired_totals: evidencePacket.desired_totals,
        },
        null,
        2,
    )}\n`,
);
console.log(
    JSON.stringify({
        evidence_file: `${outputBase}.evidence.json`,
        simulated_file: `${outputBase}.simulated.json`,
        history_file: `${outputBase}.history.ndjson`,
        report_file: `${outputBase}.report.json`,
        desired_rows: desiredRows.length,
        history_rows: historyRows.length,
    }),
);
