import { describe, expect, it } from "vitest";
import type { Data, OpCloudRow, OpPollenRow, OpTransactionRow } from "../types";
import {
    activeProviderAccounts,
    canonicalProvider,
    collectProviderObservations,
    METER_DRIFT_EXPLANATIONS,
    meterDriftExplanation,
    missingProviderMappings,
    normalizeProviderName,
    POLLEN_WITNESS_EXPLANATIONS,
    PROVIDER_AUDIT_TARGETS,
    PROVIDER_CHECK_EXPLANATIONS,
    PROVIDER_REGISTRY,
    pollenWitnessExplanation,
    providerAuditTargets,
    providerAuditUrl,
    providerCheckExplanation,
    providerMeteringBasis,
    providerReviewRows,
    resolveProvider,
} from "./providerRegistry";

const transaction = (
    overrides: Partial<OpTransactionRow> = {},
): OpTransactionRow => ({
    entry_id: "wise-test",
    kind: "transaction",
    source: "wise",
    date: "2026-07-10",
    vendor: "aws",
    category: "cloud",
    amount: -10,
    currency: "USD",
    description: "",
    evidence: "",
    recorded_at: "2026-08-01 00:00:00",
    ...overrides,
});

const cloud = (overrides: Partial<OpCloudRow> = {}): OpCloudRow => ({
    entry_id: "cloud-test",
    source: "api",
    vendor: "aws",
    type: "inference",
    start: "2026-07-01 00:00:00",
    end: "2026-08-01 00:00:00",
    credit: 0,
    paid: -10,
    currency: "USD",
    resource_id: "",
    resource_name: "",
    resource_sku: "",
    resource_count: 1,
    model: "",
    evidence:
        "https://drive.google.com/file/d/provider-statement/view?usp=drivesdk",
    recorded_at: "2026-08-01 00:00:00",
    ...overrides,
});

const pollen = (overrides: Partial<OpPollenRow> = {}): OpPollenRow => ({
    source: "tinybird",
    month: "2026-07",
    vendor: "bedrock",
    model: "claude",
    currency: "POLLEN",
    cost_paid: 10,
    cost_quests: 0,
    price_paid: 10,
    price_quests: 0,
    byop_paid: 0,
    byop_quests: 0,
    model_paid: 0,
    model_quests: 0,
    requests_paid: 1,
    requests_quests: 0,
    ...overrides,
});

const data = (overrides: Partial<Data> = {}): Data => ({
    opTransactions: [],
    opCloud: [],
    opPollen: [],
    opForecast: [],
    ...overrides,
});

describe("provider registry", () => {
    it("keeps every canonical ID and alias unique", () => {
        const names = PROVIDER_REGISTRY.flatMap((provider) => [
            provider.id,
            ...provider.aliases,
        ]).map(normalizeProviderName);

        expect(new Set(names).size).toBe(names.length);
    });

    it("classifies every provider by how its bill should reconcile to Pollen", () => {
        const allowed = new Set([
            "direct",
            "capacity",
            "mixed",
            "internal",
            "not_applicable",
        ]);
        for (const provider of PROVIDER_REGISTRY) {
            expect(allowed.has(provider.meteringBasis)).toBe(true);
        }

        expect(providerMeteringBasis("perplexity")).toBe("direct");
        expect(providerMeteringBasis("lambda")).toBe("capacity");
        expect(providerMeteringBasis("bedrock")).toBe("mixed");
        expect(providerMeteringBasis("inferenceport")).toBe("internal");
        expect(() => providerMeteringBasis("new-provider")).toThrow(
            'Vendor "new-provider" has no reviewed metering basis',
        );
    });

    it("resolves manually approved aliases and leaves unknown names visible", () => {
        expect(resolveProvider(" BedRock ")?.id).toBe("aws");
        expect(canonicalProvider("aws-bedrock")).toBe("aws");
        expect(canonicalProvider("azure-2")).toBe("azure");
        expect(canonicalProvider("vastai")).toBe("vast.ai");
        expect(canonicalProvider("New-Provider")).toBe("new-provider");
        expect(resolveProvider("new-provider")).toBeUndefined();
    });

    it("keeps account IDs unique within a provider and applies lifecycle months", () => {
        for (const provider of PROVIDER_REGISTRY) {
            const accountIds = (provider.accounts ?? []).map(
                (account) => account.id,
            );
            expect(new Set(accountIds).size).toBe(accountIds.length);
        }

        const cloudflare = resolveProvider("cloudflare");
        expect(cloudflare).toBeDefined();
        if (!cloudflare) throw new Error("Cloudflare is not registered");
        expect(
            activeProviderAccounts(cloudflare, "2026-06").map(
                (account) => account.id,
            ),
        ).toEqual(["pollinations", "myceli"]);
        expect(
            activeProviderAccounts(cloudflare, "2026-07").map(
                (account) => account.id,
            ),
        ).toEqual(["myceli"]);
    });

    it("keeps audit dashboards canonical and available for external monthly vendors", () => {
        for (const target of PROVIDER_AUDIT_TARGETS) {
            expect(resolveProvider(target.provider)?.id).toBe(target.provider);
            expect(new URL(target.url).protocol).toBe("https:");
            if (!target.pending) expect(target.loginEmail).toContain("@");
        }

        for (const provider of PROVIDER_REGISTRY) {
            if (
                provider.monthlyReview &&
                provider.meteringBasis !== "internal"
            ) {
                expect(providerAuditUrl(provider.id)).not.toBeNull();
            }
        }

        expect(providerAuditUrl("bedrock")).toBe(
            providerAuditTargets("aws")[0].url,
        );
        expect(providerAuditTargets("fireworks")).toHaveLength(5);
        expect(providerAuditTargets("openrouter")).toHaveLength(2);
        expect(providerAuditUrl("pointsflyer")).toBeNull();
    });

    it("keeps source-backed Pollen witness explanations unique and canonical", () => {
        const keys = POLLEN_WITNESS_EXPLANATIONS.map(
            (explanation) => `${explanation.month}|${explanation.provider}`,
        );
        expect(new Set(keys).size).toBe(keys.length);
        for (const explanation of POLLEN_WITNESS_EXPLANATIONS) {
            expect(resolveProvider(explanation.provider)?.id).toBe(
                explanation.provider,
            );
            expect(explanation.evidence.length).toBeGreaterThan(0);
        }

        expect(pollenWitnessExplanation("2026-02", "vastai")).toMatchObject({
            provider: "vast.ai",
            reason: "provider_attribution_transition",
        });
        expect(pollenWitnessExplanation("2026-02", "pruna")).toMatchObject({
            provider: "pruna",
            reason: "unverifiable_history",
        });
    });

    it("keeps reviewed provider limitations unique, canonical, and archived", () => {
        const keys = PROVIDER_CHECK_EXPLANATIONS.map(
            (explanation) => `${explanation.month}|${explanation.provider}`,
        );
        expect(new Set(keys).size).toBe(keys.length);
        for (const explanation of PROVIDER_CHECK_EXPLANATIONS) {
            expect(resolveProvider(explanation.provider)?.id).toBe(
                explanation.provider,
            );
            expect(
                explanation.evidence.every((url) =>
                    url.startsWith("https://drive.google.com/"),
                ),
            ).toBe(true);
        }

        expect(providerCheckExplanation("2026-03", "pruna")).toMatchObject({
            reason: "unverifiable_history",
        });
        expect(providerCheckExplanation("2026-07", "pruna")).toBeUndefined();
    });

    it("keeps explained meter drift unique, canonical, and archived", () => {
        const keys = METER_DRIFT_EXPLANATIONS.map(
            (explanation) => `${explanation.month}|${explanation.provider}`,
        );
        expect(new Set(keys).size).toBe(keys.length);
        for (const explanation of METER_DRIFT_EXPLANATIONS) {
            expect(resolveProvider(explanation.provider)?.id).toBe(
                explanation.provider,
            );
            expect(
                explanation.evidence.every((url) =>
                    url.startsWith("https://drive.google.com/"),
                ),
            ).toBe(true);
        }

        expect(meterDriftExplanation("2026-03", "anthropic")).toMatchObject({
            reason: "historical_tracking_gap",
        });
        expect(meterDriftExplanation("2026-04", "anthropic")).toBeUndefined();
    });
});

describe("provider observations", () => {
    it("collects provider-like Tinybird values and ignores non-cloud vendors", () => {
        const observations = collectProviderObservations(
            data({
                opTransactions: [
                    transaction({ vendor: "aws" }),
                    transaction({ vendor: "figma", category: "saas" }),
                ],
                opCloud: [cloud({ vendor: "aws" })],
                opPollen: [pollen({ vendor: "bedrock" })],
            }),
        );

        expect(observations).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    vendor: "aws",
                    source: "transactions",
                }),
                expect.objectContaining({
                    vendor: "aws",
                    source: "cloud",
                    dashboardChecked: true,
                }),
                expect.objectContaining({
                    vendor: "bedrock",
                    source: "pollen",
                }),
            ]),
        );
        expect(observations.some((row) => row.vendor === "figma")).toBe(false);
    });

    it("does not mistake a Wise payment for a provider check", () => {
        const [observation] = collectProviderObservations(
            data({
                opTransactions: [
                    transaction({
                        evidence:
                            "https://drive.google.com/file/d/provider-invoice/view?usp=drivesdk",
                    }),
                ],
            }),
        );

        expect(observation.dashboardChecked).toBe(false);
    });

    it("does not count a pure credit award as a monthly provider check", () => {
        const [observation] = collectProviderObservations(
            data({ opCloud: [cloud({ credit: 3_000, paid: 0 })] }),
        );

        expect(observation.dashboardChecked).toBe(false);
    });

    it("records a provider observation only in the row's start month", () => {
        const observations = collectProviderObservations(
            data({
                opCloud: [
                    cloud({
                        start: "2026-01-01 00:00:00",
                        end: "2026-08-21 00:00:00",
                        vendor: "modal",
                        account_id: "myceli-ai2",
                        paid: 0,
                    }),
                ],
            }),
        );

        expect(observations.map((row) => row.month)).toEqual(["2026-01"]);
        expect(observations.every((row) => row.dashboardChecked)).toBe(true);
    });

    it("expands an explicit verified-zero account range across its covered months", () => {
        const observations = collectProviderObservations(
            data({
                opCloud: [
                    cloud({
                        start: "2026-01-01 00:00:00",
                        end: "2026-08-21 00:00:00",
                        vendor: "modal",
                        account_id: "myceli-ai2",
                        credit: 0,
                        paid: 0,
                        resource_sku: "verified-zero",
                        resource_count: 0,
                    }),
                ],
            }),
        );

        expect(observations.map((row) => row.month)).toEqual([
            "2026-08",
            "2026-07",
            "2026-06",
            "2026-05",
            "2026-04",
            "2026-03",
            "2026-02",
            "2026-01",
        ]);
        expect(observations.every((row) => row.dashboardChecked)).toBe(true);
    });

    it("treats OP Cloud end timestamps as exclusive", () => {
        const observations = collectProviderObservations(
            data({
                opCloud: [
                    cloud({
                        start: "2026-07-01 00:00:00",
                        end: "2026-08-01 00:00:00",
                    }),
                ],
            }),
        );

        expect(observations.map((row) => row.month)).toEqual(["2026-07"]);
    });

    it("keeps provider-check completion separate from Drive archiving", () => {
        const [observation] = collectProviderObservations(
            data({
                opCloud: [
                    cloud({
                        evidence:
                            "dashboard export saved in data/inbox/provider.json",
                    }),
                ],
            }),
        );

        expect(observation.dashboardChecked).toBe(true);
    });

    it("preserves provider account IDs before provider aggregation", () => {
        const [observation] = collectProviderObservations(
            data({
                opCloud: [
                    cloud({
                        vendor: "cloudflare",
                        account_id: "Myceli",
                    }),
                ],
            }),
        );

        expect(observation).toMatchObject({
            vendor: "cloudflare",
            accountId: "myceli",
        });
    });
});

describe("providerReviewRows", () => {
    it("separates a completed historical limitation review from a check still due", () => {
        const [row] = providerReviewRows(
            data({
                opCloud: [
                    cloud({
                        vendor: "pruna",
                        start: "2026-03-01 00:00:00",
                        end: "2026-04-01 00:00:00",
                        evidence: "legacy provider_monthly manual row",
                    }),
                ],
            }),
            "2026-03",
        ).filter((candidate) => candidate.provider === "pruna");

        expect(row.dashboardStatus).toBe("reviewed gap");
        expect(row.checkExplanation?.reason).toBe("unverifiable_history");
    });

    it("merges aliases and separates activity gaps from quiet accounts", () => {
        const input = data({
            opCloud: [cloud({ vendor: "aws" })],
            opPollen: [
                pollen({ vendor: "bedrock" }),
                pollen({ vendor: "inception" }),
                pollen({ vendor: "new-provider" }),
            ],
        });
        const rows = providerReviewRows(input, "2026-07");
        const aws = rows.find((row) => row.provider === "aws");
        const inception = rows.find((row) => row.provider === "inception");
        const alibaba = rows.find((row) => row.provider === "alibaba");

        expect(aws).toMatchObject({
            mapped: true,
            meteringBasis: "mixed",
            dashboardChecked: true,
            dashboardStatus: "recorded",
            observedAliases: ["aws", "bedrock"],
            sources: ["cloud", "pollen"],
        });
        expect(inception).toMatchObject({
            mapped: true,
            dashboardChecked: false,
            dashboardStatus: "due",
            connector: "inception",
        });
        expect(alibaba).toMatchObject({
            mapped: true,
            dashboardChecked: false,
            dashboardStatus: "no activity",
            observedAliases: [],
        });
        expect(missingProviderMappings(input, "2026-07")).toEqual([
            expect.objectContaining({ provider: "new-provider" }),
        ]);
    });

    it("does not require an external dashboard for internal providers", () => {
        const [community] = providerReviewRows(
            data({ opPollen: [pollen({ vendor: "community" })] }),
            "2026-07",
        ).filter((row) => row.provider === "community");

        expect(community).toMatchObject({
            mapped: true,
            dashboardStatus: "not required",
        });
    });

    it("flags incomplete multi-account evidence without treating accounts as aliases", () => {
        const rows = providerReviewRows(
            data({
                opCloud: [
                    cloud({
                        vendor: "cloudflare",
                        account_id: "myceli",
                        start: "2026-06-01 00:00:00",
                    }),
                ],
            }),
            "2026-06",
        );
        const cloudflare = rows.find((row) => row.provider === "cloudflare");

        expect(cloudflare).toMatchObject({
            accountStatus: "partial",
            observedAccountIds: ["myceli"],
        });
        expect(
            cloudflare?.expectedAccounts.map((account) => account.id),
        ).toEqual(["pollinations", "myceli"]);
        expect(resolveProvider("myceli")).toBeUndefined();
    });
});
