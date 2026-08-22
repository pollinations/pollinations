import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const economicsDirectory = resolve(scriptDirectory, "../..");
const repositoryDirectory = resolve(economicsDirectory, "../..");
const registry = JSON.parse(
    readFileSync(resolve(economicsDirectory, "provider-registry.json"), "utf8"),
);
const reconciliation = JSON.parse(
    readFileSync(
        resolve(economicsDirectory, "provider-reconciliation.json"),
        "utf8",
    ),
);

const errors = [];
const providerByName = new Map();
const meteringBases = new Set([
    "direct",
    "capacity",
    "mixed",
    "internal",
    "not_applicable",
]);
for (const provider of registry.providers) {
    if (!meteringBases.has(provider.meteringBasis)) {
        errors.push(
            `Provider ${provider.id} has invalid meteringBasis ${provider.meteringBasis ?? "missing"}`,
        );
    }
    for (const rawName of [provider.id, ...provider.aliases]) {
        const name = rawName.trim().toLowerCase();
        if (providerByName.has(name)) {
            errors.push(
                `Provider name ${name} belongs to both ${providerByName.get(name).id} and ${provider.id}`,
            );
        } else {
            providerByName.set(name, provider);
        }
    }

    const accountIds = new Set();
    for (const account of provider.accounts ?? []) {
        if (accountIds.has(account.id)) {
            errors.push(
                `Provider ${provider.id} repeats account ID ${account.id}`,
            );
        }
        accountIds.add(account.id);
        if (!/^\d{4}-\d{2}$/.test(account.activeFrom)) {
            errors.push(
                `Provider ${provider.id} account ${account.id} has invalid activeFrom`,
            );
        }
        if (
            account.activeTo != null &&
            (!/^\d{4}-\d{2}$/.test(account.activeTo) ||
                account.activeTo < account.activeFrom)
        ) {
            errors.push(
                `Provider ${provider.id} account ${account.id} has invalid activeTo`,
            );
        }
    }

    if (provider.monthlyReview) {
        const connectorPath = resolve(
            economicsDirectory,
            "ingest/connectors",
            `${provider.connector}.md`,
        );
        if (!provider.connector || !existsSync(connectorPath)) {
            errors.push(
                `Monthly provider ${provider.id} has no connector procedure`,
            );
        }
        if (
            provider.meteringBasis !== "internal" &&
            !(registry.auditTargets ?? []).some(
                (target) => target.provider === provider.id,
            )
        ) {
            errors.push(
                `Monthly provider ${provider.id} has no dashboard audit URL`,
            );
        }
    }
}

for (const target of registry.auditTargets ?? []) {
    const providerId = target.provider;
    if (providerByName.get(providerId)?.id !== providerId) {
        errors.push(`Dashboard audit URL ${providerId} is not canonical`);
    }
    try {
        if (new URL(target.url).protocol !== "https:") {
            errors.push(`Dashboard audit URL ${providerId} is not HTTPS`);
        }
    } catch {
        errors.push(`Dashboard audit URL ${providerId} is invalid`);
    }
    if (target.loginEmail == null && !target.pending) {
        errors.push(`Dashboard audit target ${providerId} has no login email`);
    }
    if (
        target.loginEmail != null &&
        !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(target.loginEmail)
    ) {
        errors.push(
            `Dashboard audit target ${providerId} has an invalid login email`,
        );
    }
    if (target.accountId != null) {
        const accountIds = new Set(
            (providerByName.get(providerId)?.accounts ?? []).map(
                (account) => account.id,
            ),
        );
        if (!accountIds.has(target.accountId)) {
            errors.push(
                `Dashboard audit target ${providerId} has unknown account ${target.accountId}`,
            );
        }
    }
}

for (const provider of registry.providers) {
    const targets = (registry.auditTargets ?? []).filter(
        (target) => target.provider === provider.id,
    );
    for (const account of provider.accounts ?? []) {
        if (!targets.some((target) => target.accountId === account.id)) {
            errors.push(
                `Provider ${provider.id} account ${account.id} has no dashboard audit target`,
            );
        }
    }
}

const auditTargetKeys = new Set();
for (const target of registry.auditTargets ?? []) {
    const key = `${target.provider}|${target.accountId ?? ""}|${target.url}`;
    if (auditTargetKeys.has(key)) {
        errors.push(`Duplicate dashboard audit target ${key}`);
    }
    auditTargetKeys.add(key);
}

const providerCheckKeys = new Set();
for (const explanation of reconciliation.providerCheckExplanations ?? []) {
    const key = `${explanation.month}|${explanation.provider}`;
    if (providerCheckKeys.has(key)) {
        errors.push(`Duplicate provider check explanation ${key}`);
    }
    providerCheckKeys.add(key);
    if (!/^\d{4}-\d{2}$/.test(explanation.month)) {
        errors.push(`Provider check explanation ${key} has an invalid month`);
    }
    if (providerByName.get(explanation.provider)?.id !== explanation.provider) {
        errors.push(
            `Provider check explanation ${key} does not use a canonical provider`,
        );
    }
    if (
        !Array.isArray(explanation.evidence) ||
        explanation.evidence.length === 0 ||
        explanation.evidence.some(
            (url) => !String(url).startsWith("https://drive.google.com/"),
        )
    ) {
        errors.push(
            `Provider check explanation ${key} lacks archived Drive evidence`,
        );
    }
}

const meterDriftKeys = new Set();
for (const explanation of reconciliation.meterDriftExplanations ?? []) {
    const key = `${explanation.month}|${explanation.provider}`;
    if (meterDriftKeys.has(key)) {
        errors.push(`Duplicate meter drift explanation ${key}`);
    }
    meterDriftKeys.add(key);
    if (!/^\d{4}-\d{2}$/.test(explanation.month)) {
        errors.push(`Meter drift explanation ${key} has an invalid month`);
    }
    if (providerByName.get(explanation.provider)?.id !== explanation.provider) {
        errors.push(
            `Meter drift explanation ${key} does not use a canonical provider`,
        );
    }
    if (
        !Array.isArray(explanation.evidence) ||
        explanation.evidence.length === 0 ||
        explanation.evidence.some(
            (url) => !String(url).startsWith("https://drive.google.com/"),
        )
    ) {
        errors.push(
            `Meter drift explanation ${key} lacks archived Drive evidence`,
        );
    }
}

const runtimeProviders = new Set();
const registryDirectory = resolve(repositoryDirectory, "shared/registry");
for (const filename of readdirSync(registryDirectory)) {
    if (!filename.endsWith(".ts")) continue;
    const source = readFileSync(resolve(registryDirectory, filename), "utf8");
    for (const match of source.matchAll(/\bprovider:\s*["']([^"']+)["']/g)) {
        runtimeProviders.add(match[1].trim().toLowerCase());
    }
}

const missingRuntimeMappings = [...runtimeProviders]
    .filter((provider) => !providerByName.has(provider))
    .sort();
for (const provider of missingRuntimeMappings) {
    errors.push(`Runtime provider ${provider} is missing from the registry`);
}

const result = {
    registry_version: registry.version,
    providers: registry.providers.length,
    monthly_review_providers: registry.providers.filter(
        (provider) => provider.monthlyReview,
    ).length,
    declared_accounts: registry.providers.reduce(
        (sum, provider) => sum + (provider.accounts ?? []).length,
        0,
    ),
    dashboard_audit_targets: (registry.auditTargets ?? []).length,
    dashboard_audit_urls: new Set(
        (registry.auditTargets ?? []).map((target) => target.url),
    ).size,
    reviewed_provider_gaps: providerCheckKeys.size,
    explained_meter_drifts: meterDriftKeys.size,
    metering_bases: Object.fromEntries(
        [...meteringBases].map((basis) => [
            basis,
            registry.providers.filter(
                (provider) => provider.meteringBasis === basis,
            ).length,
        ]),
    ),
    runtime_provider_values: [...runtimeProviders].sort(),
    missing_runtime_mappings: missingRuntimeMappings,
    errors,
};

console.log(JSON.stringify(result, null, 2));
if (errors.length > 0) process.exitCode = 1;
