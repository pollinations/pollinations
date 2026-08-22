import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const [snapshotPathArgument, outputBaseArgument] = process.argv.slice(2);
if (!snapshotPathArgument || !outputBaseArgument) {
    throw new Error(
        "Usage: node provider-evidence-backfill.mjs <op-cloud-snapshot.json> <output-base>",
    );
}

const snapshotPath = resolve(snapshotPathArgument);
const outputBase = resolve(outputBaseArgument);
const snapshot = JSON.parse(readFileSync(snapshotPath, "utf8"));
const rows = Array.isArray(snapshot) ? snapshot : snapshot.data;
if (!Array.isArray(rows)) throw new Error("Snapshot has no data array");

// These sources were checked against the existing ledger amounts before they
// were archived. The BytePlus exports reproduce both each monthly total and
// the Seedream / ModelArk split exactly.
const BYTEPLUS_EXPORT_BY_MONTH = new Map([
    [
        "2026-01",
        "https://drive.google.com/file/d/1cAWGXPVURp0YQb-jr_pgUqveBCwGubq3/view?usp=drivesdk",
    ],
    [
        "2026-02",
        "https://drive.google.com/file/d/1EwSy4EQ1nhFfJmbcBiugwgziBvG2U9JF/view?usp=drivesdk",
    ],
    [
        "2026-03",
        "https://drive.google.com/file/d/1GOoxTXkJA6gyTo9uFvXkNqBT3Bb8sDI1/view?usp=drivesdk",
    ],
    [
        "2026-04",
        "https://drive.google.com/file/d/1JKBIAJAkCcn1UyD0ttFG8Jo9e9yqsNhu/view?usp=drivesdk",
    ],
    [
        "2026-05",
        "https://drive.google.com/file/d/17JEvD6NqwcoC0ipxhu_c1qU5YVU_XhMR/view?usp=drivesdk",
    ],
]);

const EVIDENCE_BY_ENTRY_ID = new Map([
    [
        "manual:cloudflare:infra:2026-02-01 00:00:00:startup program:",
        "https://drive.google.com/file/d/1YC2v9UfIuCWFLxyQQQukBkBs-0vxx0Jy/view?usp=drivesdk — Myceli invoice IN-58053737, issued 2026-02-22; USD 0 due and USD 250,000 Cloudflare startup-credit balance remaining",
    ],
    [
        "manual:cloudflare:infra:2026-06-01 00:00:00::",
        "https://drive.google.com/file/d/1iFPbooo1GAYWGbOStcrD2lwybUSWp-tQ/view?usp=drivesdk — Myceli invoice IN-69076483, billing cycle 2026-05-22..2026-06-21; USD 1,399.04 billed; https://drive.google.com/file/d/1KBmJ2en-pS9p3rcHjc_x0AhKDKNbQKWm/view?usp=drivesdk — credit memo IN-69076483-CN-01, fully refunded 2026-06-24",
    ],
    [
        "manual:daytona:infra:2026-02-01 00:00:00:subscription usage:",
        "https://drive.google.com/file/d/1pmq0WarPXAltXifZOXVuSID5vF5rlpYF/view?usp=drivesdk",
    ],
    [
        "manual:stability:inference:2026-06-01 00:00:00::",
        "https://drive.google.com/file/d/1BcfwLulrw0fTd61VuR2YyO82WqUUjCA0/view?usp=drivesdk",
    ],
    [
        "manual:replicate:inference:2026-04-01 00:00:00::",
        "https://drive.google.com/file/d/19NKQy5ZWowEzKQY0KKiytg4Lnw4Ud_PF/view?usp=drivesdk",
    ],
]);

const AWS_COST_EXPLORER_EXPORT =
    "https://drive.google.com/file/d/1LpTFO5jnYuH4N-Jq427GbEJcj7NPM9g0/view?usp=drivesdk";
const REPLICATE_JANUARY_INVOICE =
    "https://drive.google.com/file/d/1KfwayeEb2yNF9BwxPNx_H-p932YUwkFj/view?usp=drivesdk";
const DIGITALOCEAN_INVOICE_BY_ID = new Map([
    [
        "539679449",
        "https://drive.google.com/file/d/1A8FMzOygHI-59XwCsDw0drqbKdzf5e7L/view?usp=drivesdk",
    ],
    [
        "539894183",
        "https://drive.google.com/file/d/1uYiWoJA3N1uIWRPcqfYk1V8jDC4pTWpD/view?usp=drivesdk",
    ],
    [
        "542126598",
        "https://drive.google.com/file/d/10SHvCIv4J9yD63N_xynO8-H9of1RNlRc/view?usp=drivesdk",
    ],
    [
        "544345774",
        "https://drive.google.com/file/d/1KIQSuC-6yi_h_Q7WR1WhEjaKPWolQyY6/view?usp=drivesdk",
    ],
    [
        "546252005",
        "https://drive.google.com/file/d/1w-BsdY6TQeWkRwdnPszFBmSfH8Bj27e3/view?usp=drivesdk",
    ],
    [
        "548801395",
        "https://drive.google.com/file/d/1PDG9fuHUrCcbURjHKe7t50Wg6ChAPaxs/view?usp=drivesdk",
    ],
]);
const CLOUDFLARE_INVOICE_BY_ID = new Map([
    [
        "IN-54966851",
        "https://drive.google.com/file/d/1aepE0rNg8oMGVUxjIKogmPOu38mF34Cw/view?usp=drivesdk",
    ],
    [
        "IN-57102048",
        "https://drive.google.com/file/d/12687zNozetPUmza0FpsI-Whats8HMWHF/view?usp=drivesdk",
    ],
    [
        "IN-61954991",
        "https://drive.google.com/file/d/1hymWL6xnviz_FTrofSpY5BSZ4k8noZRB/view?usp=drivesdk",
    ],
    [
        "IN-63780544",
        "https://drive.google.com/file/d/1MHjYCn_fY_Al87j_1C0bDHM4zF83-LXA/view?usp=drivesdk",
    ],
    [
        "IN-67150086",
        "https://drive.google.com/file/d/1p2tshX4Ajdg7iHraswo5rSHGU8jV-lvb/view?usp=drivesdk",
    ],
]);
const CLOUDFLARE_MYCELI_MARCH_ZERO = {
    entry_id:
        "invoice:cloudflare:infra:2026-03-01 00:00:00:IN-60464669-account-witness:",
    source: "invoice",
    vendor: "cloudflare",
    account_id: "myceli",
    account_name: "Myceli.AI OÜ",
    type: "infra",
    start: "2026-03-01 00:00:00",
    end: "2026-04-01 00:00:00",
    credit: 0,
    paid: 0,
    currency: "USD",
    resource_id: "IN-60464669-account-witness",
    resource_name: "Myceli monthly account invoice witness",
    resource_sku: "zero invoice",
    resource_count: 0,
    model: "",
    evidence:
        "https://drive.google.com/file/d/1A2zTIFmST8IRw1X7QRbbGHsQl5fCFus1/view?usp=drivesdk — Myceli invoice IN-60464669, issued 2026-03-22; USD 0 subtotal, USD 0 due, and USD 250,000 startup-credit balance remaining",
};
const OPENROUTER_POLLINATIONS_JULY_ZERO = {
    entry_id:
        "dashboard:openrouter:inference:2026-07-01 00:00:00:pollinations-verified-zero:",
    source: "dashboard",
    vendor: "openrouter",
    account_id: "pollinations",
    account_name: "PollinationsAI",
    type: "inference",
    start: "2026-07-01 00:00:00",
    end: "2026-08-01 00:00:00",
    credit: 0,
    paid: 0,
    currency: "USD",
    resource_id: "pollinations-verified-zero",
    resource_name: "PollinationsAI verified zero",
    resource_sku: "account total",
    resource_count: 0,
    model: "",
    evidence:
        "https://drive.google.com/file/d/1jI3tyO2HB8tni-yR_SSOYektlB2BVebt/view?usp=drivesdk",
};

function evidenceFor(row) {
    const direct = EVIDENCE_BY_ENTRY_ID.get(row.entry_id);
    if (direct) return direct;

    if (row.vendor === "bytedance" && row.source === "agent") {
        return BYTEPLUS_EXPORT_BY_MONTH.get(String(row.start).slice(0, 7));
    }

    if (
        row.vendor === "aws" &&
        String(row.evidence).includes(
            "aws-2025-08-to-2026-03-export-cost-explorer-daily",
        )
    ) {
        return AWS_COST_EXPLORER_EXPORT;
    }

    if (
        row.vendor === "replicate" &&
        String(row.evidence).includes("Invoice-Y3QLNESN-0008.pdf")
    ) {
        return REPLICATE_JANUARY_INVOICE;
    }

    if (row.vendor === "digitalocean") {
        const resourceId = String(row.resource_id ?? "");
        for (const [invoiceId, evidence] of DIGITALOCEAN_INVOICE_BY_ID) {
            if (resourceId.startsWith(invoiceId)) return evidence;
        }
    }

    if (row.vendor === "cloudflare") {
        const resourceId = String(row.resource_id ?? "");
        for (const [invoiceId, evidence] of CLOUDFLARE_INVOICE_BY_ID) {
            if (resourceId.startsWith(invoiceId)) return evidence;
        }
    }

    return undefined;
}

const recordedAt = new Date().toISOString().replace("T", " ").replace("Z", "");
const updates = [];
const counts = {};

for (const row of rows) {
    const evidence = evidenceFor(row);
    if (!evidence || row.evidence === evidence) continue;

    counts[row.vendor] = (counts[row.vendor] ?? 0) + 1;
    updates.push({
        ...row,
        account_id: row.account_id ?? null,
        account_name: row.account_name ?? null,
        evidence,
        recorded_at: recordedAt,
    });
}

if (
    !rows.some((row) => row.entry_id === CLOUDFLARE_MYCELI_MARCH_ZERO.entry_id)
) {
    updates.push({
        ...CLOUDFLARE_MYCELI_MARCH_ZERO,
        recorded_at: recordedAt,
    });
}

if (
    !rows.some(
        (row) => row.entry_id === OPENROUTER_POLLINATIONS_JULY_ZERO.entry_id,
    )
) {
    updates.push({
        ...OPENROUTER_POLLINATIONS_JULY_ZERO,
        recorded_at: recordedAt,
    });
}

const duplicateEntryIds =
    updates.length - new Set(updates.map((row) => row.entry_id)).size;
if (duplicateEntryIds !== 0) {
    throw new Error(`Generated ${duplicateEntryIds} duplicate entry IDs`);
}

const sourceRowsById = new Map(rows.map((row) => [row.entry_id, row]));
const amountMutations = updates.filter((row) => {
    const source = sourceRowsById.get(row.entry_id);
    return (
        source != null &&
        (source.credit !== row.credit || source.paid !== row.paid)
    );
}).length;
if (amountMutations !== 0) {
    throw new Error(`Generated ${amountMutations} amount mutations`);
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
            source_snapshot: snapshotPath,
            scope: "archived Drive evidence with exact ledger support",
            counts,
            proposed_updates: updates.length,
            new_rows: updates.filter((row) => !sourceRowsById.has(row.entry_id))
                .length,
            duplicate_entry_ids: duplicateEntryIds,
            amount_mutations: amountMutations,
        },
        null,
        2,
    )}\n`,
);

console.log(
    JSON.stringify({
        proposed_updates: updates.length,
        new_rows: updates.filter((row) => !sourceRowsById.has(row.entry_id))
            .length,
        counts,
        duplicate_entry_ids: duplicateEntryIds,
        amount_mutations: amountMutations,
    }),
);
