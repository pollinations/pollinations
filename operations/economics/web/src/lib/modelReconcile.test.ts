import { describe, expect, it } from "vitest";
import type { Data, OpCloudRow, OpPollenRow } from "../types";
import {
    modelReconcileRows,
    modelReconcileSummary,
    visibleModelReconcileRows,
} from "./modelReconcile";

const cloud = (over: Partial<OpCloudRow> = {}): OpCloudRow => ({
    entry_id: "cloud-test",
    source: "provider",
    vendor: "aws",
    type: "inference",
    start: "2026-07-01 00:00:00",
    end: "2026-08-01 00:00:00",
    credit: 0,
    paid: 0,
    currency: "USD",
    resource_id: "",
    resource_name: "",
    resource_sku: "",
    resource_count: 1,
    model: "provider display label",
    evidence: "provider statement",
    recorded_at: "2026-08-10 00:00:00",
    ...over,
});

const pollen = (over: Partial<OpPollenRow> = {}): OpPollenRow => ({
    source: "tinybird",
    month: "2026-07",
    vendor: "bedrock",
    model: "claude",
    currency: "POLLEN",
    cost_paid: 0,
    cost_quests: 0,
    price_paid: 0,
    price_quests: 0,
    byop_paid: 0,
    byop_quests: 0,
    model_paid: 0,
    model_quests: 0,
    requests_paid: 0,
    requests_quests: 0,
    ...over,
});

const data = (over: Partial<Data>): Data => ({
    opTransactions: [],
    opCloud: [],
    opPollen: [],
    ...over,
});

describe("modelReconcileRows", () => {
    it("splits paid and Quest traffic through cash and credit funding", () => {
        const [row] = modelReconcileRows(
            data({
                opCloud: [
                    cloud({ model: "claude", paid: -60, credit: -15 }),
                    cloud({ model: "nova", paid: -20, credit: -5 }),
                ],
                opPollen: [
                    pollen({
                        model: "claude",
                        cost_paid: 60,
                        cost_quests: 15,
                        price_paid: 100,
                        price_quests: 20,
                        byop_paid: 5,
                        model_paid: 5,
                    }),
                    pollen({
                        model: "nova",
                        cost_paid: 20,
                        cost_quests: 5,
                        price_paid: 40,
                        price_quests: 10,
                    }),
                ],
            }),
        );

        expect(row.month).toBe("2026-07");
        expect(row.vendor).toBe("aws");
        expect(row.status).toBe("both sources");
        expect(row.paidPollenUsd).toBe(140);
        expect(row.questPollenUsd).toBe(30);
        expect(row.retainedPaidUsd).toBe(130);
        expect(row.pollenMeterUsd).toBe(100);
        expect(row.providerCashUsd).toBe(80);
        expect(row.providerCreditUsd).toBe(20);
        expect(row.meterGapUsd).toBe(0);
        expect(row.paidProviderCashUsd).toBe(64);
        expect(row.questProviderCashUsd).toBe(16);
        expect(row.paidProviderCreditUsd).toBe(16);
        expect(row.questProviderCreditUsd).toBe(4);
        expect(row.paidPollenOnCreditsUsd).toBe(28);
        expect(row.questPollenOnCreditsUsd).toBe(6);
        expect(row.paidContributionUsd).toBe(66);
        expect(row.questCashSubsidyUsd).toBe(16);
        expect(row.netCashContributionUsd).toBe(50);

        const claude = row.models.find((model) => model.model === "claude");
        const nova = row.models.find((model) => model.model === "nova");
        if (!claude || !nova) throw new Error("allocated models missing");
        expect(claude.paidPollenUsd).toBe(100);
        expect(claude.questPollenUsd).toBe(20);
        expect(claude.providerCashUsd).toBe(60);
        expect(claude.providerCreditUsd).toBe(15);
        expect(claude.paidProviderCashUsd).toBe(48);
        expect(claude.questProviderCashUsd).toBe(12);
        expect(claude.paidProviderCreditUsd).toBe(12);
        expect(claude.questProviderCreditUsd).toBe(3);
        expect(claude.paidPollenOnCreditsUsd).toBe(20);
        expect(claude.questPollenOnCreditsUsd).toBe(4);
        expect(claude.paidContributionUsd).toBe(42);
        expect(claude.questCashSubsidyUsd).toBe(12);
        expect(claude.netCashContributionUsd).toBe(30);
        expect(nova.providerCashUsd).toBe(20);
        expect(nova.providerCreditUsd).toBe(5);
        expect(nova.paidContributionUsd).toBe(24);
        expect(nova.questCashSubsidyUsd).toBe(4);
        expect(nova.netCashContributionUsd).toBe(20);
        expect(
            row.models.reduce(
                (sum, model) => sum + (model.providerCashUsd ?? 0),
                0,
            ),
        ).toBe(row.providerCashUsd);
        expect(
            row.models.reduce(
                (sum, model) => sum + (model.providerCreditUsd ?? 0),
                0,
            ),
        ).toBe(row.providerCreditUsd);
    });

    it("uses complete canonical model funding instead of proportional allocation", () => {
        const [row] = modelReconcileRows(
            data({
                opCloud: [
                    cloud({
                        entry_id: "claude-input",
                        model: "claude",
                        paid: -70,
                    }),
                    cloud({
                        entry_id: "claude-output",
                        model: "claude",
                        paid: -20,
                    }),
                    cloud({
                        entry_id: "nova",
                        model: "nova",
                        paid: -10,
                    }),
                ],
                opPollen: [
                    pollen({
                        model: "claude",
                        cost_paid: 60,
                        price_paid: 120,
                    }),
                    pollen({
                        model: "nova",
                        cost_paid: 40,
                        price_paid: 50,
                    }),
                ],
            }),
        );

        const claude = row.models.find((model) => model.model === "claude");
        const nova = row.models.find((model) => model.model === "nova");
        if (!claude || !nova) throw new Error("direct models missing");
        expect(claude.providerCashUsd).toBe(90);
        expect(claude.meterGapUsd).toBe(30);
        expect(nova.providerCashUsd).toBe(10);
        expect(nova.meterGapUsd).toBe(-30);
        expect(row.paidProviderCashUsd).toBe(100);
    });

    it("preserves exact costs when canonical model coverage is incomplete", () => {
        const [row] = modelReconcileRows(
            data({
                opCloud: [
                    cloud({
                        model: "claude",
                        paid: -100,
                    }),
                ],
                opPollen: [
                    pollen({
                        model: "claude",
                        cost_paid: 50,
                    }),
                    pollen({
                        model: "nova",
                        cost_paid: 50,
                    }),
                ],
            }),
        );

        const claude = row.models.find((model) => model.model === "claude");
        const nova = row.models.find((model) => model.model === "nova");
        if (!claude || !nova) throw new Error("models missing");
        expect(claude.providerCashUsd).toBe(100);
        expect(claude.status).toBe("allocated");
        expect(nova.providerCashUsd).toBeNull();
        expect(nova.status).toBe("unallocated");
        expect(row.providerCashUsd).toBe(100);
        expect(row.paidProviderCashUsd).toBeNull();
    });

    it("separates unmapped labels from model-less costs without changing exact matches", () => {
        const [row] = modelReconcileRows(
            data({
                opCloud: [
                    cloud({ model: "claude", paid: -40, credit: -10 }),
                    cloud({ model: "Provider Claude Label", paid: -20 }),
                    cloud({ model: "", credit: -30 }),
                ],
                opPollen: [
                    pollen({ model: "claude", cost_paid: 30, price_paid: 60 }),
                    pollen({ model: "nova", cost_paid: 70, price_paid: 80 }),
                ],
            }),
        );
        expect(row.models.find((m) => m.model === "claude")).toMatchObject({
            status: "allocated",
            providerCashUsd: 40,
            providerCreditUsd: 10,
        });
        expect(row.models.find((m) => m.model === "nova")).toMatchObject({
            status: "unallocated",
            providerCashUsd: null,
        });
        expect(
            row.models.find((m) => m.model === "Needs model mapping"),
        ).toMatchObject({
            status: "needs mapping",
            providerCashUsd: 20,
            providerCreditUsd: 0,
        });
        expect(
            row.models.find((m) => m.model === "Missing cost breakdown"),
        ).toMatchObject({
            status: "missing breakdown",
            providerCashUsd: 0,
            providerCreditUsd: 30,
        });
        expect(
            row.models.reduce((sum, m) => sum + (m.providerUsageUsd ?? 0), 0),
        ).toBe(100);
        expect(row.providerUsageUsd).toBe(100);
        expect(row.netCashContributionUsd).toBe(80);
    });

    it("joins provider labels through the registry label table", () => {
        const [row] = modelReconcileRows(
            data({
                opCloud: [
                    cloud({
                        vendor: "azure",
                        model: "Kontext Pro glbl Images",
                        paid: -40,
                    }),
                    cloud({
                        vendor: "azure",
                        model: "Image 2 img opt Gl 1M Tokens",
                        paid: -60,
                    }),
                    cloud({
                        vendor: "azure",
                        model: "Image 2 txt inp Gl 1M Tokens",
                        paid: -10,
                    }),
                ],
                opPollen: [
                    pollen({
                        vendor: "azure",
                        model: "kontext",
                        cost_paid: 30,
                    }),
                    pollen({
                        vendor: "azure",
                        model: "gpt-image-2",
                        cost_paid: 60,
                    }),
                ],
            }),
        );

        expect(row.models.find((m) => m.model === "kontext")).toMatchObject({
            status: "allocated",
            providerCashUsd: 40,
        });
        expect(row.models.find((m) => m.model === "gpt-image-2")).toMatchObject(
            { status: "allocated", providerCashUsd: 70 },
        );
        expect(row.models).toHaveLength(2);
    });

    it("does not join a registry alias that is not a reviewed label", () => {
        const [row] = modelReconcileRows(
            data({
                opCloud: [
                    cloud({ model: "anthropic/claude-opus-5", paid: -50 }),
                ],
                opPollen: [pollen({ model: "claude-large", cost_paid: 45 })],
            }),
        );

        expect(
            row.models.find((m) => m.model === "claude-large"),
        ).toMatchObject({ status: "unallocated", providerCashUsd: null });
        expect(
            row.models.find((m) => m.model === "Needs model mapping"),
        ).toMatchObject({ status: "needs mapping", providerCashUsd: 50 });
    });

    it("keeps a historical Pollen id apart from the model today's registry aliases it to", () => {
        const [row] = modelReconcileRows(
            data({
                opCloud: [
                    cloud({
                        vendor: "azure",
                        model: "gpt-realtime-2 Audio opt Gl 1M Tokens",
                        paid: -9,
                    }),
                ],
                opPollen: [
                    pollen({
                        vendor: "azure",
                        model: "gpt-realtime-2",
                        cost_paid: 8,
                    }),
                    pollen({
                        vendor: "azure",
                        model: "gpt-realtime-2.1",
                        cost_paid: 5,
                    }),
                ],
            }),
        );

        expect(
            row.models.find((m) => m.model === "gpt-realtime-2"),
        ).toMatchObject({ status: "allocated", providerCashUsd: 9 });
        expect(
            row.models.find((m) => m.model === "gpt-realtime-2.1"),
        ).toMatchObject({ status: "unallocated", providerCashUsd: null });
    });

    it("joins a retired model id that the registry no longer lists but Pollen still names", () => {
        const [row] = modelReconcileRows(
            data({
                opCloud: [
                    cloud({
                        vendor: "mistral",
                        model: "mistral-ocr",
                        paid: -9,
                    }),
                ],
                opPollen: [
                    pollen({
                        vendor: "mistral",
                        model: "mistral-ocr",
                        cost_paid: 8,
                    }),
                ],
            }),
        );

        expect(row.models).toEqual([
            expect.objectContaining({
                model: "mistral-ocr",
                status: "allocated",
                providerCashUsd: 9,
            }),
        ]);
    });

    it("keeps separately metered Pollen ids apart and splits them by ledger SKU", () => {
        const [row] = modelReconcileRows(
            data({
                opCloud: [
                    cloud({
                        vendor: "google",
                        model: "veo-3-fast",
                        resource_sku: "Veo 3 Fast 720p Audio Video Generation ",
                        paid: -100,
                    }),
                    cloud({
                        vendor: "google",
                        model: "veo-3-fast",
                        resource_sku: "Veo 3 Fast 1080p Audio Video Generation",
                        paid: -6,
                    }),
                ],
                opPollen: [
                    pollen({ vendor: "google", model: "veo", cost_paid: 80 }),
                    pollen({
                        vendor: "google",
                        model: "veo-1080p",
                        cost_paid: 5,
                    }),
                ],
            }),
        );

        expect(row.models.find((m) => m.model === "veo")).toMatchObject({
            status: "allocated",
            pollenMeterUsd: 80,
            providerCashUsd: 100,
        });
        expect(row.models.find((m) => m.model === "veo-1080p")).toMatchObject({
            status: "allocated",
            pollenMeterUsd: 5,
            providerCashUsd: 6,
        });
        expect(row.models).toHaveLength(2);
    });

    it("keeps a label that serves several Pollen models billed together, never split", () => {
        const [row] = modelReconcileRows(
            data({
                opCloud: [
                    cloud({
                        vendor: "elevenlabs",
                        model: "eleven_v3",
                        paid: -100,
                    }),
                    cloud({
                        vendor: "elevenlabs",
                        model: "music_v2",
                        paid: -50,
                    }),
                ],
                opPollen: [
                    pollen({
                        vendor: "elevenlabs",
                        model: "elevenlabs",
                        cost_paid: 90,
                    }),
                    pollen({
                        vendor: "elevenlabs",
                        model: "eleven-dialogue",
                        cost_paid: 5,
                    }),
                    pollen({
                        vendor: "elevenlabs",
                        model: "elevenmusic",
                        cost_paid: 50,
                    }),
                ],
            }),
        );

        expect(row.models.find((m) => m.model === "elevenmusic")).toMatchObject(
            { status: "allocated", providerCashUsd: 50 },
        );
        expect(row.models.find((m) => m.model === "elevenlabs")).toMatchObject({
            status: "shared member",
            group: "elevenlabs + eleven-dialogue",
            providerCashUsd: null,
        });
        expect(
            row.models.find((m) => m.model === "elevenlabs + eleven-dialogue"),
        ).toMatchObject({
            status: "shared upstream",
            providerCashUsd: 100,
            lines: [{ label: "eleven_v3", usd: 100 }],
        });
        expect(
            row.models.reduce((sum, m) => sum + (m.providerUsageUsd ?? 0), 0),
        ).toBe(150);
    });

    it("shows one billed-together row per upstream group and marks its members", () => {
        const [row] = modelReconcileRows(
            data({
                opCloud: [
                    cloud({
                        vendor: "azure",
                        model: "5.5 ShortCo opt Gl 1M Tokens",
                        paid: -100,
                    }),
                    cloud({
                        vendor: "azure",
                        model: "5.5 ShortCo inp Gl 1M Tokens",
                        paid: -50,
                    }),
                    cloud({
                        vendor: "azure",
                        model: "Kontext Pro glbl Images",
                        paid: -20,
                    }),
                ],
                opPollen: [
                    pollen({
                        vendor: "azure",
                        model: "openai-large",
                        cost_paid: 120,
                    }),
                    pollen({
                        vendor: "azure",
                        model: "midijourney-large",
                        cost_paid: 5,
                    }),
                    pollen({
                        vendor: "azure",
                        model: "kontext",
                        cost_paid: 20,
                    }),
                ],
            }),
        );

        const group = row.models.filter((m) => m.status === "shared upstream");
        expect(group).toEqual([
            expect.objectContaining({
                model: "openai-large + midijourney-large",
                providerCashUsd: 150,
                lines: [
                    { label: "5.5 ShortCo opt Gl 1M Tokens", usd: 100 },
                    { label: "5.5 ShortCo inp Gl 1M Tokens", usd: 50 },
                ],
            }),
        ]);
        expect(
            row.models.find((m) => m.model === "openai-large"),
        ).toMatchObject({
            status: "shared member",
            group: "openai-large + midijourney-large",
            providerCashUsd: null,
            pollenMeterUsd: 120,
        });
        expect(
            row.models.find((m) => m.model === "midijourney-large"),
        ).toMatchObject({ status: "shared member" });
        expect(row.buckets).toEqual({
            allocatedUsd: 20,
            billedTogetherUsd: 150,
            missingBreakdownUsd: 0,
            needsMappingUsd: 0,
            providerOnlyUsd: 0,
        });
    });

    it("sums the residual buckets across vendor months", () => {
        const rows = modelReconcileRows(
            data({
                opCloud: [
                    cloud({ model: "claude", paid: -40 }),
                    cloud({ model: "", paid: -30 }),
                    cloud({ vendor: "modal", model: "mystery", paid: -5 }),
                ],
                opPollen: [pollen({ model: "claude", cost_paid: 35 })],
            }),
        );

        expect(modelReconcileSummary(rows).buckets).toEqual({
            allocatedUsd: 40,
            billedTogetherUsd: 0,
            missingBreakdownUsd: 30,
            needsMappingUsd: 5,
            providerOnlyUsd: 0,
        });
    });

    it("joins a shared label directly when only one of its models was metered that month", () => {
        const [row] = modelReconcileRows(
            data({
                opCloud: [
                    cloud({
                        vendor: "elevenlabs",
                        model: "eleven_v3",
                        paid: -100,
                    }),
                ],
                opPollen: [
                    pollen({
                        vendor: "elevenlabs",
                        model: "elevenlabs",
                        cost_paid: 90,
                    }),
                ],
            }),
        );

        expect(row.models).toEqual([
            expect.objectContaining({
                model: "elevenlabs",
                status: "allocated",
                providerCashUsd: 100,
            }),
        ]);
    });

    it("shows a mapped model with no Pollen usage as provider only", () => {
        const [row] = modelReconcileRows(
            data({
                opCloud: [
                    cloud({
                        vendor: "azure",
                        model: "Flex Megapixel",
                        paid: -5,
                    }),
                    cloud({
                        vendor: "azure",
                        model: "Kontext Pro glbl Images",
                        paid: -20,
                    }),
                ],
                opPollen: [
                    pollen({
                        vendor: "azure",
                        model: "kontext",
                        cost_paid: 20,
                    }),
                ],
            }),
        );

        expect(row.models.find((m) => m.model === "flux-2-flex")).toMatchObject(
            {
                status: "provider only",
                providerCashUsd: 5,
                pollenMeterUsd: null,
            },
        );
        expect(
            row.models.reduce((sum, m) => sum + (m.providerUsageUsd ?? 0), 0),
        ).toBe(25);
    });

    it("shows a reviewed label with no Pollen model as provider only", () => {
        const [row] = modelReconcileRows(
            data({
                opCloud: [
                    cloud({
                        vendor: "replicate",
                        model: "topazlabs/image-upscale",
                        paid: -5,
                    }),
                ],
                opPollen: [
                    pollen({
                        vendor: "replicate",
                        model: "seedance-2.0",
                        cost_paid: 20,
                    }),
                ],
            }),
        );

        expect(
            row.models.find((m) => m.model === "topazlabs/image-upscale"),
        ).toMatchObject({ status: "provider only", providerCashUsd: 5 });
    });

    it("identifies paid and Quest Pollen spent on credit-funded usage", () => {
        const [row] = modelReconcileRows(
            data({
                opCloud: [cloud({ model: "claude", paid: -25, credit: -75 })],
                opPollen: [
                    pollen({
                        cost_paid: 60,
                        cost_quests: 40,
                        price_paid: 120,
                        price_quests: 80,
                        byop_paid: 20,
                    }),
                ],
            }),
        );

        expect(row.paidPollenOnCreditsUsd).toBe(90);
        expect(row.questPollenOnCreditsUsd).toBe(60);
        expect(row.paidProviderCashUsd).toBe(15);
        expect(row.questProviderCashUsd).toBe(10);
        expect(row.paidProviderCreditUsd).toBe(45);
        expect(row.questProviderCreditUsd).toBe(30);
        expect(row.paidContributionUsd).toBe(85);
        expect(row.questCashSubsidyUsd).toBe(10);
        expect(row.netCashContributionUsd).toBe(75);

        const summary = modelReconcileSummary([row]);
        expect(summary.paidPollenOnCreditsUsd).toBe(90);
        expect(summary.questPollenOnCreditsUsd).toBe(60);
        expect(summary.paidContributionUsd).toBe(85);
        expect(summary.questCashSubsidyUsd).toBe(10);
        expect(summary.netCashContributionUsd).toBe(75);
    });

    it("allocates each month separately instead of blending periods", () => {
        const rows = modelReconcileRows(
            data({
                opCloud: [
                    cloud({ paid: -100 }),
                    cloud({
                        start: "2026-08-01 00:00:00",
                        end: "2026-09-01 00:00:00",
                        paid: -300,
                    }),
                ],
                opPollen: [
                    pollen({ cost_paid: 50 }),
                    pollen({ month: "2026-08", cost_paid: 300 }),
                ],
            }),
        );

        expect(rows).toHaveLength(2);
        expect(rows.find((row) => row.month === "2026-07")?.meterGapUsd).toBe(
            50,
        );
        expect(rows.find((row) => row.month === "2026-08")?.meterGapUsd).toBe(
            0,
        );
    });

    it("keeps missing provider data unknown instead of turning it into zero", () => {
        const [row] = modelReconcileRows(
            data({ opPollen: [pollen({ cost_paid: 25, price_paid: 30 })] }),
        );

        expect(row.status).toBe("pollen only");
        expect(row.providerCashUsd).toBeNull();
        expect(row.providerCreditUsd).toBeNull();
        expect(row.meterGapUsd).toBeNull();
        expect(row.paidPollenOnCreditsUsd).toBeNull();
        expect(row.netCashContributionUsd).toBeNull();
        expect(row.models[0].status).toBe("missing provider");
    });

    it("shows provider usage without Pollen as needing a mapping", () => {
        const [row] = modelReconcileRows(
            data({ opCloud: [cloud({ vendor: "modal", paid: -42 })] }),
        );

        expect(row.status).toBe("provider only");
        expect(row.pollenMeterUsd).toBeNull();
        expect(row.providerUsageUsd).toBe(42);
        expect(row.models).toEqual([
            expect.objectContaining({
                model: "Needs model mapping",
                status: "needs mapping",
                providerCashUsd: 42,
            }),
        ]);
    });

    it("keeps provider usage unallocated when the Pollen cost weights are zero", () => {
        const [row] = modelReconcileRows(
            data({
                opCloud: [cloud({ paid: -20, credit: -80 })],
                opPollen: [
                    pollen({
                        cost_paid: 0,
                        cost_quests: 0,
                        price_paid: 50,
                        price_quests: 10,
                    }),
                ],
            }),
        );

        expect(row.status).toBe("both sources");
        expect(row.paidProviderCashUsd).toBeNull();
        expect(row.questProviderCashUsd).toBeNull();
        expect(row.paidPollenOnCreditsUsd).toBe(40);
        expect(row.questPollenOnCreditsUsd).toBe(8);
        expect(row.paidContributionUsd).toBeNull();
        expect(row.questCashSubsidyUsd).toBeNull();
        expect(row.netCashContributionUsd).toBe(30);
        expect(row.models).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    model: "claude",
                    status: "unallocated",
                }),
                expect.objectContaining({
                    model: "Needs model mapping",
                    providerCashUsd: 20,
                    providerCreditUsd: 80,
                }),
            ]),
        );
    });

    it("ignores infrastructure and grant awards but preserves paid refunds", () => {
        const rows = modelReconcileRows(
            data({
                opCloud: [
                    cloud({ vendor: "azure", credit: 10_000 }),
                    cloud({ vendor: "cloudflare", type: "infra", paid: -50 }),
                    cloud({ vendor: "aws", paid: -100 }),
                    cloud({ vendor: "aws", paid: 10, source: "refund" }),
                ],
                opPollen: [pollen({ cost_paid: 90, price_paid: 100 })],
            }),
        );

        expect(rows).toHaveLength(1);
        expect(rows[0].providerCashUsd).toBe(90);
        expect(rows[0].meterGapUsd).toBe(0);
    });

    it("filters after preserving month-provider grain and summarizes holes", () => {
        const rows = modelReconcileRows(
            data({
                opCloud: [
                    cloud({ model: "claude", paid: -50 }),
                    cloud({ vendor: "modal", paid: -20 }),
                ],
                opPollen: [
                    pollen({ cost_paid: 40, price_paid: 60 }),
                    pollen({ vendor: "openai", cost_paid: 10 }),
                ],
            }),
        );
        const visible = visibleModelReconcileRows({
            rows,
            month: "2026-07",
            vendor: ["aws", "openai"],
        });
        const summary = modelReconcileSummary(visible);

        expect(visible.map((row) => row.vendor)).toEqual(["aws", "openai"]);
        expect(summary.providerMonths).toBe(2);
        expect(summary.missingSideProviderMonths).toBe(1);
        expect(summary.paidPollenUsd).toBe(60);
        expect(summary.questPollenUsd).toBe(0);
        expect(summary.retainedPaidUsd).toBe(60);
        expect(summary.pollenMeterUsd).toBe(50);
        expect(summary.providerUsageUsd).toBe(50);
        expect(summary.meterGapUsd).toBe(10);
        expect(summary.paidPollenOnCreditsUsd).toBe(0);
        expect(summary.questPollenOnCreditsUsd).toBe(0);
        expect(summary.paidContributionUsd).toBe(10);
        expect(summary.questCashSubsidyUsd).toBe(0);
        expect(summary.netCashContributionUsd).toBe(10);
        expect(summary.pollenOnlyMeterUsd).toBe(10);
    });
});
