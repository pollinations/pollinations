import { describe, expect, it } from "vitest";
import type { OpForecastRow, OpTransactionRow } from "../types";
import {
    categoryLabel,
    cloudCategory,
    forecastCategory,
    runwayLineItem,
    transactionCategory,
} from "./categories";

const transaction = (
    vendor: string,
    category: string,
    description = vendor,
    amount = -10,
): OpTransactionRow => ({
    entry_id: `${vendor}-${description}`,
    kind: "transaction",
    source: "wise",
    date: "2026-07-01",
    vendor,
    category,
    amount,
    currency: "USD",
    description,
    evidence: "",
    recorded_at: "2026-08-01 00:00:00",
});

describe("canonical categories", () => {
    it("uses the agreed vendor decisions instead of legacy accounting buckets", () => {
        expect(transactionCategory(transaction("protonvpn", "saas"))).toBe(
            "operations",
        );
        expect(transactionCategory(transaction("retell", "saas"))).toBe(
            "compute",
        );
        expect(transactionCategory(transaction("vercel", "saas"))).toBe(
            "compute",
        );
        expect(transactionCategory(transaction("github", "cloud"))).toBe(
            "development",
        );
        expect(transactionCategory(transaction("lambda", "cloud"))).toBe(
            "compute",
        );
        expect(transactionCategory(transaction("openrouter", "cloud"))).toBe(
            "compute",
        );
        expect(transactionCategory(transaction("perplexity", "cloud"))).toBe(
            "compute",
        );
        expect(transactionCategory(transaction("tele2", "office"))).toBe(
            "operations",
        );
        expect(runwayLineItem("operations", "tele2")).toBe("Telecom");
    });

    it("separates human subscriptions from provider usage", () => {
        expect(
            transactionCategory(
                transaction("openai", "saas", "OpenAI - ChatGPT Subscription"),
            ),
        ).toBe("development");
        expect(
            transactionCategory(
                transaction("openai", "saas", "OpenAI API usage"),
            ),
        ).toBe("compute");
        expect(
            transactionCategory(
                transaction(
                    "anthropic",
                    "saas",
                    "Anthropic Claude Subscription",
                ),
            ),
        ).toBe("development");
        expect(
            transactionCategory(
                transaction("anthropic", "saas", "Anthropic API"),
            ),
        ).toBe("compute");
    });

    it("keeps mixed income vendors explicit", () => {
        expect(
            transactionCategory(
                transaction("github", "revenue", "GitHub Sponsors payout", 5),
            ),
        ).toBe("revenue");
        expect(
            transactionCategory(
                transaction("polar", "revenue", "Hubben Inc.", 100),
            ),
        ).toBe("revenue");
        expect(
            transactionCategory(
                transaction("polar", "balance_sheet", "Polar Myceli-Ai", -5),
            ),
        ).toBe("balance_sheet");
    });

    it("keeps personal purchases paid by the company out of expenses", () => {
        expect(
            transactionCategory(
                transaction("self-issued", "cloud", "Personal Pollen pack"),
            ),
        ).toBe("balance_sheet");
        expect(categoryLabel("balance_sheet")).toBe("Cash adjustments");
    });

    it("folds office merchants into stable runway line items", () => {
        expect(runwayLineItem("office", "gaswerksiedlung")).toBe(
            "Rent & utilities",
        );
        expect(runwayLineItem("office", "naturenergie")).toBe(
            "Rent & utilities",
        );
        expect(runwayLineItem("office", "space-berlin")).toBe("Food & drink");
        expect(runwayLineItem("office", "denns-biomarkt")).toBe("Food & drink");
        expect(runwayLineItem("office", "zara-home")).toBe(
            "Furniture & equipment",
        );
        expect(runwayLineItem("office", "amazon")).toBe(
            "Furniture & equipment",
        );
        expect(runwayLineItem("office", "barbara-khamouguinoff")).toBe(
            "Cleaning",
        );
    });

    it("names admin runway lines by purpose instead of counterparty", () => {
        expect(runwayLineItem("admin", "enty")).toBe("Accounting & filings");
        expect(runwayLineItem("admin", "estonia")).toBe("Taxes");
    });

    it("keeps grants and investments out of operating revenue", () => {
        expect(
            transactionCategory(
                transaction(
                    "investment",
                    "revenue",
                    "Mercatus startup grant",
                    9_993.89,
                ),
            ),
        ).toBe("balance_sheet");
    });

    it("treats the bank opening anchor as a non-movement", () => {
        expect(
            transactionCategory({
                ...transaction("wise", "revenue", "Opening balance", 10_000),
                kind: "opening_balance",
            }),
        ).toBe("balance_sheet");
    });

    it("collapses technical cloud types into the shared business category", () => {
        expect(cloudCategory({ type: "inference" })).toBe("compute");
        expect(cloudCategory({ type: "gpu" })).toBe("compute");
        expect(cloudCategory({ type: "infra" })).toBe("infrastructure");
        expect(cloudCategory({ type: "mystery" })).toBe("uncategorized");
    });

    it("trusts the reviewed category on forecast facts", () => {
        const fact: OpForecastRow = {
            entry_id: "deel-refund",
            month: "2026-08-01",
            vendor: "deel",
            category: "balance_sheet",
            amount: 12_036.42,
            currency: "EUR",
            method: "one_off",
            source: "agent",
            evidence: "Deel deposit refund",
            recorded_at: "2026-08-24 00:00:00",
        };
        const openAiFact: OpForecastRow = {
            ...fact,
            vendor: "openai",
            category: "development",
            amount: -200,
            evidence: "Subscription invoice",
        };

        expect(forecastCategory(fact)).toBe("balance_sheet");
        expect(forecastCategory(openAiFact)).toBe("development");
    });

    it("does not infer a forecast category from vendor or evidence", () => {
        const fact: OpForecastRow = {
            entry_id: "legacy-openai",
            month: "2026-08-01",
            vendor: "openai",
            category: "saas",
            amount: -200,
            currency: "USD",
            method: "fixed",
            source: "agent",
            evidence: "Subscription invoice",
            recorded_at: "2026-08-24 00:00:00",
        };

        expect(forecastCategory(fact)).toBe("uncategorized");
    });

    it("labels only the canonical vocabulary", () => {
        expect(categoryLabel("development")).toBe("Development");
        expect(categoryLabel("uncategorized")).toBe("Uncategorized");
    });
});
