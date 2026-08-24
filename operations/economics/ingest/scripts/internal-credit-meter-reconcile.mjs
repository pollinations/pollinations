import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const [cloudArgument, pollenArgument, outputBaseArgument, evidenceUrl] =
    process.argv.slice(2);
if (!cloudArgument || !pollenArgument || !outputBaseArgument) {
    throw new Error(
        "Usage: node internal-credit-meter-reconcile.mjs <op-cloud-snapshot.json> <op-pollen-snapshot.json> <output-base> [evidence-url]",
    );
}

const cloudPath = resolve(cloudArgument);
const pollenPath = resolve(pollenArgument);
const outputBase = resolve(outputBaseArgument);

function readRows(path) {
    const contents = readFileSync(path, "utf8");
    const payload = JSON.parse(contents);
    const rows = Array.isArray(payload) ? payload : payload.data;
    if (!Array.isArray(rows)) throw new Error(`${path} has no data array`);
    return {
        contents,
        rows,
        sha256: createHash("sha256").update(contents).digest("hex"),
    };
}

const cloud = readRows(cloudPath);
const pollen = readRows(pollenPath);
const targets = [
    { vendor: "airforce", month: "2026-02" },
    { vendor: "airforce", month: "2026-03" },
    { vendor: "seraphyn", month: "2026-03" },
];

function nextMonth(month) {
    const date = new Date(`${month}-01T00:00:00Z`);
    date.setUTCMonth(date.getUTCMonth() + 1);
    return date.toISOString().slice(0, 10);
}

function roundCurrency(value) {
    return Math.round((value + Number.EPSILON) * 100) / 100;
}

const groups = targets.map(({ vendor, month }) => {
    const legacyEntryId = `manual:${vendor}:inference:${month}-01 00:00:00::`;
    const legacy = cloud.rows.find((row) => row.entry_id === legacyEntryId);
    if (!legacy) throw new Error(`Missing legacy row ${legacyEntryId}`);

    const models = pollen.rows
        .filter((row) => row.vendor === vendor && row.month === month)
        .map((row) => ({
            ...row,
            metered_cost: Number(row.cost_paid) + Number(row.cost_quests),
            requests: Number(row.requests_paid) + Number(row.requests_quests),
        }))
        .filter((row) => row.metered_cost > 0)
        .sort((a, b) => a.model.localeCompare(b.model));
    if (models.length === 0) {
        throw new Error(`No Pollen model rows for ${vendor} ${month}`);
    }

    const meteredTotal = models.reduce((sum, row) => sum + row.metered_cost, 0);
    const legacyTotal = -(Number(legacy.credit) + Number(legacy.paid));
    if (roundCurrency(meteredTotal) !== roundCurrency(legacyTotal)) {
        throw new Error(
            `${vendor} ${month} metered ${meteredTotal} does not reconcile to legacy ${legacyTotal}`,
        );
    }
    return {
        vendor,
        month,
        legacy,
        legacy_total_usd: legacyTotal,
        metered_total_usd: meteredTotal,
        rounded_difference_usd:
            roundCurrency(meteredTotal) - roundCurrency(legacyTotal),
        models,
    };
});

const generatedAt = new Date().toISOString();
const evidencePacket = {
    generated_at: generatedAt,
    purpose:
        "Preserve the exact internal Pollen model meter rows that reconcile legacy credit-funded provider-month totals before replacing anonymous aggregate ledger rows.",
    provenance: {
        cloud_snapshot: cloudPath,
        cloud_snapshot_sha256: cloud.sha256,
        pollen_snapshot: pollenPath,
        pollen_snapshot_sha256: pollen.sha256,
    },
    limitation:
        "This packet is an immutable internal metering export and reconciliation record, not a provider invoice or provider-dashboard export.",
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
            groups: groups.length,
            model_rows: groups.reduce(
                (sum, group) => sum + group.models.length,
                0,
            ),
        }),
    );
    process.exit(0);
}
if (!evidenceUrl.startsWith("https://drive.google.com/")) {
    throw new Error("Evidence URL must be an archived Google Drive URL");
}

const recordedAt = generatedAt.replace("T", " ").replace("Z", "");
const updates = [];
for (const group of groups) {
    updates.push({
        ...group.legacy,
        source: "tombstone",
        credit: 0,
        paid: 0,
        evidence: `${evidenceUrl} · superseded by exact internal model meter rows`,
        recorded_at: recordedAt,
    });
    for (const model of group.models) {
        updates.push({
            entry_id: `reconcile:${group.vendor}:inference:${group.month}-01 00:00:00:internal-model:${model.model}`,
            source: "reconcile",
            start: `${group.month}-01 00:00:00`,
            end: `${nextMonth(group.month)} 00:00:00`,
            vendor: group.vendor,
            account_id: "",
            account_name: "",
            type: "inference",
            model: model.model,
            credit: -model.metered_cost,
            paid: 0,
            currency: "USD",
            evidence: evidenceUrl,
            recorded_at: recordedAt,
            resource_sku: model.model,
            resource_count: model.requests,
            resource_id: `${group.vendor}:${model.model}`,
            resource_name: model.model,
        });
    }
}

const duplicates =
    updates.length - new Set(updates.map((row) => row.entry_id)).size;
if (duplicates !== 0) throw new Error(`Generated ${duplicates} duplicate IDs`);

const simulated = new Map(cloud.rows.map((row) => [row.entry_id, row]));
for (const row of updates) simulated.set(row.entry_id, row);
writeFileSync(
    `${outputBase}.ndjson`,
    `${updates.map((row) => JSON.stringify(row)).join("\n")}\n`,
);
writeFileSync(
    `${outputBase}.report.json`,
    `${JSON.stringify(
        {
            generated_at: generatedAt,
            evidence: evidenceUrl,
            proposed_updates: updates.length,
            aggregate_rows_superseded: groups.length,
            model_rows_added: updates.length - groups.length,
            groups: groups.map((group) => ({
                vendor: group.vendor,
                month: group.month,
                legacy_total_usd: group.legacy_total_usd,
                metered_total_usd: group.metered_total_usd,
                rounded_difference_usd: group.rounded_difference_usd,
                models: group.models.length,
            })),
        },
        null,
        2,
    )}\n`,
);
writeFileSync(
    `${outputBase}.simulated.json`,
    `${JSON.stringify({ data: [...simulated.values()] })}\n`,
);
console.log(
    JSON.stringify({
        proposed_updates: updates.length,
        aggregate_rows_superseded: groups.length,
        model_rows_added: updates.length - groups.length,
    }),
);
