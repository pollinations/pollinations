import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const [
    cloudArgument,
    pollenArgument,
    transactionsArgument,
    outputBaseArgument,
] = process.argv.slice(2);
if (
    !cloudArgument ||
    !pollenArgument ||
    !transactionsArgument ||
    !outputBaseArgument
) {
    throw new Error(
        "Usage: node pruna-2026-reconcile.mjs <op-cloud.json> <op-pollen.json> <op-transactions.json> <output-base>",
    );
}

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const economicsDirectory = resolve(scriptDirectory, "../..");
const inboxDirectory = resolve(economicsDirectory, "ingest/data/inbox/pruna");
const outputBase = resolve(outputBaseArgument);

function readRows(pathArgument) {
    const path = resolve(pathArgument);
    const contents = readFileSync(path, "utf8");
    const payload = JSON.parse(contents);
    const rows = Array.isArray(payload) ? payload : payload.data;
    if (!Array.isArray(rows)) throw new Error(`${path} has no data array`);
    return {
        path,
        rows,
        sha256: createHash("sha256").update(contents).digest("hex"),
    };
}

function sha256(path) {
    return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function round(value, places = 3) {
    const scale = 10 ** places;
    return Math.round((Number(value) + Number.EPSILON) * scale) / scale;
}

function sum(rows, field) {
    return rows.reduce((total, row) => total + Number(row[field] ?? 0), 0);
}

const cloud = readRows(cloudArgument);
const pollen = readRows(pollenArgument);
const transactions = readRows(transactionsArgument);
const generatedAt = new Date().toISOString();
const recordedAt = generatedAt.replace("T", " ").replace("Z", "");

const expectedLegacyPaid = new Map([
    ["2026-02", -1.1],
    ["2026-03", -163.42],
    ["2026-04", -128.94],
    ["2026-05", -57.23],
    ["2026-06", -5.23],
]);
const legacyRows = cloud.rows
    .filter(
        (row) =>
            row.vendor === "pruna" &&
            expectedLegacyPaid.has(String(row.start).slice(0, 7)),
    )
    .sort((a, b) => a.start.localeCompare(b.start));
if (legacyRows.length !== expectedLegacyPaid.size) {
    throw new Error(
        `Expected ${expectedLegacyPaid.size} Pruna legacy rows, found ${legacyRows.length}`,
    );
}
for (const row of legacyRows) {
    const month = String(row.start).slice(0, 7);
    if (
        row.entry_id !== `manual:pruna:inference:${month}-01 00:00:00::` ||
        Math.abs(Number(row.paid) - expectedLegacyPaid.get(month)) > 1e-9 ||
        Number(row.credit) !== 0
    ) {
        throw new Error(`Unexpected Pruna legacy row for ${month}`);
    }
}

const cloudUpdates = legacyRows.map((row) => ({
    ...row,
    base_recorded_at: row.recorded_at,
    resource_name: "Unallocated historical prepaid burn",
    resource_count: 1,
    evidence:
        "legacy provider_monthly manual row; Pruna portal checked 2026-08-21: historical usage export unavailable and zero statements do not validate this amount",
    recorded_at: recordedAt,
}));

const pollenRows = pollen.rows
    .filter((row) => row.vendor === "pruna")
    .sort(
        (a, b) =>
            a.month.localeCompare(b.month) || a.model.localeCompare(b.model),
    );
const pollenByMonth = new Map();
for (const row of pollenRows) {
    const rows = pollenByMonth.get(row.month) ?? [];
    rows.push(row);
    pollenByMonth.set(row.month, rows);
}

const reconciliation = [...expectedLegacyPaid].map(([month, paid]) => {
    const rows = pollenByMonth.get(month) ?? [];
    const pollenCost = rows.length ? sum(rows, "cost_paid") : null;
    const providerCost = -paid;
    return {
        month,
        legacy_provider_cost_usd: providerCost,
        internal_pollen_cost_usd: pollenCost == null ? null : round(pollenCost),
        internal_minus_legacy_usd:
            pollenCost == null ? null : round(pollenCost - providerCost),
        requests_paid: rows.length ? sum(rows, "requests_paid") : null,
        models: rows.map((row) => ({
            model: row.model,
            cost_paid_usd: round(row.cost_paid),
            requests_paid: Number(row.requests_paid),
        })),
    };
});

const topupInvoiceUrl =
    "https://drive.google.com/file/d/1rwzRRRlev13jXEspv6DvR4zRaaSBJNa6/view?usp=drivesdk";
const topupReceiptUrl =
    "https://drive.google.com/file/d/1UF3WQhRdVBH3zXPKHHcmWv_NguPqTAkF/view?usp=drivesdk";
const mayTopup = transactions.rows.find(
    (row) => row.entry_id === "CARD_TRANSACTION-3749504235",
);
if (
    !mayTopup ||
    mayTopup.vendor !== "pruna" ||
    mayTopup.date !== "2026-05-04" ||
    mayTopup.currency !== "EUR" ||
    Math.abs(Number(mayTopup.amount) + 85.68) > 1e-9
) {
    throw new Error("Expected the 2026-05-04 Pruna Wise top-up row");
}
const transactionUpdates = [
    {
        ...mayTopup,
        kind: "transaction",
        description:
            "Pruna.ai; US$100 prepaid credit top-up; invoice 548AAE0E-2304",
        evidence: `${topupInvoiceUrl} · receipt ${topupReceiptUrl}`,
        recorded_at: recordedAt,
    },
];

const invoiceDefinitions = [
    {
        invoice: "548AAE0E-0498",
        issue_date: "2026-03-26",
        service_period: "2026-02-26 to 2026-03-26",
        kind: "zero prepaid statement",
        amount: 0,
        currency: "EUR",
        drive_url:
            "https://drive.google.com/file/d/1_GfftWvkQkFxcQBK0GJsB22tzokTbZLs/view?usp=drivesdk",
    },
    {
        invoice: "548AAE0E-1742",
        issue_date: "2026-04-26",
        service_period: "2026-03-26 to 2026-04-26",
        kind: "zero prepaid statement",
        amount: 0,
        currency: "EUR",
        drive_url:
            "https://drive.google.com/file/d/17kunzCLP4P1Uo4jhoS-22IKlmHMgcZoL/view?usp=drivesdk",
    },
    {
        invoice: "548AAE0E-2304",
        issue_date: "2026-05-04",
        service_period: "2026-05-04 top-up",
        kind: "prepaid top-up",
        amount: 100,
        currency: "USD",
        drive_url: topupInvoiceUrl,
        receipt_url: topupReceiptUrl,
    },
    {
        invoice: "548AAE0E-3179",
        issue_date: "2026-05-26",
        service_period: "2026-04-26 to 2026-05-26",
        kind: "zero prepaid statement",
        amount: 0,
        currency: "EUR",
        drive_url:
            "https://drive.google.com/file/d/1B5zFUNS7U2yYWKRaaebZzo3oqz_0H2zv/view?usp=drivesdk",
    },
    {
        invoice: "548AAE0E-4678",
        issue_date: "2026-06-26",
        service_period: "2026-05-26 to 2026-06-26",
        kind: "zero prepaid statement",
        amount: 0,
        currency: "EUR",
        drive_url:
            "https://drive.google.com/file/d/1tpBLyQ31iUnPPmxUhXgekdfTKBxO1gVP/view?usp=drivesdk",
    },
    {
        invoice: "548AAE0E-6158",
        issue_date: "2026-07-26",
        service_period: "2026-06-26 to 2026-07-26",
        kind: "zero prepaid statement",
        amount: 0,
        currency: "EUR",
        drive_url:
            "https://drive.google.com/file/d/1C5nzpZ9lYhsKIL_Y8BxS1BrmIqwybuVW/view?usp=drivesdk",
    },
];
const invoices = invoiceDefinitions.map((invoice) => {
    const filename = `Invoice-${invoice.invoice}.pdf`;
    const path = resolve(inboxDirectory, filename);
    return { ...invoice, local_file: path, sha256: sha256(path) };
});

const prunaTransactions = transactions.rows
    .filter((row) => row.vendor === "pruna")
    .sort((a, b) => a.date.localeCompare(b.date));
const cloudById = new Map(cloud.rows.map((row) => [row.entry_id, row]));
for (const row of cloudUpdates) cloudById.set(row.entry_id, row);
const transactionsById = new Map(
    transactions.rows.map((row) => [row.entry_id, row]),
);
for (const row of transactionUpdates) transactionsById.set(row.entry_id, row);

const report = {
    generated_at: generatedAt,
    provider: "pruna",
    organization: "Myceli.AI",
    conclusion:
        "The five legacy February-June provider-cost rows remain unverified historical prepaid burn. Current Pruna usage has no backfill, and the official monthly statements are zero-quantity documents. Do not replace or validate the legacy amounts from these statements or from the current balance.",
    source_snapshots: {
        op_cloud: { path: cloud.path, sha256: cloud.sha256 },
        op_pollen: { path: pollen.path, sha256: pollen.sha256 },
        op_transactions: {
            path: transactions.path,
            sha256: transactions.sha256,
        },
    },
    portal_observation: {
        observed_on: "2026-08-21",
        current_balance_usd: 52.35,
        topups_card_visible_value_usd: 400,
        topups_card_visible_labels: ["This Month", "Total top-ups"],
        usage_months_checked: [
            "2026-02",
            "2026-03",
            "2026-04",
            "2026-05",
            "2026-06",
            "2026-07",
            "2026-08",
        ],
        result_for_each_checked_month: {
            total_requests: 0,
            average_per_bucket: 0,
            selected_models: 1,
            message: "No data for this selection",
            export_enabled: false,
        },
        limitation:
            "The current balance and top-up card are point-in-time values. Without archived month-boundary balances, they cannot reconstruct February-June calendar-month burn.",
    },
    invoices,
    wise_topups: prunaTransactions,
    legacy_provider_rows: legacyRows,
    internal_pollen_reconciliation: reconciliation,
    totals: {
        legacy_provider_cost_feb_to_jun_usd: round(
            [...expectedLegacyPaid.values()].reduce(
                (total, value) => total - value,
                0,
            ),
        ),
        internal_pollen_cost_mar_to_jun_usd: round(
            sum(pollenRows, "cost_paid"),
        ),
        internal_minus_legacy_mar_to_jun_usd: round(
            sum(pollenRows, "cost_paid") -
                reconciliation
                    .filter((row) => row.month >= "2026-03")
                    .reduce(
                        (total, row) => total + row.legacy_provider_cost_usd,
                        0,
                    ),
        ),
    },
    changes: {
        op_cloud:
            "Keep amounts unchanged; label each row as unallocated historical prepaid burn; keep its evidence non-Drive so the amount-evidence gap stays visible.",
        op_transactions:
            "Attach the exact May 4 US$100 top-up invoice and receipt to the matching Wise row. Four earlier Pruna Wise charges remain without an exact provider document.",
    },
    next_month_close:
        "Archive opening balance, calendar-month usage/export, top-ups, closing balance, and every invoice/receipt. If usage export remains unavailable, calculate balance-derived burn only when both month-boundary balances and all intervening top-ups are archived.",
};

const reconciliationLines = reconciliation
    .map(
        (row) =>
            `| ${row.month} | $${row.legacy_provider_cost_usd.toFixed(2)} | ${
                row.internal_pollen_cost_usd == null
                    ? "—"
                    : `$${row.internal_pollen_cost_usd.toFixed(3)}`
            } | ${
                row.internal_minus_legacy_usd == null
                    ? "—"
                    : `${row.internal_minus_legacy_usd >= 0 ? "+" : "−"}$${Math.abs(
                          row.internal_minus_legacy_usd,
                      ).toFixed(3)}`
            } | ${row.requests_paid ?? "—"} |`,
    )
    .join("\n");
const invoiceLines = invoices
    .map(
        (invoice) =>
            `| ${invoice.issue_date} | [${invoice.invoice}](${invoice.drive_url}) | ${invoice.service_period} | ${invoice.kind} | ${invoice.currency} ${invoice.amount.toFixed(2)} |`,
    )
    .join("\n");
const markdown = `# Pruna 2026 evidence reconciliation

Generated ${generatedAt} for Myceli.AI.

## Decision

The five February-June provider-cost rows remain **unverified historical prepaid burn**. The current Pruna portal has no historical usage backfill, and its official monthly statements are zero-quantity documents. They must not validate or replace the legacy dollar amounts.

- Keep the legacy amounts unchanged.
- Label the rows **Unallocated historical prepaid burn**.
- Keep their amount-evidence gap open in Economics.
- Attach the exact US$100 top-up invoice and receipt only to the matching 4 May Wise row.

## Portal check — 21 August 2026

- Current balance: **$52.35**.
- The top-up card showed **$400.00** with the visible labels “This Month” and “Total top-ups”; this point-in-time card is not historical usage evidence.
- February through August were checked in the calendar-month Usage view. Each returned 0 total requests, 0 average per bucket, one selected model, “No data for this selection,” and a disabled Export button.

## Provider documents

| Issued | Invoice | Provider period | Meaning | Amount |
| --- | --- | --- | --- | ---: |
${invoiceLines}

The statement periods run from the 26th to the 26th, not calendar months. The five EUR 0 statements prove that Pruna issued monthly prepaid statements; they do not prove how much prepaid balance was consumed.

## Legacy provider cost versus internal Pollen meter

| Month | Legacy provider cost | Internal Pollen cost | Internal minus legacy | Paid requests |
| --- | ---: | ---: | ---: | ---: |
${reconciliationLines}

- Legacy February-June total: **$${report.totals.legacy_provider_cost_feb_to_jun_usd.toFixed(2)}**.
- Internal March-June Pollen cost: **$${report.totals.internal_pollen_cost_mar_to_jun_usd.toFixed(2)}**.
- Internal minus legacy for March-June: **+$${report.totals.internal_minus_legacy_mar_to_jun_usd.toFixed(2)}**.

The internal model meter is useful for model/request context, but it does not reconcile to the historical provider totals. It must not be used to invent an exact provider-model allocation.

## Cash evidence

Five Pruna Wise charges exist from 26 February through 4 May. Only the 4 May row has an exact provider document in the available Pruna invoice history:

- [US$100 top-up invoice 548AAE0E-2304](${topupInvoiceUrl})
- [Payment receipt](${topupReceiptUrl})
- Matching Wise row: 4 May 2026, EUR 85.68.

The other four Wise charges remain cash-evidence gaps; the current Pruna invoice history does not expose matching top-up documents for them.

## Procedure from the next close

Archive the opening balance, exact calendar-month usage/export, all top-ups, the closing balance, and every invoice/receipt. If Pruna still provides no usage export, calculate balance-derived burn only when both month-boundary balances and every intervening top-up are archived.
`;

writeFileSync(
    `${outputBase}.op-cloud.ndjson`,
    `${cloudUpdates.map((row) => JSON.stringify(row)).join("\n")}\n`,
);
writeFileSync(
    `${outputBase}.op-transactions.ndjson`,
    `${transactionUpdates.map((row) => JSON.stringify(row)).join("\n")}\n`,
);
writeFileSync(
    `${outputBase}.simulated-cloud.json`,
    `${JSON.stringify({ data: [...cloudById.values()] }, null, 2)}\n`,
);
writeFileSync(
    `${outputBase}.simulated-transactions.json`,
    `${JSON.stringify({ data: [...transactionsById.values()] }, null, 2)}\n`,
);
writeFileSync(
    `${outputBase}.report.json`,
    `${JSON.stringify(report, null, 2)}\n`,
);
writeFileSync(`${outputBase}.report.md`, markdown);

console.log(
    JSON.stringify({
        op_cloud_updates: cloudUpdates.length,
        op_transaction_updates: transactionUpdates.length,
        legacy_cost_usd: report.totals.legacy_provider_cost_feb_to_jun_usd,
        pollen_cost_usd: report.totals.internal_pollen_cost_mar_to_jun_usd,
        remaining_amount_evidence_gaps: cloudUpdates.length,
        remaining_pruna_cash_evidence_gaps: prunaTransactions.length - 1,
    }),
);
