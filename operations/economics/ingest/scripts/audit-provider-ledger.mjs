import {
    existsSync,
    readdirSync,
    readFileSync,
    statSync,
    writeFileSync,
} from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadPrivateReconciliation } from "./private-config.mjs";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const economicsDirectory = resolve(scriptDirectory, "../..");
const snapshotDirectory = resolve(
    economicsDirectory,
    "ingest/data/reconcile/snapshots",
);
const registry = JSON.parse(
    readFileSync(resolve(economicsDirectory, "provider-registry.json"), "utf8"),
);
const reconciliation = await loadPrivateReconciliation();

const argumentsByName = new Map(
    process.argv
        .slice(2)
        .map((argument) => argument.match(/^--([^=]+)=(.+)$/))
        .filter(Boolean)
        .map((match) => [match[1], match[2]]),
);

function latestSnapshot(kind) {
    if (!existsSync(snapshotDirectory)) {
        throw new Error(
            `Snapshot directory does not exist: ${snapshotDirectory}`,
        );
    }
    const marker = `-production-op-${kind}`;
    const matches = readdirSync(snapshotDirectory)
        .filter(
            (filename) =>
                filename.includes(marker) && filename.endsWith(".json"),
        )
        .map((filename) => ({
            path: resolve(snapshotDirectory, filename),
            modified: statSync(resolve(snapshotDirectory, filename)).mtimeMs,
        }))
        .sort((a, b) => b.modified - a.modified);
    if (!matches[0]) throw new Error(`No production op-${kind} snapshot found`);
    return matches[0].path;
}

function snapshotPath(argumentName, kind) {
    const supplied = argumentsByName.get(argumentName);
    return supplied ? resolve(supplied) : latestSnapshot(kind);
}

function readRows(path) {
    const payload = JSON.parse(readFileSync(path, "utf8"));
    const rows = Array.isArray(payload) ? payload : payload.data;
    if (!Array.isArray(rows)) throw new Error(`${path} has no data array`);
    return rows;
}

function previousMonth() {
    const now = new Date();
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1))
        .toISOString()
        .slice(0, 7);
}

const from = argumentsByName.get("from") ?? "2026-01";
const through = argumentsByName.get("through") ?? previousMonth();
if (!/^\d{4}-\d{2}$/.test(from) || !/^\d{4}-\d{2}$/.test(through)) {
    throw new Error("--from and --through must use YYYY-MM");
}
if (from > through) throw new Error("--from must not be after --through");

const paths = {
    cloud: snapshotPath("cloud", "cloud"),
    pollen: snapshotPath("pollen", "pollen"),
    transactions: snapshotPath("transactions", "transactions"),
};
const inScope = (month) => month >= from && month <= through;
const allCloud = readRows(paths.cloud);
const cloud = allCloud.filter((row) => inScope(String(row.start).slice(0, 7)));
const pollen = readRows(paths.pollen).filter((row) =>
    inScope(String(row.month).slice(0, 7)),
);
const transactions = readRows(paths.transactions).filter((row) =>
    inScope(String(row.date).slice(0, 7)),
);

const providerByName = new Map();
for (const provider of registry.providers) {
    for (const name of [provider.id, ...provider.aliases]) {
        providerByName.set(name.trim().toLowerCase(), provider);
    }
}
const normalize = (value) =>
    String(value ?? "")
        .trim()
        .toLowerCase();
const definitionFor = (value) => providerByName.get(normalize(value));
const canonical = (value) => definitionFor(value)?.id ?? normalize(value);
const providerMonth = (month, provider) => `${month}|${canonical(provider)}`;
const splitProviderMonth = (key) => {
    const separator = key.indexOf("|");
    return {
        month: key.slice(0, separator),
        provider: key.slice(separator + 1),
    };
};
const pollenExplanationByKey = new Map();
for (const explanation of reconciliation.pollenWitnessExplanations) {
    if (!definitionFor(explanation.provider)) {
        throw new Error(
            `Unknown reconciliation provider: ${explanation.provider}`,
        );
    }
    const key = providerMonth(explanation.month, explanation.provider);
    if (pollenExplanationByKey.has(key)) {
        throw new Error(`Duplicate Pollen witness explanation: ${key}`);
    }
    pollenExplanationByKey.set(key, explanation);
}
const amount = (value) => Number(value) || 0;
const pureFunding = (row) => amount(row.credit) > 0 && amount(row.paid) === 0;
const financialActivity = (row) =>
    Math.abs(amount(row.credit)) + Math.abs(amount(row.paid)) > 0.0001;

function nextMonth(month) {
    const date = new Date(`${month}-01T00:00:00Z`);
    date.setUTCMonth(date.getUTCMonth() + 1);
    return date.toISOString().slice(0, 7);
}

function overlapsMonth(row, month) {
    const start = String(row.start ?? "").slice(0, 19);
    if (!start) return false;
    const end = String(row.end ?? "").slice(0, 19);
    if (!end) return start.slice(0, 7) === month;
    return (
        start < `${nextMonth(month)}-01 00:00:00` &&
        end > `${month}-01 00:00:00`
    );
}

function hasArchivedEvidence(evidence) {
    const candidates =
        String(evidence ?? "").match(
            /https:\/\/(?:drive|docs)\.google\.com\/[^\s<>"']+/giu,
        ) ?? [];
    return candidates.some((candidate) => {
        try {
            const url = new URL(candidate.replace(/[),.;\]}]+$/u, ""));
            return (
                url.hostname === "drive.google.com" ||
                url.hostname === "docs.google.com"
            );
        } catch {
            return false;
        }
    });
}

function hasSourceLink(evidence) {
    const candidates =
        String(evidence ?? "").match(/https?:\/\/[^\s<>"']+/giu) ?? [];
    return candidates.some((candidate) => {
        try {
            new URL(candidate.replace(/[),.;\]}]+$/u, ""));
            return true;
        } catch {
            return false;
        }
    });
}

const cloudWitnessRows = cloud.filter(
    (row) => row.type !== "balance" && !pureFunding(row),
);
const activePollenRows = pollen.filter(
    (row) =>
        amount(row.cost_paid) +
            amount(row.cost_quests) +
            amount(row.requests_paid) +
            amount(row.requests_quests) >
        0,
);
const providerCloudRows = new Map();
for (const row of cloudWitnessRows) {
    const key = providerMonth(String(row.start).slice(0, 7), row.vendor);
    const rows = providerCloudRows.get(key) ?? [];
    rows.push(row);
    providerCloudRows.set(key, rows);
}
const pollenKeys = new Set(
    activePollenRows.map((row) => providerMonth(row.month, row.vendor)),
);
const modelCloudKeys = new Set(
    cloudWitnessRows
        .filter((row) => row.type !== "infra" && financialActivity(row))
        .map((row) => providerMonth(String(row.start).slice(0, 7), row.vendor)),
);

const observedRawNames = [
    ...cloud.map((row) => row.vendor),
    ...activePollenRows.map((row) => row.vendor),
    ...transactions
        .filter((row) => row.category === "cloud")
        .map((row) => row.vendor),
].map(normalize);
const rawProviderValues = [...new Set(observedRawNames)].sort();
const missingMappings = rawProviderValues.filter(
    (provider) => !definitionFor(provider),
);
const aliasesObserved = rawProviderValues
    .map((raw) => ({ raw, canonical: canonical(raw) }))
    .filter((mapping) => mapping.raw !== mapping.canonical);

const sourceEvidenceGaps = [...providerCloudRows]
    .filter(
        ([, rows]) => !rows.some((row) => String(row.evidence ?? "").trim()),
    )
    .map(([key, rows]) => ({
        ...splitProviderMonth(key),
        rows: rows.length,
        local_evidence_rows: rows.filter((row) =>
            String(row.evidence ?? "").trim(),
        ).length,
    }))
    .sort(
        (a, b) =>
            a.month.localeCompare(b.month) ||
            a.provider.localeCompare(b.provider),
    );
const sourceLinkedProviderMonths = [...providerCloudRows].filter(
    ([, rows]) =>
        !rows.some((row) => hasArchivedEvidence(row.evidence)) &&
        rows.some((row) => hasSourceLink(row.evidence)),
).length;

const knownExternalProviders = new Set([
    ...registry.providers
        .filter((provider) => provider.monthlyReview)
        .map((provider) => provider.id),
    ...cloudWitnessRows.map((row) => canonical(row.vendor)),
]);
const missingCloudWitnesses = [...pollenKeys]
    .filter((key) => {
        const { provider } = splitProviderMonth(key);
        if (definitionFor(provider)?.meteringBasis === "internal") return false;
        return (
            knownExternalProviders.has(provider) && !providerCloudRows.has(key)
        );
    })
    .map(splitProviderMonth)
    .sort(
        (a, b) =>
            a.month.localeCompare(b.month) ||
            a.provider.localeCompare(b.provider),
    );
const missingPollenWitnesses = [...modelCloudKeys]
    .filter((key) => !pollenKeys.has(key))
    .map(splitProviderMonth)
    .sort(
        (a, b) =>
            a.month.localeCompare(b.month) ||
            a.provider.localeCompare(b.provider),
    );
const explainedPollenWitnesses = missingPollenWitnesses
    .map((witness) => ({
        ...witness,
        ...pollenExplanationByKey.get(
            providerMonth(witness.month, witness.provider),
        ),
    }))
    .filter((witness) => witness.reason != null);
const unresolvedPollenWitnesses = missingPollenWitnesses.filter(
    (witness) =>
        !pollenExplanationByKey.has(
            providerMonth(witness.month, witness.provider),
        ),
);
const missingPollenKeys = new Set(
    missingPollenWitnesses.map((witness) =>
        providerMonth(witness.month, witness.provider),
    ),
);
const stalePollenWitnessExplanations = reconciliation.pollenWitnessExplanations
    .filter(
        (explanation) =>
            inScope(explanation.month) &&
            !missingPollenKeys.has(
                providerMonth(explanation.month, explanation.provider),
            ),
    )
    .sort(
        (a, b) =>
            a.month.localeCompare(b.month) ||
            a.provider.localeCompare(b.provider),
    );

const months = [];
for (let cursor = `${from}-01`; cursor.slice(0, 7) <= through; ) {
    months.push(cursor.slice(0, 7));
    const date = new Date(`${cursor}T00:00:00Z`);
    date.setUTCMonth(date.getUTCMonth() + 1);
    cursor = date.toISOString().slice(0, 10);
}
const accountChecks = [];
for (const provider of registry.providers) {
    for (const account of provider.accounts ?? []) {
        for (const month of months) {
            if (
                month < account.activeFrom ||
                (account.activeTo != null && month > account.activeTo)
            ) {
                continue;
            }
            const activeAccounts = (provider.accounts ?? []).filter(
                (candidate) =>
                    month >= candidate.activeFrom &&
                    (candidate.activeTo == null || month <= candidate.activeTo),
            );
            const rows = allCloud.filter(
                (row) =>
                    canonical(row.vendor) === provider.id &&
                    overlapsMonth(row, month) &&
                    (normalize(row.account_id) === account.id ||
                        (!normalize(row.account_id) &&
                            activeAccounts.length === 1)),
            );
            accountChecks.push({
                month,
                provider: provider.id,
                account_id: account.id,
                status: rows.some((row) => hasArchivedEvidence(row.evidence))
                    ? "archived"
                    : rows.some((row) => hasSourceLink(row.evidence))
                      ? "source linked"
                      : rows.some((row) => String(row.evidence ?? "").trim())
                        ? "noted"
                        : "absent",
            });
        }
    }
}
const missingAccountChecks = accountChecks.filter(
    (check) => check.status === "absent",
);
const accountProviders = new Set(
    registry.providers
        .filter((provider) => (provider.accounts ?? []).length > 0)
        .map((provider) => provider.id),
);
const unassignedAccountRows = cloudWitnessRows
    .filter(
        (row) =>
            accountProviders.has(canonical(row.vendor)) &&
            !normalize(row.account_id) &&
            (definitionFor(row.vendor)?.accounts ?? []).filter(
                (account) =>
                    String(row.start).slice(0, 7) >= account.activeFrom &&
                    (account.activeTo == null ||
                        String(row.start).slice(0, 7) <= account.activeTo),
            ).length > 1 &&
            (financialActivity(row) || String(row.evidence ?? "").trim()),
    )
    .map((row) => ({
        month: String(row.start).slice(0, 7),
        provider: canonical(row.vendor),
        entry_id: row.entry_id,
    }))
    .sort(
        (a, b) =>
            a.month.localeCompare(b.month) ||
            a.provider.localeCompare(b.provider),
    );

const modelRowsWithoutIdentity = cloudWitnessRows
    .filter(
        (row) =>
            row.type !== "infra" &&
            financialActivity(row) &&
            ![row.model, row.resource_id, row.resource_name].some((value) =>
                String(value ?? "").trim(),
            ),
    )
    .map((row) => ({
        month: String(row.start).slice(0, 7),
        provider: canonical(row.vendor),
        entry_id: row.entry_id,
    }))
    .sort(
        (a, b) =>
            a.month.localeCompare(b.month) ||
            a.provider.localeCompare(b.provider),
    );

const providerMonths = new Set([...providerCloudRows.keys(), ...pollenKeys]);
const archivedProviderMonths = [...providerCloudRows].filter(([, rows]) =>
    rows.some((row) => hasArchivedEvidence(row.evidence)),
).length;
const report = {
    generated_at: new Date().toISOString(),
    scope: { from, through },
    source_snapshots: paths,
    summary: {
        registry_providers: registry.providers.length,
        raw_provider_values: rawProviderValues.length,
        canonical_observed_providers: new Set(rawProviderValues.map(canonical))
            .size,
        missing_mappings: missingMappings.length,
        observed_provider_months: providerMonths.size,
        archived_provider_months: archivedProviderMonths,
        source_linked_provider_months: sourceLinkedProviderMonths,
        provider_month_evidence_gaps: sourceEvidenceGaps.length,
        missing_cloud_witnesses: missingCloudWitnesses.length,
        missing_pollen_witnesses: missingPollenWitnesses.length,
        explained_pollen_witnesses: explainedPollenWitnesses.length,
        unresolved_pollen_witnesses: unresolvedPollenWitnesses.length,
        stale_pollen_witness_explanations:
            stalePollenWitnessExplanations.length,
        account_checks_expected: accountChecks.length,
        account_checks_archived: accountChecks.filter(
            (check) => check.status === "archived",
        ).length,
        account_checks_source_linked: accountChecks.filter(
            (check) => check.status === "source linked",
        ).length,
        account_checks_noted: accountChecks.filter(
            (check) => check.status === "noted",
        ).length,
        account_checks_missing: missingAccountChecks.length,
        unassigned_account_rows: unassignedAccountRows.length,
        model_rows_without_identity: modelRowsWithoutIdentity.length,
    },
    missing_mappings: missingMappings,
    aliases_observed: aliasesObserved,
    provider_month_evidence_gaps: sourceEvidenceGaps,
    missing_cloud_witnesses: missingCloudWitnesses,
    missing_pollen_witnesses: missingPollenWitnesses,
    explained_pollen_witnesses: explainedPollenWitnesses,
    unresolved_pollen_witnesses: unresolvedPollenWitnesses,
    stale_pollen_witness_explanations: stalePollenWitnessExplanations,
    missing_account_checks: missingAccountChecks,
    unassigned_account_rows: unassignedAccountRows,
    model_rows_without_identity: modelRowsWithoutIdentity,
};

const outputPath = argumentsByName.get("output");
if (outputPath) {
    writeFileSync(resolve(outputPath), `${JSON.stringify(report, null, 2)}\n`);
}
console.log(JSON.stringify(report, null, 2));
if (missingMappings.length > 0) process.exitCode = 1;
