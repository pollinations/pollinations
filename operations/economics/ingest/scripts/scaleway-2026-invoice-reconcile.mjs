import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const [snapshotPathArgument, outputBaseArgument] = process.argv.slice(2);
if (!snapshotPathArgument || !outputBaseArgument) {
    throw new Error(
        "Usage: node scaleway-2026-invoice-reconcile.mjs <op-cloud-snapshot.json> <output-base>",
    );
}

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const economicsDirectory = resolve(scriptDirectory, "../..");
const inboxDirectory = resolve(
    economicsDirectory,
    "ingest/data/inbox/scaleway",
);
const snapshotPath = resolve(snapshotPathArgument);
const outputBase = resolve(outputBaseArgument);
const snapshot = JSON.parse(readFileSync(snapshotPath, "utf8"));
const snapshotRows = Array.isArray(snapshot) ? snapshot : snapshot.data;
if (!Array.isArray(snapshotRows)) throw new Error("Snapshot has no data array");

const ORGANIZATION_ID = "fad8c43c-762a-4cde-9043-641d6ff37586";
const ORGANIZATION_NAME = "Pollinations.AI";
const INVOICE_LIST_EVIDENCE =
    "https://drive.google.com/file/d/1M_br3naCwZ0jDZkskxIhYppoRbR1deFB/view?usp=drivesdk";
const DISCOUNT_EVIDENCE =
    "https://drive.google.com/file/d/1HEp4lwN8_GhrgWVuhfY0UpsfitEaWBIv/view?usp=drivesdk";
const evidenceByMonth = {
    "2026-01": {
        invoice:
            "https://drive.google.com/file/d/166TqmWEPEWjn07AoDMjKmHTC1dbdPoeM/view?usp=drivesdk",
        consumption:
            "https://drive.google.com/file/d/103Slav6PdamipWcoUusICnFP3oftOTsS/view?usp=drivesdk",
    },
    "2026-02": {
        invoice:
            "https://drive.google.com/file/d/17ocMXMPMKigoPv0UtKQFlpjl5l5mGeYc/view?usp=drivesdk",
        consumption:
            "https://drive.google.com/file/d/1tzbQsSJgZMk3TYjUQ4jUeg1NvN3INn0n/view?usp=drivesdk",
    },
};

const consumptionByMonth = new Map(
    ["2026-01", "2026-02"].map((month) => [
        month,
        JSON.parse(
            readFileSync(
                resolve(inboxDirectory, `scaleway-consumption-${month}.json`),
                "utf8",
            ),
        ).consumptions,
    ]),
);
const invoiceList = JSON.parse(
    readFileSync(
        resolve(inboxDirectory, "scaleway-invoices-2026-01-07.json"),
        "utf8",
    ),
).invoices;

function money(value) {
    return Number(value?.units ?? 0) + Number(value?.nanos ?? 0) / 1e9;
}

function slug(value) {
    return String(value)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");
}

function modelFor(consumption) {
    if (consumption.sku.includes("mistral_small_3_2_24b")) {
        return "mistral-small-3.2-24b";
    }
    if (consumption.sku.includes("qwen3_coder_30b_a3b")) {
        return "qwen-3-coder-30b-a3b-instruct";
    }
    if (
        consumption.category_name === "Compute" &&
        consumption.product_name === "L4"
    ) {
        return "l4";
    }
    return "";
}

function typeFor(consumption) {
    if (consumption.category_name === "AI") return "inference";
    if (
        consumption.category_name === "Compute" &&
        consumption.product_name === "L4"
    ) {
        return "gpu";
    }
    return "infra";
}

function nextMonth(month) {
    const date = new Date(`${month}-01T00:00:00Z`);
    date.setUTCMonth(date.getUTCMonth() + 1);
    return date.toISOString().slice(0, 10);
}

const recordedAt = new Date().toISOString().replace("T", " ").replace("Z", "");
const detailedRows = [];
const invoiceSummary = {};

for (const month of ["2026-01", "2026-02"]) {
    const invoice = invoiceList.find(
        (candidate) => candidate.billing_period.slice(0, 7) === month,
    );
    if (!invoice)
        throw new Error(`Missing Scaleway invoice metadata for ${month}`);
    if (invoice.state !== "issued") {
        throw new Error(`Scaleway invoice ${invoice.number} is not issued`);
    }

    const grossRows = consumptionByMonth
        .get(month)
        .map((consumption) => ({
            consumption,
            gross: money(consumption.value),
        }))
        .filter((row) => row.gross > 0)
        .sort(
            (a, b) =>
                a.consumption.project_name.localeCompare(
                    b.consumption.project_name,
                ) || a.consumption.sku.localeCompare(b.consumption.sku),
        );
    const gross = grossRows.reduce((sum, row) => sum + row.gross, 0);
    const undiscounted = money(invoice.total_undiscount);
    const discount = -money(invoice.total_discount);
    const untaxed = money(invoice.total_untaxed);
    const tax = money(invoice.total_tax);
    const totalDue = money(invoice.total_taxed);

    if (Math.abs(gross - undiscounted) > 1e-8) {
        throw new Error(
            `${month} consumption ${gross} does not match invoice gross ${undiscounted}`,
        );
    }
    if (Math.abs(gross - discount - untaxed) > 1e-8) {
        throw new Error(`${month} invoice discount does not reconcile`);
    }
    if (Math.abs(untaxed + tax - totalDue) > 1e-8) {
        throw new Error(`${month} invoice tax does not reconcile`);
    }

    let allocatedCredit = 0;
    grossRows.forEach(({ consumption, gross: rowGross }, index) => {
        const creditBurn =
            index === grossRows.length - 1
                ? discount - allocatedCredit
                : (discount * rowGross) / gross;
        allocatedCredit += creditBurn;
        const paidBurn = rowGross - creditBurn;
        const type = typeFor(consumption);
        const evidence = evidenceByMonth[month];
        detailedRows.push({
            entry_id: `api:scaleway:${type}:${month}-01 00:00:00:${invoice.number}:${slug(consumption.project_name)}:${slug(consumption.sku)}`,
            source: "api",
            start: `${month}-01 00:00:00`,
            end: `${nextMonth(month)} 00:00:00`,
            vendor: "scaleway",
            account_id: ORGANIZATION_ID,
            account_name: ORGANIZATION_NAME,
            type,
            model: modelFor(consumption),
            credit: -creditBurn,
            paid: -paidBurn,
            currency: "EUR",
            evidence: `${evidence.consumption} · invoice ${evidence.invoice}`,
            recorded_at: recordedAt,
            resource_sku: consumption.sku,
            resource_count: 1,
            resource_id: `${consumption.project_id}:${consumption.sku}`,
            resource_name: `${consumption.project_name}: ${consumption.resource_name}`,
        });
    });

    const evidence = evidenceByMonth[month];
    detailedRows.push({
        entry_id: `api:scaleway:infra:${month}-01 00:00:00:${invoice.number}:vat-19`,
        source: "api",
        start: `${month}-01 00:00:00`,
        end: `${nextMonth(month)} 00:00:00`,
        vendor: "scaleway",
        account_id: ORGANIZATION_ID,
        account_name: ORGANIZATION_NAME,
        type: "infra",
        model: "",
        credit: 0,
        paid: -tax,
        currency: "EUR",
        evidence: `${evidence.invoice} · invoice state and totals ${INVOICE_LIST_EVIDENCE}`,
        recorded_at: recordedAt,
        resource_sku: "vat-19",
        resource_count: 1,
        resource_id: `${invoice.number}:vat-19`,
        resource_name: "VAT 19% (provider-payable, not provider usage)",
    });

    invoiceSummary[month] = {
        invoice_number: invoice.number,
        state: invoice.state,
        service_usage_eur: gross,
        provider_credit_eur: discount,
        provider_payable_before_vat_eur: untaxed,
        vat_eur: tax,
        total_provider_payable_eur: totalDue,
        detailed_service_rows: grossRows.length,
    };
}

const legacyEntryIds = [
    "manual:scaleway:inference:2026-01-01 00:00:00::",
    "manual:scaleway:inference:2026-02-01 00:00:00::",
    "manual:scaleway:inference:2026-01-01 00:00:00:overdue invoice discount:",
];
const rowsById = new Map(snapshotRows.map((row) => [row.entry_id, row]));
const tombstones = legacyEntryIds.map((entryId) => {
    const row = rowsById.get(entryId);
    if (!row) throw new Error(`Missing legacy Scaleway row ${entryId}`);
    return {
        ...row,
        credit: 0,
        paid: 0,
        evidence: `${INVOICE_LIST_EVIDENCE} · superseded by exact 2026 invoice and consumption rows; the two issued invoices were not waived`,
        recorded_at: recordedAt,
    };
});

const grantEntryId =
    "manual:scaleway:inference:2026-01-01 00:00:00:startup grant:";
const grant = rowsById.get(grantEntryId);
if (!grant) throw new Error(`Missing Scaleway grant row ${grantEntryId}`);
const grantUpdate = {
    ...grant,
    account_id: ORGANIZATION_ID,
    account_name: ORGANIZATION_NAME,
    evidence: `${DISCOUNT_EVIDENCE} · January application ${evidenceByMonth["2026-01"].invoice}`,
    recorded_at: recordedAt,
};

const updates = [...tombstones, grantUpdate, ...detailedRows];
const duplicateEntryIds =
    updates.length - new Set(updates.map((row) => row.entry_id)).size;
if (duplicateEntryIds !== 0) {
    throw new Error(`Generated ${duplicateEntryIds} duplicate entry IDs`);
}

const simulatedById = new Map(snapshotRows.map((row) => [row.entry_id, row]));
for (const row of updates) simulatedById.set(row.entry_id, row);
const simulated = [...simulatedById.values()].filter(
    (row) =>
        !(
            Number(row.credit) === 0 &&
            Number(row.paid) === 0 &&
            String(row.evidence).toLowerCase().includes("superseded")
        ),
);
const activeScaleway2026 = simulated.filter(
    (row) => row.vendor === "scaleway" && String(row.start).startsWith("2026"),
);

for (const month of ["2026-01", "2026-02"]) {
    const rows = activeScaleway2026.filter(
        (row) => String(row.start).slice(0, 7) === month,
    );
    const serviceRows = rows.filter(
        (row) => row.resource_sku !== "vat-19" && Number(row.credit) <= 0,
    );
    const credit = serviceRows.reduce(
        (sum, row) => sum - Number(row.credit),
        0,
    );
    const payableBeforeVat = serviceRows.reduce(
        (sum, row) => sum - Number(row.paid),
        0,
    );
    const vat = rows
        .filter((row) => row.resource_sku === "vat-19")
        .reduce((sum, row) => sum - Number(row.paid), 0);
    const expected = invoiceSummary[month];
    if (
        Math.abs(credit - expected.provider_credit_eur) > 1e-8 ||
        Math.abs(payableBeforeVat - expected.provider_payable_before_vat_eur) >
            1e-8 ||
        Math.abs(vat - expected.vat_eur) > 1e-8
    ) {
        throw new Error(
            `${month} simulated Scaleway ledger does not reconcile`,
        );
    }
}

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
    `${JSON.stringify(
        {
            generated_at: recordedAt,
            source_snapshot: snapshotPath,
            evidence: {
                invoice_list: INVOICE_LIST_EVIDENCE,
                discounts: DISCOUNT_EVIDENCE,
                ...evidenceByMonth,
            },
            allocation_method:
                "Invoice discounts are allocated pro rata across exact project/SKU consumption rows because the invoice applies them only at invoice level. VAT is a separate infra row and does not inflate provider/model usage.",
            payment_status:
                "Both invoices are issued and provider-payable. No cash-payment witness has been recorded.",
            invoices: invoiceSummary,
            total_provider_payable_eur: Object.values(invoiceSummary).reduce(
                (sum, invoice) => sum + invoice.total_provider_payable_eur,
                0,
            ),
            proposed_updates: updates.length,
            detailed_rows: detailedRows.length,
            tombstones: tombstones.length,
            duplicate_entry_ids: duplicateEntryIds,
            invariants: {
                consumption_matches_invoice_gross: true,
                credit_plus_payable_before_vat_matches_service_usage: true,
                payable_plus_vat_matches_total_due: true,
            },
        },
        null,
        2,
    )}\n`,
);

console.log(
    JSON.stringify({
        proposed_updates: updates.length,
        detailed_rows: detailedRows.length,
        tombstones: tombstones.length,
        total_provider_payable_eur: Object.values(invoiceSummary).reduce(
            (sum, invoice) => sum + invoice.total_provider_payable_eur,
            0,
        ),
        duplicate_entry_ids: duplicateEntryIds,
    }),
);
