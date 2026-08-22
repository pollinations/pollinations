import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const [
    cloudSnapshotArgument,
    pollenSnapshotArgument,
    outputBaseArgument,
    reportEvidenceUrl = "",
] = process.argv.slice(2);
if (!cloudSnapshotArgument || !pollenSnapshotArgument || !outputBaseArgument) {
    throw new Error(
        "Usage: node bytedance-2026-reconcile.mjs <op-cloud-snapshot.json> <op-pollen-snapshot.json> <output-base> [report-evidence-url]",
    );
}

const cloudSnapshotPath = resolve(cloudSnapshotArgument);
const pollenSnapshotPath = resolve(pollenSnapshotArgument);
const outputBase = resolve(outputBaseArgument);
const ACCOUNT_ID = "3000852661";
const ACCOUNT_NAME = "Myceli.AI OÜ";
const CONTRACT_EVIDENCE =
    "https://drive.google.com/file/d/11ih6rA-gHyVByv4dFlllBKJWj3ie_LNN/view?usp=drivesdk";
const LEDGER_GRANT_USD = 10000;
const LIVE_BALANCE_USD = 14.79;

const dashboardByMonth = {
    "2026-01": { seedream: 4510.75, modelark_video: 1302.09 },
    "2026-02": { seedream: 881.24, modelark_video: 1451.81 },
    "2026-03": { seedream: 580.62, modelark_video: 456.18 },
    "2026-04": { seedream: 448.48, modelark_video: 102.03 },
    "2026-05": { seedream: 187.46, modelark_video: 40.25 },
    "2026-06": { seedream: 0, modelark_video: 0 },
    "2026-07": { seedream: 0, modelark_video: 0 },
    "2026-08": { seedream: 0, modelark_video: 0 },
};

function readRows(path) {
    const payload = JSON.parse(readFileSync(path, "utf8"));
    const rows = Array.isArray(payload) ? payload : payload.data;
    if (!Array.isArray(rows)) throw new Error(`${path} has no data array`);
    return rows;
}

function value(number) {
    const parsed = Number(number);
    return Number.isFinite(parsed) ? parsed : 0;
}

function monthEnd(month) {
    const date = new Date(`${month}-01T00:00:00Z`);
    date.setUTCMonth(date.getUTCMonth() + 1);
    return date.toISOString().slice(0, 10);
}

function closeEnough(actual, expected, label) {
    if (Math.abs(actual - expected) > 0.000001) {
        throw new Error(`${label}: expected ${expected}, got ${actual}`);
    }
}

function invoiceEvidence(rows) {
    return rows.find((row) => String(row.evidence).includes("drive.google.com"))
        ?.evidence;
}

const cloudRows = readRows(cloudSnapshotPath);
const pollenRows = readRows(pollenSnapshotPath);
const recordedAt = new Date().toISOString().replace("T", " ").replace("Z", "");
const existing = cloudRows.filter(
    (row) =>
        row.vendor === "bytedance" && String(row.start).startsWith("2026-"),
);
const grant = existing.find(
    (row) =>
        row.entry_id === "manual:bytedance:inference:2026-01-01 00:00:00:deal:",
);
if (!grant) throw new Error("Missing legacy BytePlus $10,000 deal row");
closeEnough(value(grant.credit), LEDGER_GRANT_USD, "BytePlus ledger grant");

const pollenByMonth = new Map();
for (const row of pollenRows.filter((row) => row.vendor === "bytedance")) {
    const month = String(row.month).slice(0, 7);
    pollenByMonth.set(
        month,
        (pollenByMonth.get(month) ?? 0) +
            value(row.cost_paid) +
            value(row.cost_quests),
    );
}

const updates = [];
const invoiceEvidenceByMonth = {};
for (const month of Object.keys(dashboardByMonth).slice(0, 5)) {
    const rows = existing.filter(
        (row) =>
            String(row.start).slice(0, 7) === month &&
            !(value(row.credit) > 0 && value(row.paid) === 0),
    );
    const expected = dashboardByMonth[month];
    const seedream = rows.find((row) => row.model === "seedream");
    const video = rows.find(
        (row) => row.resource_name === "ModelArk video generation",
    );
    if (!seedream || !video)
        throw new Error(`Missing BytePlus ${month} product rows`);
    closeEnough(
        -value(seedream.credit),
        expected.seedream,
        `${month} Seedream`,
    );
    closeEnough(
        -value(video.credit),
        expected.modelark_video,
        `${month} ModelArk video`,
    );
    const invoice = invoiceEvidence(rows);
    if (!invoice)
        throw new Error(`Missing archived BytePlus invoice for ${month}`);
    invoiceEvidenceByMonth[month] = invoice;
    for (const row of rows) {
        updates.push({
            ...row,
            account_id: ACCOUNT_ID,
            account_name: ACCOUNT_NAME,
            evidence: reportEvidenceUrl
                ? `${invoice} · dashboard full-year check ${reportEvidenceUrl}`
                : invoice,
            recorded_at: recordedAt,
            resource_sku:
                row.model === "seedream"
                    ? "Seedream"
                    : "ModelArk_video_generation",
            resource_name:
                row.model === "seedream"
                    ? "Seedream"
                    : "ModelArk video generation",
        });
    }
}

for (const month of ["2026-06", "2026-07", "2026-08"]) {
    if (!reportEvidenceUrl) continue;
    updates.push({
        entry_id: `dashboard:bytedance:inference:${month}-01 00:00:00:verified-zero:`,
        source: "dashboard",
        start: `${month}-01 00:00:00`,
        end: `${monthEnd(month)} 00:00:00`,
        vendor: "bytedance",
        account_id: ACCOUNT_ID,
        account_name: ACCOUNT_NAME,
        type: "inference",
        model: "",
        credit: 0,
        paid: 0,
        currency: "USD",
        evidence: reportEvidenceUrl,
        recorded_at: recordedAt,
        resource_sku: "verified-zero",
        resource_count: 0,
        resource_id: `bytedance:${month}:verified-zero`,
        resource_name: "BytePlus verified zero usage",
    });
}

updates.push({
    ...grant,
    account_id: ACCOUNT_ID,
    account_name: ACCOUNT_NAME,
    evidence: reportEvidenceUrl || grant.evidence,
    recorded_at: recordedAt,
    resource_sku: "deal-credit",
    resource_id: "byteplus-deal-credit",
    resource_name: "BytePlus deal credit (award document unverified)",
});

const duplicateEntryIds =
    updates.length - new Set(updates.map((row) => row.entry_id)).size;
if (duplicateEntryIds !== 0) {
    throw new Error(`Generated ${duplicateEntryIds} duplicate entry IDs`);
}

const simulatedById = new Map(cloudRows.map((row) => [row.entry_id, row]));
for (const row of updates) simulatedById.set(row.entry_id, row);

const monthly = Object.fromEntries(
    Object.entries(dashboardByMonth).map(([month, products]) => {
        const providerUsageUsd = products.seedream + products.modelark_video;
        const pollenMeterUsd = pollenByMonth.get(month) ?? 0;
        return [
            month,
            {
                ...products,
                provider_usage_usd: providerUsageUsd,
                pollen_meter_usd: pollenMeterUsd,
                provider_minus_pollen_usd: providerUsageUsd - pollenMeterUsd,
                invoice_evidence: invoiceEvidenceByMonth[month] ?? null,
            },
        ];
    }),
);
const providerUsageTotal = Object.values(dashboardByMonth).reduce(
    (total, products) => total + products.seedream + products.modelark_video,
    0,
);
closeEnough(providerUsageTotal, 9960.91, "BytePlus 2026 provider usage total");
const ledgerGrantRemaining = LEDGER_GRANT_USD - providerUsageTotal;
const balanceDifference = ledgerGrantRemaining - LIVE_BALANCE_USD;

writeFileSync(
    `${outputBase}.ndjson`,
    `${updates.map((row) => JSON.stringify(row)).join("\n")}\n`,
);
writeFileSync(
    `${outputBase}.report.json`,
    `${JSON.stringify(
        {
            generated_at: recordedAt,
            provider: "bytedance",
            provider_label: "BytePlus / ByteDance",
            account_id: ACCOUNT_ID,
            source_snapshot: cloudSnapshotPath,
            pollen_snapshot: pollenSnapshotPath,
            evidence: {
                reconciliation_report: reportEvidenceUrl || null,
                contract_and_discount_terms: CONTRACT_EVIDENCE,
                invoices_by_usage_month: invoiceEvidenceByMonth,
            },
            dashboard_observation: {
                checked_at: "2026-08-21",
                cost_analysis_range: "2026-01 through 2026-08",
                provider_usage_total_usd: providerUsageTotal,
                june_through_august_verified_zero: true,
                current_pay_by_credits_balance_usd: LIVE_BALANCE_USD,
                active_coupons: 0,
            },
            monthly,
            grant_reconciliation: {
                ledger_award_usd: LEDGER_GRANT_USD,
                award_source_document_verified: false,
                award_expiry_verified: false,
                provider_usage_usd: providerUsageTotal,
                ledger_remaining_usd: ledgerGrantRemaining,
                live_balance_usd: LIVE_BALANCE_USD,
                unresolved_difference_usd: balanceDifference,
                related_transaction_observation_usd: 24.3,
                decision:
                    "Preserve the legacy $10,000 award row, but do not invent award terms or reclassify the $24.30 difference until original evidence is found.",
            },
            routing_note:
                "Direct BytePlus usage ends after May 2026. Current Seedance and Seedream routes are reconciled under Replicate.",
            proposed_updates: updates.length,
            duplicate_entry_ids: duplicateEntryIds,
        },
        null,
        2,
    )}\n`,
);
writeFileSync(
    `${outputBase}.simulated.json`,
    `${JSON.stringify({ data: [...simulatedById.values()] })}\n`,
);

console.log(
    JSON.stringify({
        proposed_updates: updates.length,
        provider_usage_total_usd: providerUsageTotal,
        ledger_grant_remaining_usd: ledgerGrantRemaining,
        live_balance_usd: LIVE_BALANCE_USD,
        unresolved_difference_usd: balanceDifference,
        duplicate_entry_ids: duplicateEntryIds,
    }),
);
