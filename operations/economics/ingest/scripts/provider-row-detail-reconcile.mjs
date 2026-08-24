import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const [snapshotArgument, replicateInvoiceArgument, outputBaseArgument] =
    process.argv.slice(2);
if (!snapshotArgument || !replicateInvoiceArgument || !outputBaseArgument) {
    throw new Error(
        "Usage: node provider-row-detail-reconcile.mjs <op-cloud-snapshot.json> <replicate-invoice.json> <output-base>",
    );
}

const snapshotPath = resolve(snapshotArgument);
const replicateInvoicePath = resolve(replicateInvoiceArgument);
const outputBase = resolve(outputBaseArgument);
const snapshotPayload = JSON.parse(readFileSync(snapshotPath, "utf8"));
const snapshotRows = Array.isArray(snapshotPayload)
    ? snapshotPayload
    : snapshotPayload.data;
if (!Array.isArray(snapshotRows)) throw new Error("Snapshot has no data array");
const rowById = new Map(snapshotRows.map((row) => [row.entry_id, row]));
const recordedAt = new Date().toISOString().replace("T", " ").replace("Z", "");

function requiredRow(entryId) {
    const row = rowById.get(entryId);
    if (!row) throw new Error(`Missing source row ${entryId}`);
    return row;
}

function assertAmount(row, { credit, paid, currency }) {
    if (
        Number(row.credit) !== credit ||
        Number(row.paid) !== paid ||
        row.currency !== currency
    ) {
        throw new Error(`Unexpected source amount for ${row.entry_id}`);
    }
}

function slug(value) {
    return value
        .toLowerCase()
        .replace(/[^a-z0-9]+/gu, "-")
        .replace(/^-|-$/gu, "");
}

const fireworksSpecs = [
    {
        entryId: "cli:fireworks:inference:2026-01-01 00:00:00::",
        credit: -768.64,
        month: "2026-01",
    },
    {
        entryId: "cli:fireworks:inference:2026-02-01 00:00:00::",
        credit: -3956.4,
        month: "2026-02",
    },
    {
        entryId: "cli:fireworks:inference:2026-03-01 00:00:00::",
        credit: -4596.53,
        month: "2026-03",
    },
];
const fireworksUpdates = fireworksSpecs.map((spec) => {
    const row = requiredRow(spec.entryId);
    assertAmount(row, { credit: spec.credit, paid: 0, currency: "USD" });
    if (row.account_id !== "myceli") {
        throw new Error(`${spec.entryId} is not assigned to Myceli`);
    }
    return {
        ...row,
        base_recorded_at: row.recorded_at,
        resource_id: `myceli-${spec.month}-account-total`,
        resource_name: "Myceli account usage total",
        resource_sku: "account total",
        resource_count: 1,
        recorded_at: recordedAt,
    };
});

const googleSpecs = [
    {
        entryId: "manual:google:inference:2026-01-01 00:00:00::",
        credit: 0,
        paid: -10249.6,
        resourceId: "invoice-5484467018-cash",
        resourceName: "Google Cloud invoice 5484467018 — cash-funded portion",
        resourceSku: "invoice funding split",
    },
    {
        entryId: "manual:google:inference:2026-01-01 00:00:00::-2",
        credit: -30650.34,
        paid: 0,
        resourceId: "invoice-5484467018-startup-credit",
        resourceName:
            "Google Cloud invoice 5484467018 — startup-credit portion",
        resourceSku: "invoice funding split (legacy allocation)",
    },
    {
        entryId: "manual:google:inference:2026-02-01 00:00:00::",
        credit: 0,
        paid: -4827.59,
        resourceId: "invoice-5513595370-total",
        resourceName: "Google Cloud invoice 5513595370 — total",
        resourceSku: "invoice total; detailed billing export is incomplete",
    },
];
const googleUpdates = googleSpecs.map((spec) => {
    const row = requiredRow(spec.entryId);
    assertAmount(row, {
        credit: spec.credit,
        paid: spec.paid,
        currency: "EUR",
    });
    return {
        ...row,
        base_recorded_at: row.recorded_at,
        resource_id: spec.resourceId,
        resource_name: spec.resourceName,
        resource_sku: spec.resourceSku,
        resource_count: 1,
        recorded_at: recordedAt,
    };
});

const stabilityEntryId = "manual:stability:inference:2026-06-01 00:00:00::";
const stability = requiredRow(stabilityEntryId);
assertAmount(stability, { credit: 0, paid: -30, currency: "USD" });
const stabilityTombstone = {
    ...stability,
    base_recorded_at: stability.recorded_at,
    source: "tombstone",
    credit: 0,
    paid: 0,
    evidence: `${stability.evidence} · superseded because this document is a prepaid credit purchase, not June provider usage; the purchase remains in op_transactions`,
    recorded_at: recordedAt,
};

const replicateAggregateId = "manual:replicate:inference:2026-04-01 00:00:00::";
const replicateAggregate = requiredRow(replicateAggregateId);
assertAmount(replicateAggregate, { credit: 0, paid: -6.06, currency: "USD" });
const replicatePayload = JSON.parse(readFileSync(replicateInvoicePath, "utf8"));
const invoice = replicatePayload.invoice;
if (
    invoice?.id !== "d1f8f25b-58e2-5340-a34b-dd921620cf9a" ||
    invoice.status !== "FINALIZED" ||
    invoice.started_on !== "2026-04-01" ||
    invoice.ended_before !== "2026-05-01" ||
    Number(invoice.total_cost_before_adjustments) !== 6.06 ||
    Number(invoice.total_adjustments) !== -6.06 ||
    Number(invoice.total_cost) !== 0 ||
    invoice.adjustments?.[0]?.description !== "One-time credit purchase applied"
) {
    throw new Error("Unexpected Replicate April invoice summary");
}
const replicateEvidence =
    "https://drive.google.com/file/d/19NKQy5ZWowEzKQY0KKiytg4Lnw4Ud_PF/view?usp=drivesdk";
const replicateRows = invoice.items.map((item) => ({
    entry_id: `invoice:replicate:inference:2026-04-01 00:00:00:${invoice.id}:${slug(`${item.model}-${item.type}-${item.label}-${item.unit_cost}`)}`,
    source: "invoice",
    start: "2026-04-01 00:00:00",
    end: "2026-05-01 00:00:00",
    vendor: "replicate",
    account_id: "",
    account_name: "",
    type: "inference",
    model: item.model,
    credit: 0,
    paid: -Number(item.cost),
    currency: "USD",
    evidence: replicateEvidence,
    recorded_at: recordedAt,
    resource_sku: `${item.label} @ ${item.unit_cost}/${item.unit}`,
    resource_count: Number(item.quantity),
    resource_id: `${invoice.id}:${item.mode}:${item.instance_tenancy}`,
    resource_name: item.label,
}));
const replicateTotal = replicateRows.reduce(
    (sum, row) => sum - Number(row.paid),
    0,
);
if (Math.abs(replicateTotal - 6.06) > 1e-9) {
    throw new Error("Replicate model rows do not reconcile to the invoice");
}
const replicateTombstone = {
    ...replicateAggregate,
    base_recorded_at: replicateAggregate.recorded_at,
    source: "tombstone",
    credit: 0,
    paid: 0,
    evidence: `${replicateEvidence} · superseded by exact finalized invoice model rows; the applied balance was purchased credit, so usage remains cash-backed`,
    recorded_at: recordedAt,
};

const updates = [
    ...fireworksUpdates,
    ...googleUpdates,
    stabilityTombstone,
    replicateTombstone,
    ...replicateRows,
];
if (updates.length !== new Set(updates.map((row) => row.entry_id)).size) {
    throw new Error("Generated duplicate entry IDs");
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

const report = {
    generated_at: recordedAt,
    source_snapshot: snapshotPath,
    scope: "Remaining aggregate provider-row classification",
    fireworks: {
        updates: fireworksUpdates.length,
        classification:
            "Exact provider API account totals; model detail is unavailable for these months.",
    },
    google: {
        updates: googleUpdates.length,
        classification:
            "Exact invoice totals/funding portions. January has no billing export and February's available export is incomplete, so no model split is fabricated.",
    },
    replicate: {
        aggregate_rows_superseded: 1,
        model_rows_added: replicateRows.length,
        usage_usd: replicateTotal,
        funding:
            "Cash-backed prepaid credit purchase applied; this is paid provider cost, not a promotional grant.",
        evidence: replicateEvidence,
    },
    stability: {
        usage_rows_removed: 1,
        reason: "The USD 30 invoice is a prepaid credit purchase and does not prove June usage. Its matching cash transaction remains recorded.",
        evidence: stability.evidence,
    },
    proposed_updates: updates.length,
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
    `# Provider row-detail reconciliation\n\n` +
        `- Fireworks: January–March retain exact Myceli account totals and are explicitly labeled as account aggregates; model detail was not available from the provider API.\n` +
        `- Google Cloud: January–February retain exact invoice totals/funding portions and are explicitly labeled as invoice aggregates; the detailed export is absent for January and incomplete for February.\n` +
        `- Replicate: the April USD 6.06 aggregate is replaced by exact finalized-invoice rows: USD 5.40 Seedance 2.0 and USD 0.66 LTX 2 Pro. The invoice applies purchased prepaid balance, so the usage is cash-backed.\n` +
        `- Stability AI: the USD 30 prepaid purchase is removed from provider usage and remains in the transaction ledger; monthly usage stays open until a provider export exists.\n`,
);

console.log(
    JSON.stringify({
        proposed_updates: updates.length,
        identity_updates: fireworksUpdates.length + googleUpdates.length,
        replicate_model_rows: replicateRows.length,
        tombstones: 2,
    }),
);
