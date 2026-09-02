import { afterEach, describe, expect, it, vi } from "vitest";
import { FIXTURES, PRIVATE_CONFIG_FIXTURE } from "../fixtures";
import type { OpPollenRow } from "../types";
import {
    canonicalPollenRows,
    canonicalVendor,
    loadAll,
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
    it("requires and parses the authenticated private configuration", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn((input: RequestInfo | URL) => {
                const pipe = decodeURIComponent(
                    String(input).split("/").at(-1) ?? "",
                );
                return Promise.resolve(Response.json({ data: FIXTURES[pipe] }));
            }),
        );

        const result = await loadAll();

        expect(result.privateConfig).toEqual(PRIVATE_CONFIG_FIXTURE);
    });

    it("fails closed when the private configuration is absent", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn((input: RequestInfo | URL) => {
                const pipe = decodeURIComponent(
                    String(input).split("/").at(-1) ?? "",
                );
                return Promise.resolve(
                    Response.json({
                        data:
                            pipe === "economics_private_config_api"
                                ? []
                                : FIXTURES[pipe],
                    }),
                );
            }),
        );

        await expect(loadAll()).rejects.toThrow(
            "economics_private_config_api: expected one row, received 0",
        );
    });
});

describe("canonicalVendor", () => {
    it("normalizes the Vast Pollen alias", () => {
        expect(canonicalVendor("vast")).toBe("vast");
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

    it("aggregates aliases after canonicalization", () => {
        const [row] = canonicalPollenRows([
            pollen("aws"),
            pollen("bedrock", { cost_paid: 10, requests_paid: 20 }),
        ]);

        expect(row).toMatchObject({
            vendor: "aws",
            cost_paid: 11,
            cost_quests: 4,
            requests_paid: 25,
            requests_quests: 12,
        });
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
