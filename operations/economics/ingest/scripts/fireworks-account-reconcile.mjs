import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const [snapshotPathArgument, outputBaseArgument] = process.argv.slice(2);
if (!snapshotPathArgument || !outputBaseArgument) {
    throw new Error(
        "Usage: node fireworks-account-reconcile.mjs <op-cloud-snapshot.json> <output-base>",
    );
}

const snapshotPath = resolve(snapshotPathArgument);
const outputBase = resolve(outputBaseArgument);
const snapshot = JSON.parse(readFileSync(snapshotPath, "utf8"));
const rows = Array.isArray(snapshot) ? snapshot : snapshot.data;
if (!Array.isArray(rows)) throw new Error("Snapshot has no data array");

const ACCOUNT_LABEL = new Map([
    ["myceli", "Myceli"],
    ["pollinations", "Pollinations.AI"],
    ["et-fy", "Pollinations"],
    ["neoglyph", "Neoglyph"],
    ["pixelmarket", "Pixelmarket"],
]);
const MONTHLY_USAGE = new Map([
    [
        "et-fy|2026-07",
        {
            usd: 0,
            evidence:
                "https://app.fireworks.ai/account/billing — account ID et-fy; no active payment method, balance, spend, or transactions",
        },
    ],
    [
        "myceli|2026-01",
        {
            usd: 768.63618286,
            evidence:
                "https://drive.google.com/file/d/15WFPyvQmR7ghAHmYbpbeqQ8M-VtL7skr/view?usp=drivesdk",
        },
    ],
    [
        "myceli|2026-02",
        {
            usd: 3956.396881279,
            evidence:
                "https://drive.google.com/file/d/1015d3U4Trh7D2N-Djsr2cwj6acY6YzBU/view?usp=drivesdk",
        },
    ],
    [
        "myceli|2026-03",
        {
            usd: 4596.531021829,
            evidence:
                "https://drive.google.com/file/d/1ct64L6Jf1EuFsGkpdo0ZYLpJA1ohM69Y/view?usp=drivesdk",
        },
    ],
    [
        "myceli|2026-04",
        {
            usd: 677.07314095,
            evidence:
                "https://drive.google.com/file/d/1zz-RBv4nZrealbFUesWLMF8Gw3zOPuwn/view?usp=drivesdk",
        },
    ],
    [
        "myceli|2026-05",
        {
            usd: 0,
            evidence:
                "https://drive.google.com/file/d/1y757FLhmMNDq3v08cfCrPVihxTfwVl7v/view?usp=drivesdk",
        },
    ],
    [
        "myceli|2026-06",
        {
            usd: 0,
            evidence:
                "https://drive.google.com/file/d/1v6M0tZ2pBGnq6U9HDytAyMmV6muuYJ7-/view?usp=drivesdk",
        },
    ],
    [
        "myceli|2026-07",
        {
            usd: 0,
            evidence:
                "https://drive.google.com/file/d/1M5Gno2k6ohVZG9bYtlf3SZgOugnLPYtH/view?usp=drivesdk",
        },
    ],
    [
        "pollinations|2026-03",
        {
            usd: 0,
            evidence:
                "https://drive.google.com/file/d/1lIn-lwe0DACLgH90G9aPR_xJwC_M4ZCO/view?usp=drivesdk",
        },
    ],
    [
        "pollinations|2026-04",
        {
            usd: 2142.23742953,
            evidence:
                "https://drive.google.com/file/d/1LBeE_H7i-8smXG1Cc9mUBNNmTyjrU59B/view?usp=drivesdk",
        },
    ],
    [
        "pollinations|2026-05",
        {
            usd: 2738.916372579,
            evidence:
                "https://drive.google.com/file/d/1afZRCibaPhfcMdeWkxTBMi2OiKbGSjo0/view?usp=drivesdk",
        },
    ],
    [
        "pollinations|2026-06",
        {
            usd: 7557.674738101,
            evidence:
                "https://drive.google.com/file/d/1PlUxjDTGlAbfv2-oEa-hCaxn01ylvprS/view?usp=drivesdk",
        },
    ],
    [
        "pollinations|2026-07",
        {
            usd: 350.012892852,
            evidence:
                "https://drive.google.com/file/d/1Gx9m2CLkNP9oLvOELHWjQQTf4wq1FxST/view?usp=drivesdk",
        },
    ],
    [
        "neoglyph|2026-05",
        {
            usd: 0,
            evidence:
                "https://drive.google.com/file/d/1a7qUmLBHPtBLC4pud4So6ofFRpouS6o5/view?usp=drivesdk",
        },
    ],
    [
        "neoglyph|2026-06",
        {
            usd: 0,
            evidence:
                "https://drive.google.com/file/d/1QnbyBPVUU-uS0RFtyR-6u9FefOTQgLrx/view?usp=drivesdk",
        },
    ],
    [
        "neoglyph|2026-07",
        {
            usd: 1878.072834928,
            evidence:
                "https://drive.google.com/file/d/1ARasAfI5atTblKmew5T8Ag6a_vhSuX9W/view?usp=drivesdk",
        },
    ],
    [
        "pixelmarket|2026-05",
        {
            usd: 0,
            evidence:
                "https://drive.google.com/file/d/1hOC_OKeDfS7Bhlna_2H049icn74gPkLy/view?usp=drivesdk",
        },
    ],
    [
        "pixelmarket|2026-06",
        {
            usd: 0,
            evidence:
                "https://drive.google.com/file/d/1vy_ZdkXpdJ_U9nJonvTehwxMLi2G_qem/view?usp=drivesdk",
        },
    ],
    [
        "pixelmarket|2026-07",
        {
            usd: 0,
            evidence:
                "https://drive.google.com/file/d/1eoxtzOdEtYJS7lH9pHS--cwW2dbT4JuK/view?usp=drivesdk",
        },
    ],
]);
const ACCOUNT_SNAPSHOT = new Map([
    [
        "myceli",
        "https://drive.google.com/file/d/1SisfnNIlEVtmlTOmVHwjBGLvb7KLDqjB/view?usp=drivesdk",
    ],
    [
        "pollinations",
        "https://drive.google.com/file/d/1XrE8eGk2nu4W1MnpoPSIPxUCyx1l4umZ/view?usp=drivesdk",
    ],
    [
        "neoglyph",
        "https://drive.google.com/file/d/1cMhXasbFrvwb0EZ2sAc5qI2kWBDNIdfG/view?usp=drivesdk",
    ],
    [
        "pixelmarket",
        "https://drive.google.com/file/d/1EKhhPoDlkOVv4rOUHC-SpnhXAX9gQ9a-/view?usp=drivesdk",
    ],
]);
const ACCOUNT_ACTIVE_FROM = new Map([
    ["myceli", "2026-01"],
    ["pollinations", "2026-03"],
    ["neoglyph", "2026-05"],
    ["pixelmarket", "2026-05"],
]);
const LEGACY_MYCELI_ENTRY_BY_MONTH = new Map([
    ["2026-01", "cli:fireworks:inference:2026-01-01 00:00:00::"],
    ["2026-02", "cli:fireworks:inference:2026-02-01 00:00:00::"],
    ["2026-03", "cli:fireworks:inference:2026-03-01 00:00:00::"],
    [
        "2026-04",
        "reconcile:fireworks:inference:2026-04-01 00:00:00:other-account-residual:",
    ],
]);

const rowById = new Map(rows.map((row) => [row.entry_id, row]));
const recordedAt = new Date().toISOString().replace("T", " ").replace("Z", "");
const updates = [];
const reconciliations = [];
const unresolved = [];

for (const [month, entryId] of LEGACY_MYCELI_ENTRY_BY_MONTH) {
    const row = rowById.get(entryId);
    if (!row) {
        if (month === "2026-04") {
            const combined = rowById.get(
                "cli:fireworks:inference:2026-04-01 00:00:00::",
            );
            if (combined) {
                unresolved.push({
                    month,
                    entry_id: combined.entry_id,
                    reason: "staging composite contains both Myceli and Pollinations",
                });
                continue;
            }
        }
        throw new Error(`Missing legacy Fireworks row ${entryId}`);
    }
    const source = MONTHLY_USAGE.get(`myceli|${month}`);
    const ledgerUsd = -(Number(row.credit) + Number(row.paid));
    reconciliations.push({
        month,
        account_id: "myceli",
        provider_api_usd: source.usd,
        ledger_usd: ledgerUsd,
        delta_usd: ledgerUsd - source.usd,
    });
    updates.push({
        ...row,
        base_recorded_at: row.recorded_at,
        account_id: "myceli",
        account_name: ACCOUNT_LABEL.get("myceli"),
        resource_id: `myceli-${month}-account-total`,
        resource_name: "Myceli account usage total",
        resource_sku: "account total",
        resource_count: 1,
        evidence: source.evidence,
        recorded_at: recordedAt,
    });
}

const unassignedNeoglyph = rows.find(
    (row) =>
        row.vendor === "fireworks" &&
        !String(row.account_id ?? "").trim() &&
        String(row.entry_id).includes("elliot-neoglyph"),
);
if (unassignedNeoglyph) {
    updates.push({
        ...unassignedNeoglyph,
        base_recorded_at: unassignedNeoglyph.recorded_at,
        account_id: "neoglyph",
        account_name: ACCOUNT_LABEL.get("neoglyph"),
        recorded_at: recordedAt,
    });
}

const zeroChecks = [
    ["et-fy", "2026-07"],
    ["myceli", "2026-05"],
    ["myceli", "2026-06"],
    ["myceli", "2026-07"],
    ["pollinations", "2026-03"],
    ["neoglyph", "2026-05"],
    ["neoglyph", "2026-06"],
    ["pixelmarket", "2026-05"],
    ["pixelmarket", "2026-06"],
    ["pixelmarket", "2026-07"],
];
for (const [accountId, month] of zeroChecks) {
    const source = MONTHLY_USAGE.get(`${accountId}|${month}`);
    if (source.usd !== 0) throw new Error(`${accountId} ${month} is not zero`);
    const start = `${month}-01 00:00:00`;
    const next = new Date(`${month}-01T00:00:00Z`);
    next.setUTCMonth(next.getUTCMonth() + 1);
    const end = `${next.toISOString().slice(0, 10)} 00:00:00`;
    const resourceId = `${accountId}-verified-zero`;
    const entryId = `cli:fireworks:inference:${start}:${resourceId}:`;
    updates.push({
        entry_id: entryId,
        source: "cli",
        vendor: "fireworks",
        account_id: accountId,
        account_name: ACCOUNT_LABEL.get(accountId),
        type: "inference",
        start,
        end,
        credit: 0,
        paid: 0,
        currency: "USD",
        resource_id: resourceId,
        resource_name: `${ACCOUNT_LABEL.get(accountId)} verified zero`,
        resource_sku: "account total",
        resource_count: 0,
        model: "",
        evidence: source.evidence,
        recorded_at: recordedAt,
    });
}

let reBucketedGrants = 0;
for (const [accountId, activeFrom] of ACCOUNT_ACTIVE_FROM) {
    const entryId = `manual:fireworks:inference:2026-01-01 00:00:00:${accountId}:`;
    const row = rowById.get(entryId);
    if (!row) throw new Error(`Missing Fireworks grant row ${entryId}`);
    const correctedStart = `${activeFrom}-01 00:00:00`;
    if (row.start !== correctedStart) reBucketedGrants += 1;
    updates.push({
        ...row,
        base_recorded_at: row.recorded_at,
        account_id: accountId,
        account_name: ACCOUNT_LABEL.get(accountId),
        start: correctedStart,
        evidence: `${ACCOUNT_SNAPSHOT.get(accountId)} — legacy grant booked in the account's first active month; exact award day unavailable`,
        recorded_at: recordedAt,
    });
}

const duplicateEntryIds =
    updates.length - new Set(updates.map((row) => row.entry_id)).size;
if (duplicateEntryIds !== 0) {
    throw new Error(`Generated ${duplicateEntryIds} duplicate entry IDs`);
}
const existingUpdates = updates.filter((row) => rowById.has(row.entry_id));
const amountMutations = existingUpdates.filter((row) => {
    const source = rowById.get(row.entry_id);
    return source.credit !== row.credit || source.paid !== row.paid;
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
            scope: "Fireworks 2026 provider-account reconciliation",
            proposed_updates: updates.length,
            existing_rows_updated: existingUpdates.length,
            verified_zero_rows_added: updates.length - existingUpdates.length,
            re_bucketed_grants: reBucketedGrants,
            duplicate_entry_ids: duplicateEntryIds,
            amount_mutations: amountMutations,
            reconciliations,
            unresolved,
        },
        null,
        2,
    )}\n`,
);

console.log(
    JSON.stringify({
        proposed_updates: updates.length,
        existing_rows_updated: existingUpdates.length,
        verified_zero_rows_added: updates.length - existingUpdates.length,
        re_bucketed_grants: reBucketedGrants,
        max_absolute_reconciliation_delta_usd: Math.max(
            ...reconciliations.map((row) => Math.abs(row.delta_usd)),
        ),
        amount_mutations: amountMutations,
        unresolved: unresolved.length,
    }),
);
