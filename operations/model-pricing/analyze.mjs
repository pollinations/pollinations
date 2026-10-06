import { createHash } from "node:crypto";

export const TOKEN_FIELDS = {
    promptTextTokens: "prompt",
    completionTextTokens: "completion",
    promptCachedTokens: "input_cache_read",
};

export function rate(value) {
    return ["number", "string"].includes(typeof value) &&
        String(value).trim() !== "" &&
        Number.isFinite(Number(value)) &&
        Number(value) >= 0
        ? Number(value)
        : null;
}

export function openRouterRates(pricing) {
    // Endpoint prices already include public discounts; only add our 5.5% fee.
    // https://openrouter.ai/docs/guides/community/for-providers#discounts-with-discount_to_user
    return Object.fromEntries(
        Object.entries(TOKEN_FIELDS).map(([field, upstream]) => [
            field,
            rate(pricing?.[upstream]) === null
                ? null
                : Number(pricing[upstream]) * 1.055,
        ]),
    );
}

export function azureRates(items, model, sku, region, at) {
    // ponytail: exact GPT base-meter labels only; unknown variants remain unverified.
    const suffix = { GlobalStandard: "Gl", DataZoneStandard: "Dz" }[sku];
    const names = {
        promptTextTokens: "Inp",
        completionTextTokens: "Opt",
        promptCachedTokens: "cd Inp",
    };
    const result = { rates: {}, meters: [], gaps: [] };
    if (!model.startsWith("gpt-") || !suffix)
        return {
            ...result,
            gaps: [
                "Azure retail mapping supports GPT GlobalStandard/DataZoneStandard base meters only",
            ],
        };
    const stem = model.slice(4).replaceAll("-", " ");
    for (const [field, unit] of Object.entries(names)) {
        const expected = [
            `${stem} ${unit} ${suffix}`,
            `${stem} ShortCo ${unit} Std ${suffix}`,
        ].map((s) => s.toLowerCase());
        const matches = items.filter(
            (m) =>
                expected.includes(
                    m.skuName?.toLowerCase().replaceAll("-", " "),
                ) &&
                m.armRegionName === region &&
                m.currencyCode === "USD" &&
                m.type === "Consumption" &&
                m.tierMinimumUnits === 0 &&
                Date.parse(m.effectiveStartDate) <= Date.parse(at),
        );
        const dates = matches.map((m) => Date.parse(m.effectiveStartDate));
        const newest = matches.filter(
            (m) => Date.parse(m.effectiveStartDate) === Math.max(...dates),
        );
        const values = newest.map((m) =>
            rate(m.retailPrice) === null ||
            !["1M", "1K"].includes(m.unitOfMeasure)
                ? null
                : m.retailPrice / (m.unitOfMeasure === "1M" ? 1e6 : 1e3),
        );
        if (
            !values.length ||
            values.some((v) => v === null) ||
            new Set(values).size !== 1
        ) {
            result.gaps.push(
                `No unambiguous current USD retail meter for ${field}`,
            );
            result.rates[field] = null;
        } else {
            result.rates[field] = values[0];
            result.meters.push(
                ...newest.map((m) => ({
                    field,
                    meterId: m.meterId,
                    sku: m.skuName,
                    unit: m.unitOfMeasure,
                    price: m.retailPrice,
                    effectiveStart: m.effectiveStartDate,
                })),
            );
        }
    }
    return result;
}

export function azureLifecycle(model, sku) {
    const entry = model?.skus?.find((s) => s.name === sku);
    const dates = [model?.deprecation?.inference, entry?.deprecationDate]
        .filter((d) => typeof d === "string" && Number.isFinite(Date.parse(d)))
        .sort((a, b) => Date.parse(a) - Date.parse(b));
    return {
        status: model?.lifecycleStatus ?? "unknown",
        retirementDate: dates[0] ?? null,
        skuFound: !!entry,
    };
}

export function standardEndpoint(endpoint) {
    return (
        endpoint.status === 0 &&
        !/(?:^|[\s/:-])(flex|batch|free|priority|fast)(?:$|[\s/:-])/i.test(
            `${endpoint.tag} ${endpoint.name}`,
        )
    );
}

export function pinnedEndpoint(endpoints, options, model) {
    const pin =
        options?.only?.length === 1 && options.allow_fallbacks === false
            ? options.only[0].toLowerCase()
            : null;
    if (!pin) return null;
    const matches = endpoints.filter(
        (e) =>
            (e.tag?.toLowerCase() === pin ||
                e.provider_name?.toLowerCase() === pin) &&
            e.model_id === model &&
            e.status === 0,
    );
    return matches.length === 1 ? matches[0] : null;
}

export function findingsFor(observations, at) {
    const findings = [];
    for (const row of observations) {
        const add = (kind, facts) => {
            const stable = {
                kind,
                model: row.name,
                provider: row.provider,
                route: row.route,
                facts,
            };
            findings.push({
                id: createHash("sha256")
                    .update(
                        JSON.stringify(stable, (_, value) =>
                            value &&
                            typeof value === "object" &&
                            !Array.isArray(value)
                                ? Object.fromEntries(
                                      Object.entries(value).sort(([a], [b]) =>
                                          a.localeCompare(b),
                                      ),
                                  )
                                : value,
                        ),
                    )
                    .digest("hex")
                    .slice(0, 16),
                ...stable,
                evidence: row.evidence,
                limits: row.gaps,
            });
        };
        if (row.exactPrice) {
            const changes = Object.keys(TOKEN_FIELDS)
                .filter(
                    (k) =>
                        rate(row.configuredCost[k]) !== null &&
                        rate(row.observedRates[k]) !== null &&
                        Math.abs(row.configuredCost[k] - row.observedRates[k]) >
                            Math.max(1e-12, row.configuredCost[k] * 1e-6),
                )
                .map((k) => ({
                    unit: k,
                    configured: row.configuredCost[k],
                    providerRate: row.observedRates[k],
                }));
            if (changes.length)
                add("price_review", {
                    changes,
                    basis: row.priceBasis,
                    cashSaving: "unverified",
                });
        }
        const retirement = Date.parse(row.retirementDate);
        if (
            Number.isFinite(retirement) &&
            retirement - Date.parse(at) <= 90 * 86400_000
        )
            add("retirement_review", {
                retirementDate: row.retirementDate,
                lifecycle: row.lifecycle,
            });
        else if (
            row.lifecycle === "Deprecated" ||
            row.lifecycle === "Deprecating"
        )
            add("lifecycle_review", {
                lifecycle: row.lifecycle,
                retirementDate: row.retirementDate,
                deprecationDate: row.deprecationDate,
                providerReplacement: row.providerReplacement,
            });
        if (
            Number.isFinite(retirement) &&
            row.configuredRetirement &&
            new Date(row.configuredRetirement).toISOString().slice(0, 10) !==
                new Date(retirement).toISOString().slice(0, 10)
        )
            add("retirement_metadata_review", {
                configuredDate: new Date(
                    row.configuredRetirement,
                ).toISOString(),
                providerDate: row.retirementDate,
            });
    }
    return findings;
}

export function validateAssessment(text, findings) {
    const parsed = JSON.parse(text);
    const ids = parsed.prioritizedFindingIds;
    if (
        Object.keys(parsed).length !== 1 ||
        !Array.isArray(ids) ||
        ids.length > 5 ||
        new Set(ids).size !== ids.length ||
        ids.some((id) => !findings.some((f) => f.id === id))
    )
        throw new Error(
            "Agent returned unsupported evidence IDs or invalid output",
        );
    return ids;
}

export function agentEvidence(report) {
    const affected = new Set(report.findings.map((f) => f.model));
    const { routes, ...coverageSummary } = report.coverage ?? {};
    return {
        observedAt: report.at,
        scope: report.scope,
        observedRoutes: report.observations.length,
        observationScope:
            "Finding-related routes only; alternative-provider research remains in the full report",
        observations: report.observations
            .filter((r) => affected.has(r.name))
            .map(({ alternatives, ...row }) => row),
        findings: report.findings,
        coverageGaps: report.gaps,
        coverage: coverageSummary,
    };
}

export function coverageFor(inventory, observations, providerScans = []) {
    const routes = inventory.map((m) => {
        const row = observations.find((r) => r.name === m.name);
        const compared = Object.keys(m.cost).filter(
            (k) =>
                row?.exactPrice &&
                rate(m.cost[k]) !== null &&
                rate(row.observedRates[k]) !== null,
        );
        return {
            model: m.name,
            provider: m.provider,
            category: m.category,
            fallbackOnly: m.fallbackOnly,
            fallbacks: m.fallbacks,
            upstream: m.route?.model ?? null,
            scan: !row
                ? "not_scanned"
                : row.catalogMatch
                  ? "model_matched"
                  : "unverified",
            comparedCostFields: compared,
            unverifiedCostFields: Object.keys(m.cost).filter(
                (k) => !compared.includes(k),
            ),
            variantsUnverified: !!Object.keys(m.costVariants ?? {}).length,
            adjustmentsUnverified: !!m.billingAdjustments?.length,
            retirementDate: row?.retirementDate ?? null,
            gaps: row?.gaps ?? ["Missing collector observation"],
        };
    });
    return {
        totalRoutes: inventory.length,
        observations: observations.length,
        allRoutesRepresented: routes.every((r) => r.scan !== "not_scanned"),
        publicModels: inventory.filter((m) => !m.hidden).length,
        fallbackRoutes: inventory.filter((m) => m.fallbackOnly).length,
        fullyVerified: false,
        providers: [...new Set(inventory.map((m) => m.provider))]
            .sort()
            .map((provider) => {
                const own = routes.filter((r) => r.provider === provider);
                return {
                    provider,
                    routes: own.length,
                    categories: [...new Set(own.map((r) => r.category))].sort(),
                    fallbackRoutes: own.filter((r) => r.fallbackOnly).length,
                    routesWithPriceComparisons: own.filter(
                        (r) => r.comparedCostFields.length,
                    ).length,
                    routesWithCatalogMatches: own.filter(
                        (r) => r.scan === "model_matched",
                    ).length,
                    routesWithoutCatalogMatch: own.filter(
                        (r) => r.scan !== "model_matched",
                    ).length,
                    scan: providerScans.find(
                        (s) => s.provider === provider,
                    ) ?? {
                        status: "unavailable",
                        error: "Provider scan missing",
                    },
                };
            }),
        routes,
    };
}
