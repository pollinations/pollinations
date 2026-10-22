import { afterEach, describe, expect, it, vi } from "vitest";
import {
    FIXTURES,
    PLANNING_DOCUMENT_FIXTURE,
    PRIVATE_CONFIG_FIXTURE,
} from "../fixtures";
import type { OpPollenRow, VendorLedgerRow } from "../types";
import {
    canonicalPollenRows,
    canonicalVendor,
    loadAll,
    TbError,
    validatePipeRows,
} from "./tb";

afterEach(() => {
    vi.unstubAllGlobals();
});

describe("Tinybird pipe contracts", () => {
    it("keeps every fixture aligned with its live pipe contract", () => {
        for (const [pipe, rows] of Object.entries(FIXTURES)) {
            expect(validatePipeRows(pipe, rows)).toBe(rows);
        }
    });

    it("rejects malformed financial values at the API boundary", () => {
        expect(() =>
            validatePipeRows("economics_bank_ledger_api", [
                {
                    ...(FIXTURES.economics_bank_ledger_api[0] as Record<
                        string,
                        unknown
                    >),
                    amount: "100",
                },
            ]),
        ).toThrow("economics_bank_ledger_api[0].amount: expected number");
    });
});

describe("loadAll", () => {
    it("loads only the sources a view needs and does not invent absent datasets", async () => {
        const fetch = vi.fn(() =>
            Promise.resolve(
                Response.json({ data: FIXTURES.economics_bank_ledger_api }),
            ),
        );
        vi.stubGlobal("fetch", fetch);
        const controller = new AbortController();
        const result = await loadAll(["opTransactions"], controller.signal);
        expect(fetch).toHaveBeenCalledExactlyOnceWith(
            "/api/economics/pipes/economics_bank_ledger_api",
            { credentials: "same-origin", signal: controller.signal },
        );
        expect(result.opTransactions).toHaveLength(
            FIXTURES.economics_bank_ledger_api.length,
        );
        expect(result.revenueShare).toBeUndefined();
        expect(result.privateConfig).toBeUndefined();
    });
    it("reuses the loaded Drive decisions with non-posting Vendor plans", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn((input: RequestInfo | URL) => {
                const pipe = decodeURIComponent(
                    String(input).split("/").at(-1) ?? "",
                );
                return Promise.resolve(Response.json({ data: FIXTURES[pipe] }));
            }),
        );

        const result = await loadAll(
            undefined,
            undefined,
            PLANNING_DOCUMENT_FIXTURE,
        );

        for (const rows of [result.vendorLedger, result.opPollen]) {
            expect(rows?.some((row) => row.vendor === "vast")).toBe(true);
            expect(rows?.some((row) => row.vendor === "vast.ai")).toBe(false);
        }
        expect(result.privateConfig).toEqual({
            ...PRIVATE_CONFIG_FIXTURE,
            forecastRules: {
                ...PRIVATE_CONFIG_FIXTURE.forecastRules,
                "stripe refunds|revenue": {
                    fixedAmounts: [{ amount: 0, currency: "USD" }],
                },
            },
            recordedAt: PLANNING_DOCUMENT_FIXTURE.recordedAt,
        });
        expect(result.vendorPlans?.map((row) => row.plan_amount)).toEqual([
            -90,
        ]);
        expect(result.vendorLedger?.some((row) => row.type === "planned")).toBe(
            false,
        );
        expect(
            result.providerObservations?.some(
                (row) => row.vendor === "openai" && row.month === "",
            ),
        ).toBe(false);
        expect(result.userBalances).toEqual(
            FIXTURES.economics_user_balances_api,
        );
    });

    it("keeps missing journal data explicit when no source snapshot is supplied", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn((input: RequestInfo | URL) => {
                const pipe = decodeURIComponent(
                    String(input).split("/").at(-1) ?? "",
                );
                return Promise.resolve(
                    Response.json(
                        pipe === "planning" ? null : { data: FIXTURES[pipe] },
                    ),
                );
            }),
        );

        const result = await loadAll();
        expect(result.opTransactions).toHaveLength(
            FIXTURES.economics_bank_ledger_api.length,
        );
        expect(result.vendorLedger?.length).toBeGreaterThan(0);
        expect(result.privateConfig).toBeUndefined();
        expect(result.planningError).toBe("Planning document unavailable");
    });

    it("preserves dashboard authentication status", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn(() =>
                Promise.resolve(
                    Response.json({ error: "Unauthorized" }, { status: 401 }),
                ),
            ),
        );

        const error = await loadAll().catch((caught: unknown) => caught);

        expect(error).toBeInstanceOf(TbError);
        expect((error as TbError).status).toBe(401);
    });

    it("fails closed when the D1 user snapshot is empty", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn((input: RequestInfo | URL) => {
                const pipe = decodeURIComponent(
                    String(input).split("/").at(-1) ?? "",
                );
                return Promise.resolve(
                    Response.json({
                        data:
                            pipe === "economics_user_balances_api"
                                ? [
                                      {
                                          users: 0,
                                          paid_users: 0,
                                          quest_users: 0,
                                          paid_balance: 0,
                                          quest_balance: 0,
                                          synced_at: "1970-01-01 00:00:00",
                                      },
                                  ]
                                : FIXTURES[pipe],
                    }),
                );
            }),
        );

        await expect(loadAll()).rejects.toThrow(
            "economics_user_balances_api: expected one populated D1 snapshot row",
        );
    });
});

describe("canonicalVendor", () => {
    it("normalizes the Vast Pollen alias", () => {
        expect(canonicalVendor("vast.ai")).toBe("vast");
    });

    it("joins Bedrock usage to AWS billing", () => {
        expect(canonicalVendor("bedrock")).toBe("aws");
        expect(canonicalVendor("aws-bedrock")).toBe("aws");
    });

    it("joins account-specific aliases to their provider", () => {
        expect(canonicalVendor("azure-2")).toBe("azure");
        expect(canonicalVendor("vastai")).toBe("vast");
    });

    it("leaves canonical vendors unchanged", () => {
        expect(canonicalVendor("openai")).toBe("openai");
    });
});

describe("canonicalPollenRows", () => {
    const pollen = (
        vendor: string,
        overrides: Partial<OpPollenRow> = {},
    ): OpPollenRow => ({
        month: "2026-07",
        vendor,
        model: "nova",
        currency: "USD",
        cost_paid: 1,
        cost_quests: 2,
        price_paid: 3,
        price_quests: 4,
        byop_paid: 0,
        byop_quests: 0,
        model_paid: 0,
        model_quests: 0,
        requests_paid: 5,
        requests_quests: 6,
        ...overrides,
    });

    it.each([
        ["aws", "bedrock"],
        ["vast", "vast.ai"],
    ])(
        "aggregates %s and historical %s usage together",
        (canonical, historical) => {
            const [row] = canonicalPollenRows([
                pollen(canonical),
                pollen(historical, { cost_paid: 10, requests_paid: 20 }),
            ]);

            expect(row).toMatchObject({
                vendor: canonical,
                cost_paid: 11,
                cost_quests: 4,
                requests_paid: 25,
                requests_quests: 12,
            });
        },
    );

    it("re-attributes reviewed Pollen rows to the vendor whose bill carried them", () => {
        // gptimage was tagged azure-2 (Pointflyer) through April 2026 while its
        // gpt-image-1-mini deployments were billed on our own subscription.
        const rows = canonicalPollenRows([
            pollen("pointsflyer", { month: "2026-02", model: "gptimage" }),
            pollen("pointsflyer", { month: "2026-02", model: "openai" }),
            pollen("pointsflyer", { month: "2026-05", model: "gptimage" }),
        ]);

        expect(
            rows.map((row) => `${row.month}|${row.vendor}|${row.model}`),
        ).toEqual([
            "2026-05|pointsflyer|gptimage",
            "2026-02|azure|gptimage",
            "2026-02|pointsflyer|openai",
        ]);
    });

    it("corrects the confirmed ACE-Step host only within the reviewed month", () => {
        const source = [
            pollen("self-hosted", { month: "2026-04", model: "acestep" }),
            pollen("lambda", { month: "2026-04", model: "acestep" }),
            pollen("self-hosted", { month: "2026-03", model: "acestep" }),
            pollen("self-hosted", {
                month: "2026-04",
                model: "other-workload",
            }),
        ];
        const before = JSON.stringify(source);
        const rows = canonicalPollenRows(source);
        const merged = rows.find(
            (row) => row.month === "2026-04" && row.vendor === "lambda",
        );
        expect(merged).toMatchObject({
            model: "acestep",
            price_paid: 6,
            price_quests: 8,
            requests_paid: 10,
            requests_quests: 12,
        });
        expect(rows).toContainEqual(
            expect.objectContaining({
                month: "2026-03",
                vendor: "self-hosted",
                model: "acestep",
            }),
        );
        expect(rows).toContainEqual(
            expect.objectContaining({
                month: "2026-04",
                vendor: "self-hosted",
                model: "other-workload",
            }),
        );
        expect(JSON.stringify(source)).toBe(before);
    });

    it("removes rows with no values or requests", () => {
        expect(
            canonicalPollenRows([
                pollen("aws", {
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
                }),
            ]),
        ).toEqual([]);
    });
});

it("loads non-posting statement facts from Vendor without treating them as usage", async () => {
    const usage = FIXTURES.economics_vendor_ledger_api[0] as VendorLedgerRow;
    const statement = {
        ...usage,
        entry_id: "source-statement",
        type: "statement",
        paid: 0,
        credit: 0,
        statement_amount: 55.8,
        compared_entry_ids: [usage.entry_id],
        comparison_basis: "cost",
        comparison_month: "2026-09",
    };
    vi.stubGlobal(
        "fetch",
        vi.fn(() =>
            Promise.resolve(Response.json({ data: [usage, statement] })),
        ),
    );
    const result = await loadAll(["vendorLedger"]);
    expect(result.vendorLedger).toHaveLength(1);
    expect(result.vendorStatements).toHaveLength(1);
    expect(result.vendorStatements?.[0].statement_amount).toBe(55.8);
    expect(() =>
        validatePipeRows("economics_vendor_ledger_api", [
            { ...statement, paid: -55.8 },
        ]),
    ).toThrow("invalid source comparison");
});
