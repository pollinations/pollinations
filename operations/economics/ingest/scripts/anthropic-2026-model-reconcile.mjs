import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const [snapshotArgument, costReportArgument, outputBaseArgument] =
    process.argv.slice(2);
if (!snapshotArgument || !costReportArgument || !outputBaseArgument) {
    throw new Error(
        "Usage: node anthropic-2026-model-reconcile.mjs <op-cloud-snapshot.json> <cost-report.json> <output-base>",
    );
}

const snapshotPath = resolve(snapshotArgument);
const costReportPath = resolve(costReportArgument);
const outputBase = resolve(outputBaseArgument);
const snapshotPayload = JSON.parse(readFileSync(snapshotPath, "utf8"));
const snapshotRows = Array.isArray(snapshotPayload)
    ? snapshotPayload
    : snapshotPayload.data;
if (!Array.isArray(snapshotRows)) throw new Error("Snapshot has no data array");

const costReport = JSON.parse(readFileSync(costReportPath, "utf8"));
if (!Array.isArray(costReport.windows)) {
    throw new Error("Cost report has no windows array");
}
if (costReport.windows.some((window) => window.response?.has_more)) {
    throw new Error("Cost report contains an uncollected next page");
}

const EVIDENCE =
    "https://drive.google.com/file/d/1_R3b-QUW9SjCzOtVnaznjlkWKnFWSAmF/view?usp=drivesdk";
const LEGACY_IDS = new Map([
    ["2026-01", "api:anthropic:inference:2026-01-01 00:00:00::"],
    ["2026-02", "api:anthropic:inference:2026-02-01 00:00:00::"],
    ["2026-03", "api:anthropic:inference:2026-03-01 00:00:00::"],
    ["2026-04", "api:anthropic:inference:2026-04-01 00:00:00::"],
]);
const GRANT_ID = "manual:anthropic:inference:2026-02-01 00:00:00::";
const GRANT_USD = 5000;
const rowById = new Map(snapshotRows.map((row) => [row.entry_id, row]));
const roundCents = (value) => Math.round((value + Number.EPSILON) * 100) / 100;

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

const rawResults = costReport.windows.flatMap((window) =>
    (window.response?.data ?? []).flatMap((bucket) =>
        (bucket.results ?? []).map((result) => ({
            month: String(bucket.starting_at).slice(0, 7),
            model: String(result.model ?? ""),
            description: String(result.description ?? ""),
            amount_usd: Number(result.amount) / 100,
        })),
    ),
);
if (rawResults.some((row) => !Number.isFinite(row.amount_usd))) {
    throw new Error("Cost report contains a non-numeric amount");
}

const monthlyApiTotals = new Map();
for (const row of rawResults) {
    monthlyApiTotals.set(
        row.month,
        (monthlyApiTotals.get(row.month) ?? 0) + row.amount_usd,
    );
}

const legacy = new Map();
for (const [month, entryId] of LEGACY_IDS) {
    const row = rowById.get(entryId);
    if (!row) throw new Error(`Missing legacy Anthropic row ${entryId}`);
    const apiTotal = monthlyApiTotals.get(month) ?? 0;
    const legacyTotal = -Number(row.paid) - Number(row.credit);
    if (roundCents(apiTotal) !== roundCents(legacyTotal)) {
        throw new Error(`${month} API total does not match the legacy row`);
    }
    legacy.set(month, row);
}

const grant = rowById.get(GRANT_ID);
if (!grant || Number(grant.credit) !== GRANT_USD || Number(grant.paid) !== 0) {
    throw new Error("Missing or unexpected Anthropic USD 5,000 grant row");
}

const creditByMonth = new Map([
    ["2026-01", 0],
    ["2026-02", monthlyApiTotals.get("2026-02") ?? 0],
    ["2026-03", monthlyApiTotals.get("2026-03") ?? 0],
]);
creditByMonth.set(
    "2026-04",
    GRANT_USD - creditByMonth.get("2026-02") - creditByMonth.get("2026-03"),
);

for (const month of LEGACY_IDS.keys()) {
    const apiTotal = monthlyApiTotals.get(month) ?? 0;
    const credit = creditByMonth.get(month) ?? 0;
    const paid = apiTotal - credit;
    const row = legacy.get(month);
    if (
        roundCents(credit) !== roundCents(-Number(row.credit)) ||
        roundCents(paid) !== roundCents(-Number(row.paid))
    ) {
        throw new Error(
            `${month} exact funding waterfall does not match legacy`,
        );
    }
}

const modelGroups = new Map();
for (const row of rawResults) {
    if (!LEGACY_IDS.has(row.month) || !row.model || row.amount_usd === 0) {
        continue;
    }
    const key = `${row.month}|${row.model}`;
    const group = modelGroups.get(key) ?? {
        month: row.month,
        model: row.model,
        amount_usd: 0,
        source_lines: 0,
    };
    group.amount_usd += row.amount_usd;
    group.source_lines += 1;
    modelGroups.set(key, group);
}

const recordedAt = new Date().toISOString().replace("T", " ").replace("Z", "");
const modelRows = [];
const monthlyModels = new Map();
for (const group of modelGroups.values()) {
    const models = monthlyModels.get(group.month) ?? [];
    models.push(group);
    monthlyModels.set(group.month, models);
}

for (const month of LEGACY_IDS.keys()) {
    const models = (monthlyModels.get(month) ?? []).sort((a, b) =>
        a.model.localeCompare(b.model),
    );
    const total = monthlyApiTotals.get(month) ?? 0;
    const creditTotal = creditByMonth.get(month) ?? 0;
    let allocatedCredit = 0;
    for (const [index, item] of models.entries()) {
        const credit =
            Math.abs(creditTotal - total) < 1e-9
                ? item.amount_usd
                : index === models.length - 1
                  ? creditTotal - allocatedCredit
                  : total === 0
                    ? 0
                    : item.amount_usd * (creditTotal / total);
        allocatedCredit += credit;
        const paidValue = item.amount_usd - credit;
        const paid = Math.abs(paidValue) < 1e-9 ? 0 : paidValue;
        const start = `${month}-01 00:00:00`;
        modelRows.push({
            entry_id: `api:anthropic:inference:${start}:${slug(item.model)}:model-cost`,
            source: "api",
            start,
            end: `${nextMonth(month)}-01 00:00:00`,
            vendor: "anthropic",
            account_id: "",
            account_name: "",
            type: "inference",
            model: item.model,
            credit: -credit,
            paid: -paid,
            currency: "USD",
            evidence: EVIDENCE,
            recorded_at: recordedAt,
            resource_sku: "description-grouped model cost",
            resource_count: item.source_lines,
            resource_id: item.model,
            resource_name: item.model,
        });
    }
}

const zeroRows = ["2026-05", "2026-06", "2026-07"].map((month) => {
    if (Math.abs(monthlyApiTotals.get(month) ?? 0) > 1e-12) {
        throw new Error(`${month} is not a verified Anthropic zero month`);
    }
    const start = `${month}-01 00:00:00`;
    return {
        entry_id: `api:anthropic:inference:${start}:verified-zero:`,
        source: "api",
        start,
        end: `${nextMonth(month)}-01 00:00:00`,
        vendor: "anthropic",
        account_id: "",
        account_name: "",
        type: "inference",
        model: "",
        credit: 0,
        paid: 0,
        currency: "USD",
        evidence: EVIDENCE,
        recorded_at: recordedAt,
        resource_sku: "account total",
        resource_count: 0,
        resource_id: "verified-zero",
        resource_name: "Anthropic verified zero usage",
    };
});

const tombstones = [...LEGACY_IDS.values()].map((entryId) => ({
    ...rowById.get(entryId),
    base_recorded_at: rowById.get(entryId).recorded_at,
    source: "tombstone",
    credit: 0,
    paid: 0,
    evidence: `${EVIDENCE} · superseded by exact description-grouped Anthropic Cost API model rows`,
    recorded_at: recordedAt,
}));
const grantUpdate = {
    ...grant,
    base_recorded_at: grant.recorded_at,
    resource_id: "startup-grant-2026-02",
    resource_name: "Anthropic startup grant",
    resource_sku: "promotional credit",
    resource_count: GRANT_USD,
    evidence: `legacy USD 5,000 grant award remains without a direct provider grant statement; ${EVIDENCE} proves the exact API burn and April exhaustion`,
    recorded_at: recordedAt,
};
const updates = [...tombstones, grantUpdate, ...modelRows, ...zeroRows];
if (updates.length !== new Set(updates.map((row) => row.entry_id)).size) {
    throw new Error("Generated duplicate Anthropic entry IDs");
}

const simulatedById = new Map(snapshotRows.map((row) => [row.entry_id, row]));
for (const row of updates) simulatedById.set(row.entry_id, row);
const simulated = [...simulatedById.values()].filter(
    (row) =>
        !(
            Number(row.credit) === 0 &&
            Number(row.paid) === 0 &&
            row.source === "tombstone"
        ),
);

const reconciliation = [...LEGACY_IDS.keys()].map((month) => {
    const rows = modelRows.filter((row) => row.start.startsWith(month));
    return {
        month,
        api_cost_usd: monthlyApiTotals.get(month),
        model_rows: rows.length,
        provider_credit_usd: -rows.reduce(
            (sum, row) => sum + Number(row.credit),
            0,
        ),
        provider_paid_usd: -rows.reduce(
            (sum, row) => sum + Number(row.paid),
            0,
        ),
    };
});
for (const row of reconciliation) {
    if (
        Math.abs(
            row.api_cost_usd - row.provider_credit_usd - row.provider_paid_usd,
        ) > 1e-8
    ) {
        throw new Error(`${row.month} model rows do not reconcile`);
    }
}

const report = {
    generated_at: recordedAt,
    source_snapshot: snapshotPath,
    source_cost_report: costReportPath,
    evidence: EVIDENCE,
    scope: "Anthropic 2026 exact monthly provider-model cost and funding reconciliation",
    allocation_method:
        "The provider Cost API supplies exact description-grouped model cost. The USD 5,000 legacy grant is exhausted by exact February-March cost and the April remainder; April's account-level credit/cash split is allocated pro rata across provider models.",
    grant: {
        amount_usd: GRANT_USD,
        direct_award_evidence_available: false,
        exact_burn_evidence_available: true,
    },
    reconciliation,
    verified_zero_months: zeroRows.map((row) => row.start.slice(0, 7)),
    proposed_updates: updates.length,
    aggregate_rows_superseded: tombstones.length,
    model_rows_added: modelRows.length,
    zero_rows_added: zeroRows.length,
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
writeFileSync(
    `${outputBase}.report.md`,
    `# Anthropic 2026 provider reconciliation\n\n` +
        `- Source: provider Cost API, grouped by description; parsed model identifiers are provider-native.\n` +
        `- Exact API cost: ${reconciliation.map((row) => `${row.month} USD ${row.api_cost_usd.toFixed(6)}`).join("; ")}.\n` +
        `- Funding: the legacy USD 5,000 grant covers February, March, and USD ${creditByMonth.get("2026-04").toFixed(6)} of April; January and the remainder of April are cash-funded.\n` +
        `- Allocation: April's account-level funding split is allocated pro rata across exact provider-model costs.\n` +
        `- Verified zero usage: May, June, and July 2026.\n` +
        `- Open evidence gap: the original USD 5,000 grant award has no direct provider grant statement; the API report proves its exact burn and exhaustion, not the award itself.\n`,
);

console.log(
    JSON.stringify({
        proposed_updates: updates.length,
        model_rows: modelRows.length,
        tombstones: tombstones.length,
        zero_rows: zeroRows.length,
        exact_grant_burn_usd: reconciliation.reduce(
            (sum, row) => sum + row.provider_credit_usd,
            0,
        ),
    }),
);
