import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const [
    cloudSnapshotArgument,
    pollenSnapshotArgument,
    outputBaseArgument,
    reportEvidenceUrl = "",
] = process.argv.slice(2);
if (!cloudSnapshotArgument || !pollenSnapshotArgument || !outputBaseArgument) {
    throw new Error(
        "Usage: node xai-2026-reconcile.mjs <op-cloud-snapshot.json> <op-pollen-snapshot.json> <output-base> [report-evidence-url]",
    );
}

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const economicsDirectory = resolve(scriptDirectory, "../..");
const cloudSnapshotPath = resolve(cloudSnapshotArgument);
const pollenSnapshotPath = resolve(pollenSnapshotArgument);
const outputBase = resolve(outputBaseArgument);
const billingHistoryPath = resolve(
    economicsDirectory,
    "ingest/data/inbox/xai/xai-billing-full-history-2026-08-20.json",
);

const ACCOUNT_ID = "ad7ac7e1-17f2-46e0-8dd2-7e99584f63e2";
const ACCOUNT_NAME = "Myceli.AI OÜ — tuesday-cuticle-eggnog";
const RAW_BILLING_EVIDENCE =
    "https://drive.google.com/file/d/1TTY-F5owacTJioBqbL5Eg63yCzpdY4II/view?usp=drivesdk";
const AUGUST_TOTAL_EVIDENCE =
    "https://drive.google.com/file/d/1dOAKeQtE4NcqviA6SrbUPXU4GQbOaprC/view?usp=drivesdk";

const invoiceEvidenceByMonth = {
    "2026-03":
        "https://drive.google.com/file/d/1ei60R9SRAdgHhodVW8sUX5iXORvJ8f7E/view?usp=drivesdk",
    "2026-04":
        "https://drive.google.com/file/d/1MMMAUIi1ebXN9GJAHqRbp0oVwBVouC5n/view?usp=drivesdk",
    "2026-05":
        "https://drive.google.com/file/d/11XtBMTGXJkZMgq5bbuyxJQVFHMVHo_mt/view?usp=drivesdk",
    "2026-06":
        "https://drive.google.com/file/d/165pvliJwcjpH6TsXa-jV3loCS17BGJFY/view?usp=drivesdk",
    "2026-07":
        "https://drive.google.com/file/d/1ElVkgGA2-WQDsS1gGraRZJep6X1QP8Hy/view?usp=drivesdk",
};

const topUpEvidenceByReference = {
    "MX8E-SUCT-U2LH":
        "https://drive.google.com/file/d/1rDJlKoBEe8deVk3ch1kSEiOnNUClVN6J/view?usp=drivesdk",
    "KKA5-EGCJ-YTHT":
        "https://drive.google.com/file/d/11MSXJkf6a9qd32iFhPFkTawREjr1UVBu/view?usp=drivesdk",
    "KCMP-HFCP-ZWD4":
        "https://drive.google.com/file/d/1NiwAL_CVFQoHEwgndieKttzapFWowNGT/view?usp=drivesdk",
    "63FM-HYTQ-U6QR":
        "https://drive.google.com/file/d/16UQ7iSnzvwk4Fv0WHQJhxOgP-YdZW-pL/view?usp=drivesdk",
};

const augustSources = [
    {
        model: "grok-imagine-image",
        sourceLabel: "API grok-imagine-image",
        path: "ingest/data/inbox/xai/xai-grok-imagine-image-usage-2026-08-01-to-2026-08-22-daily.csv",
        evidence:
            "https://drive.google.com/file/d/13FtlPndBFer5WzgzZzQDdUIQQs0TSUUW/view?usp=drivesdk",
    },
    {
        model: "grok-imagine-video-1.5",
        sourceLabel: "API grok-imagine-video-1.5",
        path: "ingest/data/inbox/xai/xai-grok-imagine-video-1.5-usage-2026-08-01-to-2026-08-22-daily.csv",
        evidence:
            "https://drive.google.com/file/d/1eEAeKs0cIOtT13FPC0jeDwU0NIUnFA-_/view?usp=drivesdk",
    },
    {
        model: "grok-transcribe",
        sourceLabel: "API Speech-to-Text",
        path: "ingest/data/inbox/xai/xai-speech-to-text-usage-2026-08-01-to-2026-08-22-daily.csv",
        evidence:
            "https://drive.google.com/file/d/1Ui2v0IlFZ2KLjd6qq8DX8pNHQbBz2ssV/view?usp=drivesdk",
    },
    {
        model: "grok-tts",
        sourceLabel: "API Text-to-Speech",
        path: "ingest/data/inbox/xai/xai-text-to-speech-usage-2026-08-01-to-2026-08-22-daily.csv",
        evidence:
            "https://drive.google.com/file/d/1rxyaTbxsZacncTvt7NlqsPJv7N3eE9vg/view?usp=drivesdk",
    },
];

const dashboardCalendarSpendUsd = {
    "2026-03": 306.82,
    "2026-04": 554.01,
    "2026-05": 322.34,
    "2026-06": 485.43,
    "2026-07": 431.03,
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

function closeEnough(actual, expected, label) {
    if (Math.abs(actual - expected) > 0.000001) {
        throw new Error(`${label}: expected ${expected}, got ${actual}`);
    }
}

function readUsageCsv(path) {
    const lines = readFileSync(path, "utf8").trim().split("\n");
    const header = lines.shift();
    if (header !== "period_start,period_end,usd,tokens,requests") {
        throw new Error(`${path} has an unexpected header`);
    }
    return lines.map((line) => {
        const [periodStart, periodEnd, usd, tokens, requests] = line.split(",");
        return {
            periodStart,
            periodEnd,
            usd: value(usd),
            tokens: value(tokens),
            requests: value(requests),
        };
    });
}

function canonicalProviderModel(model) {
    if (model === "grok-imagine-image") return "grok-imagine";
    if (
        model === "grok-imagine-image-pro" ||
        model === "grok-imagine-image-quality"
    ) {
        return "grok-imagine-pro";
    }
    if (model === "grok-imagine-video") return "grok-video-pro";
    return model;
}

function add(map, key, amount) {
    map.set(key, (map.get(key) ?? 0) + amount);
}

function mapToObject(map) {
    return Object.fromEntries(
        [...map].sort(([left], [right]) => left.localeCompare(right)),
    );
}

const cloudRows = readRows(cloudSnapshotPath);
const pollenRows = readRows(pollenSnapshotPath);
const billingHistory = JSON.parse(readFileSync(billingHistoryPath, "utf8"));
const recordedAt = new Date().toISOString().replace("T", " ").replace("Z", "");
const reportSuffix = reportEvidenceUrl
    ? ` · reconciliation ${reportEvidenceUrl}`
    : "";

if (billingHistory.validation?.teamId !== ACCOUNT_ID) {
    throw new Error("xAI billing history has an unexpected team ID");
}

const monthlyInvoices = new Map();
for (const invoice of billingHistory.invoices?.invoices ?? []) {
    const cycle = invoice.monthly?.billingCycle;
    if (!cycle) continue;
    const month = `${cycle.year}-${String(cycle.month).padStart(2, "0")}`;
    const grossUsageUsd = (invoice.lines ?? []).reduce(
        (sum, line) => sum + value(line.amount) / 100,
        0,
    );
    monthlyInvoices.set(month, {
        reference: invoice.invoice_number,
        grossUsageUsd,
        postPrepaidInvoiceTotalUsd: value(invoice.total) / 100,
    });
}

const expectedInvoiceTotals = {
    "2026-03": 308.54,
    "2026-04": 552.31,
    "2026-05": 322.3,
    "2026-06": 486.44,
    "2026-07": 430.22,
};
for (const [month, expected] of Object.entries(expectedInvoiceTotals)) {
    const invoice = monthlyInvoices.get(month);
    if (!invoice) throw new Error(`Missing xAI cycle invoice for ${month}`);
    closeEnough(invoice.grossUsageUsd, expected, `${month} invoice usage`);
}

const closedRows = cloudRows.filter(
    (row) =>
        row.vendor === "xai" &&
        String(row.start).slice(0, 7) >= "2026-03" &&
        String(row.start).slice(0, 7) <= "2026-07" &&
        (value(row.paid) < 0 || value(row.credit) < 0),
);
if (closedRows.length === 0) throw new Error("Snapshot has no closed xAI rows");

for (const [month, expected] of Object.entries(expectedInvoiceTotals)) {
    const ledgerUsage = closedRows
        .filter((row) => String(row.start).startsWith(month))
        .reduce((sum, row) => sum - value(row.paid) - value(row.credit), 0);
    closeEnough(ledgerUsage, expected, `${month} ledger usage`);
}

const updates = closedRows.map((row) => ({
    ...row,
    account_id: ACCOUNT_ID,
    account_name: ACCOUNT_NAME,
    evidence: `${RAW_BILLING_EVIDENCE}${reportSuffix}`,
    recorded_at: recordedAt,
}));

const provisionalAugustRows = cloudRows.filter(
    (row) =>
        row.vendor === "xai" &&
        String(row.start).startsWith("2026-08") &&
        String(row.entry_id).includes(":internal-model:"),
);
if (provisionalAugustRows.length !== 3) {
    throw new Error(
        `Expected 3 provisional August xAI rows, got ${provisionalAugustRows.length}`,
    );
}
for (const row of provisionalAugustRows) {
    updates.push({
        ...row,
        source: "tombstone",
        account_id: ACCOUNT_ID,
        account_name: ACCOUNT_NAME,
        credit: 0,
        paid: 0,
        evidence: `${reportEvidenceUrl || AUGUST_TOTAL_EVIDENCE} — superseded Pollen-derived provisional row with xAI dashboard export`,
        recorded_at: recordedAt,
    });
}

const augustModelUsage = [];
for (const source of augustSources) {
    const path = resolve(economicsDirectory, source.path);
    const rows = readUsageCsv(path);
    augustModelUsage.push({
        ...source,
        path,
        usd: rows.reduce((sum, row) => sum + row.usd, 0),
        tokens: rows.reduce((sum, row) => sum + row.tokens, 0),
        requests: rows.reduce((sum, row) => sum + row.requests, 0),
    });
}

const augustTotalRows = readUsageCsv(
    resolve(
        economicsDirectory,
        "ingest/data/inbox/xai/xai-usage-2026-08-01-to-2026-08-22-daily.csv",
    ),
);
const augustTotalUsd = augustTotalRows.reduce((sum, row) => sum + row.usd, 0);
closeEnough(
    augustModelUsage.reduce((sum, row) => sum + row.usd, 0),
    augustTotalUsd,
    "August xAI model exports",
);

for (const usage of augustModelUsage) {
    updates.push({
        entry_id: `dashboard:xai:inference:2026-08-01 00:00:00:${usage.model}:`,
        source: "dashboard",
        start: "2026-08-01 00:00:00",
        end: "2026-08-23 00:00:00",
        vendor: "xai",
        account_id: ACCOUNT_ID,
        account_name: ACCOUNT_NAME,
        type: "inference",
        model: usage.model,
        credit: 0,
        paid: -usage.usd,
        currency: "USD",
        evidence: usage.evidence,
        recorded_at: recordedAt,
        resource_sku: usage.sourceLabel,
        resource_count: usage.requests,
        resource_id: `xai-dashboard:2026-08:${usage.model}`,
        resource_name: usage.sourceLabel,
    });
}

const duplicateEntryIds =
    updates.length - new Set(updates.map((row) => row.entry_id)).size;
if (duplicateEntryIds !== 0) {
    throw new Error(`Generated ${duplicateEntryIds} duplicate entry IDs`);
}

const pollenByMonthModel = new Map();
for (const row of pollenRows.filter((row) => row.vendor === "xai")) {
    const month = String(row.month).slice(0, 7);
    const model = String(row.model);
    add(
        pollenByMonthModel,
        `${month}|${model}`,
        value(row.cost_paid) + value(row.cost_quests),
    );
}

const providerByMonthModel = new Map();
for (const row of closedRows) {
    const month = String(row.start).slice(0, 7);
    add(
        providerByMonthModel,
        `${month}|${canonicalProviderModel(row.model)}`,
        -value(row.paid) - value(row.credit),
    );
}
for (const usage of augustModelUsage) {
    add(
        providerByMonthModel,
        `2026-08|${canonicalProviderModel(usage.model)}`,
        usage.usd,
    );
}

const monthly = {};
for (const month of [
    "2026-03",
    "2026-04",
    "2026-05",
    "2026-06",
    "2026-07",
    "2026-08",
]) {
    const providerModels = new Map();
    const pollenModels = new Map();
    for (const [key, amount] of providerByMonthModel) {
        const [rowMonth, model] = key.split("|");
        if (rowMonth === month) providerModels.set(model, amount);
    }
    for (const [key, amount] of pollenByMonthModel) {
        const [rowMonth, model] = key.split("|");
        if (rowMonth === month) pollenModels.set(model, amount);
    }
    const models = {};
    for (const model of new Set([
        ...providerModels.keys(),
        ...pollenModels.keys(),
    ])) {
        const providerUsd = providerModels.get(model) ?? 0;
        const pollenUsd = pollenModels.get(model) ?? 0;
        models[model] = {
            provider_usd: providerUsd,
            pollen_usd: pollenUsd,
            provider_minus_pollen_usd: providerUsd - pollenUsd,
        };
    }
    const providerUsageUsd = [...providerModels.values()].reduce(
        (sum, amount) => sum + amount,
        0,
    );
    const pollenMeterUsd = [...pollenModels.values()].reduce(
        (sum, amount) => sum + amount,
        0,
    );
    monthly[month] = {
        provider_usage_usd: providerUsageUsd,
        pollen_meter_usd: pollenMeterUsd,
        provider_minus_pollen_usd: providerUsageUsd - pollenMeterUsd,
        models,
        cycle_invoice_reference: monthlyInvoices.get(month)?.reference ?? null,
        cycle_invoice_total_after_prepaid_usd:
            monthlyInvoices.get(month)?.postPrepaidInvoiceTotalUsd ?? null,
        invoice_evidence: invoiceEvidenceByMonth[month] ?? null,
        dashboard_calendar_gmt_plus_2_usd:
            dashboardCalendarSpendUsd[month] ?? null,
    };
}

const simulatedById = new Map(cloudRows.map((row) => [row.entry_id, row]));
for (const row of updates) simulatedById.set(row.entry_id, row);
const simulatedRows = [...simulatedById.values()].filter(
    (row) =>
        !(
            value(row.credit) === 0 &&
            value(row.paid) === 0 &&
            row.source === "tombstone"
        ),
);

writeFileSync(
    `${outputBase}.ndjson`,
    `${updates.map((row) => JSON.stringify(row)).join("\n")}\n`,
);
writeFileSync(
    `${outputBase}.report.json`,
    `${JSON.stringify(
        {
            generated_at: recordedAt,
            provider: "xai",
            account_id: ACCOUNT_ID,
            account_name: ACCOUNT_NAME,
            source_snapshot: cloudSnapshotPath,
            pollen_snapshot: pollenSnapshotPath,
            evidence: {
                raw_management_billing_history: RAW_BILLING_EVIDENCE,
                reconciliation_report: reportEvidenceUrl || null,
                invoices_by_usage_month: invoiceEvidenceByMonth,
                prepaid_topups_by_reference: topUpEvidenceByReference,
                august_total_daily_export: AUGUST_TOTAL_EVIDENCE,
                august_model_daily_exports: Object.fromEntries(
                    augustModelUsage.map((usage) => [
                        usage.model,
                        usage.evidence,
                    ]),
                ),
            },
            source_decisions: {
                closed_months:
                    "Use official UTC billing-cycle invoice lines. Dashboard calendar totals are GMT+2 and move small boundary amounts between months.",
                open_month:
                    "Use xAI dashboard CSV exports, never Pollen-derived estimates, until the cycle invoice closes.",
                prepaid:
                    "Purchased prepaid balance is cash-funded, not a provider grant; gross invoice-line usage remains paid provider cost.",
            },
            dashboard_findings: {
                checked_at: "2026-08-22",
                all_2026_usage_key: "pollinations",
                other_usage_keys_observed: false,
                august_export_through: "2026-08-22",
                august_total_usd: augustTotalUsd,
                august_requests: augustTotalRows.reduce(
                    (sum, row) => sum + row.requests,
                    0,
                ),
            },
            reconciliation_finding:
                "All dashboard spend belongs to the Pollinations runtime key. The provider invoices bill generated outputs, edit inputs, and moderated video units; the retained Pollen ledger contains successful internal cost events. Request-level cross-identifiers were not retained, so the historical difference cannot be assigned safely between Paid and Quest. Preserve both source ledgers and classify the significant months as historical tracking gaps.",
            routing_note:
                "Grok Imagine Pro and Grok Video Pro moved from direct xAI to OpenRouter on 2026-07-23. August direct xAI usage is base image, Grok Imagine Video 1.5, speech-to-text, and text-to-speech.",
            monthly,
            provider_model_totals: mapToObject(providerByMonthModel),
            pollen_model_totals: mapToObject(pollenByMonthModel),
            proposed_updates: updates.length,
            superseded_provisional_rows: provisionalAugustRows.length,
            august_provider_rows: augustModelUsage.length,
            duplicate_entry_ids: duplicateEntryIds,
        },
        null,
        2,
    )}\n`,
);
writeFileSync(
    `${outputBase}.simulated.json`,
    `${JSON.stringify({ data: simulatedRows })}\n`,
);

console.log(
    JSON.stringify({
        proposed_updates: updates.length,
        closed_rows: closedRows.length,
        superseded_provisional_rows: provisionalAugustRows.length,
        august_provider_rows: augustModelUsage.length,
        august_total_usd: augustTotalUsd,
        duplicate_entry_ids: duplicateEntryIds,
        monthly,
    }),
);
