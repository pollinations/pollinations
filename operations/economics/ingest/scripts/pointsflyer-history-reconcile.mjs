import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const [
    cloudArgument,
    currentPollenArgument,
    legacyPollenArgument,
    grantsArgument,
    outputBaseArgument,
    evidenceUrl,
] = process.argv.slice(2);
if (
    !cloudArgument ||
    !currentPollenArgument ||
    !legacyPollenArgument ||
    !grantsArgument ||
    !outputBaseArgument
) {
    throw new Error(
        "Usage: node pointsflyer-history-reconcile.mjs <op-cloud.json> <current-op-pollen.json> <legacy-op-pollen.ndjson> <grants.ndjson> <output-base> [evidence-url]",
    );
}

function readJsonRows(pathArgument) {
    const path = resolve(pathArgument);
    const contents = readFileSync(path, "utf8");
    const payload = JSON.parse(contents);
    const rows = Array.isArray(payload) ? payload : payload.data;
    if (!Array.isArray(rows)) throw new Error(`${path} has no data array`);
    return {
        path,
        contents,
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

function roundCurrency(value) {
    return Math.round((value + Number.EPSILON) * 100) / 100;
}

function nextMonth(month) {
    const date = new Date(`${month}-01T00:00:00Z`);
    date.setUTCMonth(date.getUTCMonth() + 1);
    return date.toISOString().slice(0, 10);
}

const cloud = readJsonRows(cloudArgument);
const currentPollen = readJsonRows(currentPollenArgument);
const legacyPollen = readNdjson(legacyPollenArgument);
const grants = readNdjson(grantsArgument);
const outputBase = resolve(outputBaseArgument);
const months = ["2026-01", "2026-02", "2026-03", "2026-04"];
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

const livePointsflyer = currentPollen.rows.filter(
    (row) => row.vendor === "pointsflyer" && months.includes(row.month),
);
if (livePointsflyer.length !== 0) {
    throw new Error(
        `Current op_pollen already contains ${livePointsflyer.length} Pointsflyer rows; refusing a duplicate historical restoration`,
    );
}

const grant = grants.rows.find(
    (row) => row.vendor === "pointsflyer" && row.label === "gifted compute",
);
if (!grant) throw new Error("Missing Pointsflyer gifted-compute grant");

const groups = months.map((month) => {
    const legacyCloudId = `manual:pointsflyer:inference:${month}-01 00:00:00::`;
    const legacyCloud = cloud.rows.find(
        (row) => row.entry_id === legacyCloudId,
    );
    if (!legacyCloud) throw new Error(`Missing cloud row ${legacyCloudId}`);
    const models = legacyPollen.rows
        .filter((row) => row.vendor === "pointsflyer" && row.month === month)
        .sort((a, b) => a.model.localeCompare(b.model));
    if (models.length === 0) {
        throw new Error(`Missing legacy Pointsflyer meter rows for ${month}`);
    }
    const meteredTotal = models.reduce(
        (sum, row) => sum + Number(row.cost_paid) + Number(row.cost_quests),
        0,
    );
    const legacyTotal = -(
        Number(legacyCloud.credit) + Number(legacyCloud.paid)
    );
    if (roundCurrency(meteredTotal) !== roundCurrency(legacyTotal)) {
        throw new Error(
            `${month} metered ${meteredTotal} does not reconcile to cloud ${legacyTotal}`,
        );
    }
    return {
        month,
        legacy_cloud: legacyCloud,
        legacy_total_usd: legacyTotal,
        metered_total_usd: meteredTotal,
        rounded_difference_usd:
            roundCurrency(meteredTotal) - roundCurrency(legacyTotal),
        models,
    };
});

const pre2026Burn = 290.07;
const metered2026 = groups.reduce(
    (sum, group) => sum + group.metered_total_usd,
    0,
);
const roundedMonthly2026 = groups.reduce(
    (sum, group) => sum + group.legacy_total_usd,
    0,
);
const generatedAt = new Date().toISOString();
const evidencePacket = {
    generated_at: generatedAt,
    purpose:
        "Restore Pointsflyer January-April 2026 model-level Pollen history lost from the live post-cutover aggregate while preserving paid/Quest splits and reconciling the gifted-compute grant.",
    provenance: {
        cloud_snapshot: cloud.path,
        cloud_snapshot_sha256: cloud.sha256,
        current_pollen_snapshot: currentPollen.path,
        current_pollen_snapshot_sha256: currentPollen.sha256,
        legacy_pollen_backup: legacyPollen.path,
        legacy_pollen_backup_sha256: legacyPollen.sha256,
        legacy_grants_backup: grants.path,
        legacy_grants_backup_sha256: grants.sha256,
    },
    source_findings: {
        current_op_pollen_rows_for_target_period: livePointsflyer.length,
        current_generation_event_v2_rows_for_target_period: 0,
        current_generation_event_rows_for_target_period: 0,
        preserved_backup_is_only_remaining_detailed_source: true,
    },
    limitation:
        "This is a preserved internal Tinybird meter backup and grant reconciliation, not a provider invoice or current provider-dashboard export.",
    grant,
    grant_reconciliation: {
        pre_2026_burn_usd: pre2026Burn,
        exact_2026_metered_usd: metered2026,
        exact_total_usd: pre2026Burn + metered2026,
        monthly_rounded_2026_usd: roundedMonthly2026,
        monthly_rounded_total_usd: pre2026Burn + roundedMonthly2026,
        granted_usd: Number(grant.granted),
        exact_rounding_residual_usd:
            Number(grant.granted) - pre2026Burn - metered2026,
    },
    groups,
};
writeFileSync(
    `${outputBase}.evidence.json`,
    `${JSON.stringify(evidencePacket, null, 2)}\n`,
);

if (!evidenceUrl) {
    console.log(
        JSON.stringify({
            evidence_file: `${outputBase}.evidence.json`,
            months: groups.length,
            model_rows: groups.reduce(
                (sum, group) => sum + group.models.length,
                0,
            ),
            exact_2026_metered_usd: metered2026,
            monthly_rounded_2026_usd: roundedMonthly2026,
        }),
    );
    process.exit(0);
}
if (!evidenceUrl.startsWith("https://drive.google.com/")) {
    throw new Error("Evidence URL must be an archived Google Drive URL");
}

const recordedAt = generatedAt.replace("T", " ").replace("Z", "");
const historyRows = [];
const cloudUpdates = [];
for (const group of groups) {
    cloudUpdates.push({
        ...group.legacy_cloud,
        source: "tombstone",
        credit: 0,
        paid: 0,
        evidence: `${evidenceUrl} · superseded by exact preserved model meter rows`,
        recorded_at: recordedAt,
    });
    for (const model of group.models) {
        const metrics = Object.fromEntries(
            metricFields.map((field) => [field, Number(model[field]) || 0]),
        );
        const meteredCost = metrics.cost_paid + metrics.cost_quests;
        const requests = metrics.requests_paid + metrics.requests_quests;
        historyRows.push({
            entry_id: `history:pointsflyer:${group.month}:${model.model}`,
            month: group.month,
            provider: "pointsflyer",
            model: model.model,
            ...metrics,
            evidence: evidenceUrl,
            reason: "Restored from immutable 2026-07-09 pre-cutover Tinybird op_pollen backup; live raw-event tables and live aggregate no longer retain these rows.",
            recorded_at: recordedAt,
        });
        cloudUpdates.push({
            entry_id: `reconcile:pointsflyer:inference:${group.month}-01 00:00:00:legacy-model:${model.model}`,
            source: "reconcile",
            start: `${group.month}-01 00:00:00`,
            end: `${nextMonth(group.month)} 00:00:00`,
            vendor: "pointsflyer",
            account_id: "",
            account_name: "",
            type: "inference",
            model: model.model,
            credit: -meteredCost,
            paid: 0,
            currency: "USD",
            evidence: evidenceUrl,
            recorded_at: recordedAt,
            resource_sku: model.model,
            resource_count: requests,
            resource_id: `pointsflyer:${model.model}`,
            resource_name: model.model,
        });
    }
}

for (const rows of [historyRows, cloudUpdates]) {
    const duplicates =
        rows.length - new Set(rows.map((row) => row.entry_id)).size;
    if (duplicates !== 0)
        throw new Error(`Generated ${duplicates} duplicate IDs`);
}
const simulated = new Map(cloud.rows.map((row) => [row.entry_id, row]));
for (const row of cloudUpdates) simulated.set(row.entry_id, row);

writeFileSync(
    `${outputBase}.history.ndjson`,
    `${historyRows.map((row) => JSON.stringify(row)).join("\n")}\n`,
);
writeFileSync(
    `${outputBase}.cloud.ndjson`,
    `${cloudUpdates.map((row) => JSON.stringify(row)).join("\n")}\n`,
);
writeFileSync(
    `${outputBase}.cloud.simulated.json`,
    `${JSON.stringify({ data: [...simulated.values()] })}\n`,
);
writeFileSync(
    `${outputBase}.report.json`,
    `${JSON.stringify(
        {
            generated_at: generatedAt,
            evidence: evidenceUrl,
            history_rows: historyRows.length,
            cloud_updates: cloudUpdates.length,
            aggregate_cloud_rows_superseded: groups.length,
            model_cloud_rows_added: cloudUpdates.length - groups.length,
            exact_2026_metered_usd: metered2026,
            monthly_rounded_2026_usd: roundedMonthly2026,
            groups: groups.map((group) => ({
                month: group.month,
                legacy_total_usd: group.legacy_total_usd,
                metered_total_usd: group.metered_total_usd,
                models: group.models.length,
            })),
        },
        null,
        2,
    )}\n`,
);
console.log(
    JSON.stringify({
        history_rows: historyRows.length,
        cloud_updates: cloudUpdates.length,
        exact_2026_metered_usd: metered2026,
        monthly_rounded_2026_usd: roundedMonthly2026,
    }),
);
