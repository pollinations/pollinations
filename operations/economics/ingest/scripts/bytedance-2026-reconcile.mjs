import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const [
    cloudSnapshotArgument,
    pollenSnapshotArgument,
    configurationCsvArgument,
    outputBaseArgument,
    configurationEvidenceUrl = "",
    couponEvidenceUrl = "",
] = process.argv.slice(2);
if (
    !cloudSnapshotArgument ||
    !pollenSnapshotArgument ||
    !configurationCsvArgument ||
    !outputBaseArgument
) {
    throw new Error(
        "Usage: node bytedance-2026-reconcile.mjs <op-cloud-snapshot.json> <op-pollen-snapshot.json> <configuration-summary.csv> <output-base> [configuration-evidence-url] [coupon-evidence-url]",
    );
}

const cloudSnapshotPath = resolve(cloudSnapshotArgument);
const pollenSnapshotPath = resolve(pollenSnapshotArgument);
const configurationCsvPath = resolve(configurationCsvArgument);
const outputBase = resolve(outputBaseArgument);
const ACCOUNT_ID = "3000852661";
const ACCOUNT_NAME = "Myceli.AI OÜ";
const MONTHS = ["2026-01", "2026-02", "2026-03", "2026-04", "2026-05"];
const EXPECTED_2026_USAGE_USD = 9960.91;
const LEGACY_GRANT_ID = "manual:bytedance:inference:2026-01-01 00:00:00:deal:";
const CONFIGURATION_MODELS = new Map([
    ["Seedream 4.5", "seedream-pro"],
    ["seedream-4.0-Piece", "seedream"],
    ["Seedream 5.0-Lite", "seedream5"],
    ["Seedance-1.0-pro-fast-infer", "seedance-pro"],
    ["Bytedance-Seedance-1.0-lite-i2v-inference", "seedance"],
    ["Bytedance-Seedance-1.0-lite-t2v-inference", "seedance"],
]);

function readRows(path) {
    const payload = JSON.parse(readFileSync(path, "utf8"));
    const rows = Array.isArray(payload) ? payload : payload.data;
    if (!Array.isArray(rows)) throw new Error(`${path} has no data array`);
    return rows;
}

function parseCsvLine(line) {
    const fields = [];
    let value = "";
    let quoted = false;
    for (let index = 0; index < line.length; index += 1) {
        const character = line[index];
        if (character === '"') {
            if (quoted && line[index + 1] === '"') {
                value += '"';
                index += 1;
            } else {
                quoted = !quoted;
            }
        } else if (character === "," && !quoted) {
            fields.push(value);
            value = "";
        } else {
            value += character;
        }
    }
    if (quoted) throw new Error("Unterminated quoted CSV field");
    fields.push(value);
    return fields;
}

function parseConfigurationCsv(path) {
    const lines = readFileSync(path, "utf8")
        .replace(/^\uFEFF/u, "")
        .split(/\r?\n/u)
        .filter(Boolean);
    const header = parseCsvLine(lines.shift());
    return lines.map((line) => {
        const values = parseCsvLine(line);
        if (values.length !== header.length) {
            throw new Error(`Unexpected CSV column count for ${values[0]}`);
        }
        return Object.fromEntries(
            header.map((column, index) => [column, values[index]]),
        );
    });
}

function number(value) {
    if (value === "-" || value === "" || value == null) return 0;
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) throw new Error(`Invalid number: ${value}`);
    return parsed;
}

function closeEnough(actual, expected, label) {
    if (Math.abs(actual - expected) > 0.000001) {
        throw new Error(`${label}: expected ${expected}, got ${actual}`);
    }
}

function nextMonth(month) {
    const date = new Date(`${month}-01T00:00:00Z`);
    date.setUTCMonth(date.getUTCMonth() + 1);
    return date.toISOString().slice(0, 7);
}

function slug(value) {
    return value
        .toLowerCase()
        .replace(/[^a-z0-9]+/gu, "-")
        .replace(/^-|-$/gu, "");
}

function archivedDriveEvidence(evidence) {
    const candidates = String(evidence ?? "").match(/https:\/\/[^\s<>"']+/giu);
    return (
        candidates?.find((candidate) => {
            try {
                const url = new URL(candidate.replace(/[),.;\]}]+$/u, ""));
                return ["drive.google.com", "docs.google.com"].includes(
                    url.hostname,
                );
            } catch {
                return false;
            }
        }) ?? null
    );
}

function sameSet(left, right) {
    return (
        left.size === right.size && [...left].every((value) => right.has(value))
    );
}

const cloudRows = readRows(cloudSnapshotPath);
const pollenRows = readRows(pollenSnapshotPath);
const configurationRows = parseConfigurationCsv(configurationCsvPath);
const configurationByName = new Map(
    configurationRows
        .filter(
            (row) =>
                row["Configuration Name"] !== "Total cost" &&
                MONTHS.some((month) => number(row[month]) > 0),
        )
        .map((row) => [row["Configuration Name"], row]),
);
const unknownConfigurations = [...configurationByName.keys()].filter(
    (configuration) => !CONFIGURATION_MODELS.has(configuration),
);
if (unknownConfigurations.length > 0) {
    throw new Error(
        `Unmapped BytePlus configurations: ${unknownConfigurations.join(", ")}`,
    );
}
for (const configuration of CONFIGURATION_MODELS.keys()) {
    if (!configurationByName.has(configuration)) {
        throw new Error(`Missing BytePlus configuration: ${configuration}`);
    }
}

const totalRow = configurationRows.find(
    (row) => row["Configuration Name"] === "Total cost",
);
if (!totalRow) throw new Error("BytePlus configuration CSV has no total row");
const csv2026Total = MONTHS.reduce(
    (sum, month) => sum + number(totalRow[month]),
    0,
);
closeEnough(csv2026Total, EXPECTED_2026_USAGE_USD, "CSV 2026 total");

const existing2026 = cloudRows.filter(
    (row) =>
        row.vendor === "bytedance" && String(row.start).startsWith("2026-"),
);
const grant = existing2026.find((row) => row.entry_id === LEGACY_GRANT_ID);
if (!grant || number(grant.credit) !== 10000 || number(grant.paid) !== 0) {
    throw new Error("Missing or unexpected legacy BytePlus $10,000 grant row");
}
const aggregateRows = existing2026.filter(
    (row) =>
        MONTHS.includes(String(row.start).slice(0, 7)) &&
        row.type === "inference" &&
        number(row.credit) < 0 &&
        number(row.paid) === 0,
);
if (aggregateRows.length !== 10) {
    throw new Error(
        `Expected 10 legacy BytePlus aggregate rows, got ${aggregateRows.length}`,
    );
}
closeEnough(
    -aggregateRows.reduce((sum, row) => sum + number(row.credit), 0),
    EXPECTED_2026_USAGE_USD,
    "Legacy aggregate total",
);

const monthEvidence = new Map();
for (const month of MONTHS) {
    const evidence = aggregateRows
        .filter((row) => String(row.start).startsWith(month))
        .map((row) => archivedDriveEvidence(row.evidence))
        .find(Boolean);
    if (!evidence) throw new Error(`Missing archived evidence for ${month}`);
    monthEvidence.set(month, evidence);
}

const pollenModelsByMonth = new Map();
for (const row of pollenRows.filter((row) => row.vendor === "bytedance")) {
    const month = String(row.month).slice(0, 7);
    if (!MONTHS.includes(month)) continue;
    if (number(row.cost_paid) + number(row.cost_quests) <= 0) continue;
    const models = pollenModelsByMonth.get(month) ?? new Set();
    models.add(String(row.model));
    pollenModelsByMonth.set(month, models);
}

const recordedAt = new Date().toISOString().replace("T", " ").replace("Z", "");
const modelRows = [];
const reconciliation = [];
for (const month of MONTHS) {
    const activeConfigurations = [...CONFIGURATION_MODELS.entries()]
        .map(([configuration, model]) => ({
            configuration,
            model,
            amountUsd: number(configurationByName.get(configuration)[month]),
        }))
        .filter((row) => row.amountUsd > 0);
    const mappedModels = new Set(activeConfigurations.map((row) => row.model));
    const pollenModels = pollenModelsByMonth.get(month) ?? new Set();
    if (!sameSet(mappedModels, pollenModels)) {
        throw new Error(
            `${month} model coverage mismatch: provider=${[...mappedModels].sort().join(",")} pollen=${[...pollenModels].sort().join(",")}`,
        );
    }
    const monthTotal = activeConfigurations.reduce(
        (sum, row) => sum + row.amountUsd,
        0,
    );
    closeEnough(monthTotal, number(totalRow[month]), `${month} CSV total`);
    const legacyMonthTotal = -aggregateRows
        .filter((row) => String(row.start).startsWith(month))
        .reduce((sum, row) => sum + number(row.credit), 0);
    closeEnough(monthTotal, legacyMonthTotal, `${month} legacy total`);

    const evidence = [configurationEvidenceUrl, monthEvidence.get(month)]
        .filter(Boolean)
        .join(" · ");
    for (const row of activeConfigurations) {
        modelRows.push({
            entry_id: `dashboard:bytedance:inference:${month}-01 00:00:00:${slug(row.configuration)}:model-cost`,
            source: "dashboard",
            start: `${month}-01 00:00:00`,
            end: `${nextMonth(month)}-01 00:00:00`,
            vendor: "bytedance",
            account_id: ACCOUNT_ID,
            account_name: ACCOUNT_NAME,
            type: "inference",
            model: row.model,
            credit: 0,
            paid: -row.amountUsd,
            currency: "USD",
            evidence,
            recorded_at: recordedAt,
            resource_sku: row.configuration,
            resource_count: 1,
            resource_id: row.configuration,
            resource_name: row.configuration,
        });
    }
    reconciliation.push({
        month,
        invoice_and_configuration_total_usd: monthTotal,
        configuration_rows: activeConfigurations.length,
        canonical_models: [...mappedModels].sort(),
    });
}

const tombstones = [...aggregateRows, grant].map((row) => ({
    ...row,
    base_recorded_at: row.recorded_at,
    source: "tombstone",
    credit: 0,
    paid: 0,
    evidence: [
        configurationEvidenceUrl,
        couponEvidenceUrl,
        "superseded by exact BytePlus configuration rows and verified coupon history",
    ]
        .filter(Boolean)
        .join(" · "),
    recorded_at: recordedAt,
}));
const updates = [...tombstones, ...modelRows];
if (updates.length !== new Set(updates.map((row) => row.entry_id)).size) {
    throw new Error("Generated duplicate BytePlus entry IDs");
}
if (modelRows.length !== 28 || tombstones.length !== 11) {
    throw new Error(
        `Unexpected correction size: ${modelRows.length} model rows, ${tombstones.length} tombstones`,
    );
}

const simulatedById = new Map(cloudRows.map((row) => [row.entry_id, row]));
for (const row of updates) simulatedById.set(row.entry_id, row);
const simulated = [...simulatedById.values()].filter(
    (row) =>
        !(
            row.source === "tombstone" &&
            number(row.credit) === 0 &&
            number(row.paid) === 0
        ),
);
const activeBytePlus2026 = simulated.filter(
    (row) =>
        row.vendor === "bytedance" &&
        MONTHS.includes(String(row.start).slice(0, 7)) &&
        row.type === "inference",
);
closeEnough(
    -activeBytePlus2026.reduce((sum, row) => sum + number(row.paid), 0),
    EXPECTED_2026_USAGE_USD,
    "Simulated cash-billed usage",
);
closeEnough(
    activeBytePlus2026.reduce((sum, row) => sum + number(row.credit), 0),
    0,
    "Simulated promotional credit usage",
);

const report = {
    generated_at: recordedAt,
    provider: "bytedance",
    provider_label: "BytePlus / ByteDance",
    account_id: ACCOUNT_ID,
    source_snapshot: cloudSnapshotPath,
    pollen_snapshot: pollenSnapshotPath,
    configuration_summary: configurationCsvPath,
    evidence: {
        configuration_summary: configurationEvidenceUrl || null,
        coupon_history: couponEvidenceUrl || null,
        archived_monthly_detail: Object.fromEntries(monthEvidence),
    },
    scope: "BytePlus January-May 2026 exact configuration and canonical-model cost reconciliation",
    treatment: {
        provider_usage_usd: EXPECTED_2026_USAGE_USD,
        funding: "cash-billed/provider-payable",
        promotional_credit_usd: 0,
        bank_payment_recorded: false,
        outstanding_provider_liability_usd: EXPECTED_2026_USAGE_USD,
        legacy_10000_grant_valid: false,
        reason: "The only verified coupon was USD 5,000, Seedream-only, valid in 2025 and expired on 2025-12-31. The 2026 invoices show Coupon used USD 0 and Amount paid USD 0 because the bills remain uncleared, not because a 2026 grant funded usage.",
    },
    mapping: Object.fromEntries(CONFIGURATION_MODELS),
    reconciliation,
    proposed_updates: updates.length,
    aggregate_rows_superseded: aggregateRows.length,
    invalid_grant_rows_superseded: 1,
    configuration_rows_added: modelRows.length,
};

writeFileSync(
    `${outputBase}.ndjson`,
    `${updates.map((row) => JSON.stringify(row)).join("\n")}\n`,
);
writeFileSync(
    `${outputBase}.simulated.json`,
    `${JSON.stringify({ data: simulated })}\n`,
);
writeFileSync(
    `${outputBase}.report.json`,
    `${JSON.stringify(report, null, 2)}\n`,
);

console.log(
    JSON.stringify({
        proposed_updates: updates.length,
        configuration_rows: modelRows.length,
        tombstones: tombstones.length,
        canonical_models: [
            ...new Set(modelRows.map((row) => row.model)),
        ].sort(),
        provider_usage_usd: EXPECTED_2026_USAGE_USD,
        provider_credit_usd: 0,
    }),
);
