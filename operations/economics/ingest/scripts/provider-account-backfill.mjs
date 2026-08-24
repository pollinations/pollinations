import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const economicsDirectory = resolve(scriptDirectory, "../..");
const registryPath = resolve(economicsDirectory, "provider-registry.json");

const [snapshotPathArgument, outputBaseArgument] = process.argv.slice(2);
if (!snapshotPathArgument || !outputBaseArgument) {
    throw new Error(
        "Usage: node provider-account-backfill.mjs <op-cloud-snapshot.json> <output-base>",
    );
}

const snapshotPath = resolve(snapshotPathArgument);
const outputBase = resolve(outputBaseArgument);
const snapshot = JSON.parse(readFileSync(snapshotPath, "utf8"));
const rows = Array.isArray(snapshot) ? snapshot : snapshot.data;
if (!Array.isArray(rows)) throw new Error("Snapshot has no data array");

const registry = JSON.parse(readFileSync(registryPath, "utf8"));
const providers = new Map(
    registry.providers.map((provider) => [provider.id, provider]),
);
const multiAccountProviders = new Set(
    registry.providers
        .filter((provider) => (provider.accounts ?? []).length > 1)
        .map((provider) => provider.id),
);

const CLOUDFLARE_MYCELI_INVOICES = [
    "IN-58053737",
    "IN-60464669",
    "IN-63073488",
    "IN-63780544",
    "IN-65987825",
    "IN-69076483",
    "IN-72457945",
];
const CLOUDFLARE_POLLINATIONS_INVOICES = [
    "IN-54966851",
    "IN-57102048",
    "IN-59371430",
    "IN-61954991",
    "IN-63778469",
    "IN-63782414",
    "IN-66683483",
    "IN-67150086",
];

function rowText(row) {
    return [
        row.entry_id,
        row.resource_id,
        row.resource_name,
        row.resource_sku,
        row.evidence,
    ]
        .join(" ")
        .toLowerCase();
}

function containsAny(text, values) {
    return values.some((value) => text.includes(value.toLowerCase()));
}

function classifyCloudflare(row) {
    const identity = [
        row.entry_id,
        row.resource_id,
        row.resource_name,
        row.resource_sku,
    ]
        .join(" ")
        .toLowerCase();
    const text = rowText(row);

    // A composite reconciliation note can mention invoices from both
    // accounts. The row's own invoice/resource identity is authoritative.
    if (containsAny(identity, CLOUDFLARE_POLLINATIONS_INVOICES)) {
        return "pollinations";
    }
    if (containsAny(identity, CLOUDFLARE_MYCELI_INVOICES)) {
        return "myceli";
    }
    if (
        text.includes("1lqfr-gyc7udtqczrn-amxeqotadyc1az") ||
        text.includes("15qwvihjpysh0x7gnhdam36zs9fugnhz4") ||
        text.includes("myceli account") ||
        row.entry_id ===
            "manual:cloudflare:infra:2026-02-01 00:00:00:startup program:" ||
        row.entry_id === "manual:cloudflare:infra:2026-06-01 00:00:00::"
    ) {
        return "myceli";
    }
    if (
        text.includes("15vequkkqin0jmjkty89eohzkzmhzs62e") ||
        text.includes("billing-history-pollinations")
    ) {
        return "pollinations";
    }
    const mentionsMyceliInvoice = containsAny(text, CLOUDFLARE_MYCELI_INVOICES);
    const mentionsPollinationsInvoice = containsAny(
        text,
        CLOUDFLARE_POLLINATIONS_INVOICES,
    );
    if (mentionsMyceliInvoice !== mentionsPollinationsInvoice) {
        return mentionsMyceliInvoice ? "myceli" : "pollinations";
    }
    return null;
}

function classifyFireworks(row) {
    const resourceId = (row.resource_id ?? "").toLowerCase();
    const resourceName = (row.resource_name ?? "").toLowerCase();
    const entryId = (row.entry_id ?? "").toLowerCase();
    for (const accountId of [
        "pollinations",
        "neoglyph",
        "myceli",
        "pixelmarket",
    ]) {
        if (
            resourceId === accountId ||
            resourceId.startsWith(`${accountId}:`) ||
            resourceId.startsWith(`${accountId}-verified-zero`) ||
            resourceName === accountId ||
            resourceName.startsWith(`${accountId} `) ||
            entryId.includes(`:${accountId}:`) ||
            entryId.includes(`:${accountId}-verified-zero:`)
        ) {
            return accountId;
        }
    }
    return null;
}

function classifyOpenRouter(row) {
    const text = rowText(row);
    const resourceId = (row.resource_id ?? "").toLowerCase();
    const resourceName = (row.resource_name ?? "").toLowerCase();
    if (
        resourceId === "org_3gfngbofrzzuusbtcluw3nf42es" ||
        resourceId.startsWith("pollinations:") ||
        resourceName.startsWith("pollinationsai") ||
        text.includes(":pollinationsai")
    ) {
        return "pollinations";
    }
    if (
        resourceId.startsWith("myceli:") ||
        resourceName.startsWith("myceli.ai") ||
        text.includes("1lhfdtk1djhwp98pw6knubxwlkun-poku") ||
        text.includes("1f1k1kjbfhns3vif5znchsvzuvg3yiiw5") ||
        row.entry_id === "manual:openrouter:inference:2026-05-01 00:00:00::-2"
    ) {
        return "myceli";
    }
    return null;
}

function classifyAccount(row) {
    const existing = (row.account_id ?? "").trim().toLowerCase();
    if (existing) return existing;
    if (row.vendor === "cloudflare") return classifyCloudflare(row);
    if (row.vendor === "fireworks") return classifyFireworks(row);
    if (row.vendor === "modal") return "myceli-ai";
    if (row.vendor === "openrouter") return classifyOpenRouter(row);
    return null;
}

const recordedAt = new Date().toISOString().replace("T", " ").replace("Z", "");
const updates = [];
const unassigned = [];
const counts = {};

for (const row of rows) {
    if (!String(row.start ?? "").startsWith("2026")) continue;
    if (!multiAccountProviders.has(row.vendor)) continue;

    const provider = providers.get(row.vendor);
    const declaredAccounts = new Map(
        (provider.accounts ?? []).map((account) => [account.id, account]),
    );
    const accountId = classifyAccount(row);
    counts[row.vendor] ??= { rows: 0, assigned: 0, unassigned: 0 };
    counts[row.vendor].rows += 1;

    if (!accountId || !declaredAccounts.has(accountId)) {
        counts[row.vendor].unassigned += 1;
        unassigned.push({
            provider: row.vendor,
            month: String(row.start).slice(0, 7),
            entry_id: row.entry_id,
            resource_id: row.resource_id,
            resource_name: row.resource_name,
            evidence: row.evidence,
        });
        continue;
    }

    counts[row.vendor].assigned += 1;
    const account = declaredAccounts.get(accountId);
    if (row.account_id === accountId && row.account_name === account.label) {
        continue;
    }
    updates.push({
        ...row,
        base_recorded_at: row.recorded_at,
        account_id: accountId,
        account_name: account.label,
        recorded_at: recordedAt,
    });
}

const duplicateEntryIds =
    updates.length - new Set(updates.map((row) => row.entry_id)).size;
if (duplicateEntryIds !== 0) {
    throw new Error(`Generated ${duplicateEntryIds} duplicate entry IDs`);
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
            scope: "2026 multi-account OP Cloud rows",
            counts,
            proposed_updates: updates.length,
            duplicate_entry_ids: duplicateEntryIds,
            unassigned,
        },
        null,
        2,
    )}\n`,
);

console.log(
    JSON.stringify({
        proposed_updates: updates.length,
        unassigned: unassigned.length,
        counts,
    }),
);
