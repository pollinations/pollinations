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
        "Usage: node alibaba-2026-reconcile.mjs <op-cloud-snapshot.json> <op-pollen-snapshot.json> <output-base> [report-evidence-url]",
    );
}

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const economicsDirectory = resolve(scriptDirectory, "../..");
const rawBillingPath = resolve(
    economicsDirectory,
    "ingest/data/inbox/alibaba/alibaba-2026-01-to-08-instance-bill-items.json",
);
const cloudSnapshotPath = resolve(cloudSnapshotArgument);
const pollenSnapshotPath = resolve(pollenSnapshotArgument);
const outputBase = resolve(outputBaseArgument);

const RAW_BILLING_EVIDENCE =
    "https://drive.google.com/file/d/1ImP3PS7o4eeq6BZapWElDJ3KUnsVY0PR/view?usp=drivesdk";
const ACCOUNT_ID = "5314153712077332";
const ACCOUNT_NAME = "Myceli.AI OÜ";

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

function sum(rows, field) {
    return rows.reduce((total, row) => total + value(row[field]), 0);
}

function modelOf(item) {
    return String(item.InstanceID ?? "").split(";")[2] ?? "";
}

function closeEnough(actual, expected, label) {
    if (Math.abs(actual - expected) > 0.000001) {
        throw new Error(`${label}: expected ${expected}, got ${actual}`);
    }
}

const rawBilling = JSON.parse(readFileSync(rawBillingPath, "utf8"));
const cloudRows = readRows(cloudSnapshotPath);
const pollenRows = readRows(pollenSnapshotPath);
const recordedAt = new Date().toISOString().replace("T", " ").replace("Z", "");
const evidence = reportEvidenceUrl
    ? `${RAW_BILLING_EVIDENCE} · reconciliation ${reportEvidenceUrl}`
    : RAW_BILLING_EVIDENCE;

const billingByMonth = new Map();
for (const [month, response] of Object.entries(rawBilling.months ?? {})) {
    const items = response?.Data?.Items?.Item;
    if (!Array.isArray(items))
        throw new Error(`Alibaba ${month} has no billing items`);
    if (String(response.Data.AccountID) !== ACCOUNT_ID) {
        throw new Error(`Alibaba ${month} has an unexpected account ID`);
    }
    billingByMonth.set(month, items);
}

const pollenByMonth = new Map();
for (const row of pollenRows.filter((row) => row.vendor === "alibaba")) {
    const month = String(row.month).slice(0, 7);
    pollenByMonth.set(
        month,
        (pollenByMonth.get(month) ?? 0) +
            value(row.cost_paid) +
            value(row.cost_quests),
    );
}

const existingAlibabaRows = cloudRows.filter(
    (row) => row.vendor === "alibaba" && String(row.start).startsWith("2026-"),
);
if (existingAlibabaRows.length === 0) {
    throw new Error("Snapshot has no 2026 Alibaba rows");
}

const March = "2026-03";
const marchCouponByModel = new Map();
for (const item of billingByMonth.get(March) ?? []) {
    const model = modelOf(item);
    marchCouponByModel.set(
        model,
        (marchCouponByModel.get(model) ?? 0) + value(item.DeductedByCoupons),
    );
}

const updates = [];
for (const row of existingAlibabaRows) {
    const month = String(row.start).slice(0, 7);
    const items = billingByMonth.get(month);
    if (!items) throw new Error(`Missing raw Alibaba billing for ${month}`);
    const modelItems = items.filter((item) => modelOf(item) === row.model);
    if (modelItems.length === 0) {
        throw new Error(`No Alibaba billing items match ${month} ${row.model}`);
    }
    closeEnough(
        -value(row.paid),
        sum(modelItems, "PretaxAmount"),
        `${month} ${row.model} net paid amount`,
    );
    updates.push({
        ...row,
        account_id: ACCOUNT_ID,
        account_name: ACCOUNT_NAME,
        credit:
            month === March
                ? -value(marchCouponByModel.get(row.model))
                : value(row.credit),
        evidence,
        recorded_at: recordedAt,
    });
}

const marchCouponTotal = [...marchCouponByModel.values()].reduce(
    (total, amount) => total + amount,
    0,
);
closeEnough(marchCouponTotal, 1000, "March Alibaba coupon total");
updates.push({
    entry_id:
        "api:alibaba:inference:2026-03-01 00:00:00:invoice-coupon-funding:",
    source: "api",
    start: "2026-03-01 00:00:00",
    end: "2026-04-01 00:00:00",
    vendor: "alibaba",
    account_id: ACCOUNT_ID,
    account_name: ACCOUNT_NAME,
    type: "inference",
    model: "",
    credit: marchCouponTotal,
    paid: 0,
    currency: "USD",
    evidence,
    recorded_at: recordedAt,
    resource_sku: "DeductedByCoupons",
    resource_count: 1,
    resource_id: "2026-03-invoice-coupon",
    resource_name: "March 2026 invoice coupon funding",
});

const duplicateEntryIds =
    updates.length - new Set(updates.map((row) => row.entry_id)).size;
if (duplicateEntryIds !== 0) {
    throw new Error(`Generated ${duplicateEntryIds} duplicate entry IDs`);
}

const simulatedById = new Map(cloudRows.map((row) => [row.entry_id, row]));
for (const row of updates) simulatedById.set(row.entry_id, row);

const monthly = {};
for (const [month, items] of billingByMonth) {
    const netCashUsd = sum(items, "PretaxAmount");
    const couponUsd = sum(items, "DeductedByCoupons");
    const invoiceDiscountUsd = sum(items, "InvoiceDiscount");
    const resourcePackageUnits = sum(items, "DeductedByResourcePackage");
    const grossListUsd = sum(items, "PretaxGrossAmount");
    const pollenMeterUsd = pollenByMonth.get(month) ?? 0;
    const providerUsageUsd = netCashUsd + couponUsd;
    const ledgerPaidUsd = existingAlibabaRows
        .filter((row) => String(row.start).slice(0, 7) === month)
        .reduce((total, row) => total - value(row.paid), 0);
    closeEnough(ledgerPaidUsd, netCashUsd, `${month} ledger net cash`);
    monthly[month] = {
        gross_list_usd: grossListUsd,
        invoice_discount_usd: invoiceDiscountUsd,
        coupon_funding_usd: couponUsd,
        resource_package_units: resourcePackageUnits,
        net_cash_usd: netCashUsd,
        provider_usage_usd: providerUsageUsd,
        pollen_meter_usd: pollenMeterUsd,
        provider_minus_pollen_usd: providerUsageUsd - pollenMeterUsd,
        meter_ratio:
            pollenMeterUsd > 0 ? providerUsageUsd / pollenMeterUsd : null,
    };
}

writeFileSync(
    `${outputBase}.ndjson`,
    `${updates.map((row) => JSON.stringify(row)).join("\n")}\n`,
);
writeFileSync(
    `${outputBase}.report.json`,
    `${JSON.stringify(
        {
            generated_at: recordedAt,
            provider: "alibaba",
            account_id: ACCOUNT_ID,
            source_snapshot: cloudSnapshotPath,
            pollen_snapshot: pollenSnapshotPath,
            raw_billing_path: rawBillingPath,
            evidence: {
                raw_billing: RAW_BILLING_EVIDENCE,
                reconciliation_report: reportEvidenceUrl || null,
            },
            accounting_decision: {
                coupon_funding:
                    "DeductedByCoupons is provider-funded usage and is booked as credit burn plus an equal funding award.",
                invoice_discount:
                    "InvoiceDiscount is the negotiated effective price and is not booked as a credit grant.",
                resource_package:
                    "DeductedByResourcePackage is retained as usage metadata only because it did not consistently reduce PretaxAmount.",
            },
            monthly,
            march_coupon_by_model_usd: Object.fromEntries(
                [...marchCouponByModel].filter(([, amount]) => amount > 0),
            ),
            historical_findings: {
                february:
                    "Provider billing records 33,453 video seconds and $1,524.49 net cash cost; the retained Pollen meter records about $553.05. Historical pricing used a simplified $0.025/second rate and cannot reconstruct missing Paid versus Quest allocation.",
                march: "The invoice contains an exact $1,000 provider coupon. The remaining provider-versus-Pollen gap cannot be assigned safely between Paid and Quest.",
                may_june:
                    "Provider invoices exceed the retained Pollen meter. The original ledgers remain unchanged because the historical split cannot be reconstructed safely.",
                relevant_commits: [
                    "ba0d213fd9343d8d387c5954e2e55ecf878bb183",
                    "e86acef4f42c2662921ff23f71cbcb5260b5d89a",
                    "8143008c80",
                    "1d0f6c19cc",
                    "c6c727c97c",
                    "0a33907475",
                ],
            },
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
        march_coupon_usd: marchCouponTotal,
        duplicate_entry_ids: duplicateEntryIds,
        monthly,
    }),
);
