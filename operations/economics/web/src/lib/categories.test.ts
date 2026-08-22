import { describe, expect, it } from "vitest";
import type { OpTransactionRow } from "../types";
import {
    categoryLabel,
    cloudCategory,
    transactionCategory,
} from "./categories";

const transaction = (
    vendor: string,
    category: string,
    description = vendor,
    amount = -10,
): OpTransactionRow => ({
    entry_id: `${vendor}-${description}`,
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
                transaction("polar", "admin", "Polar Myceli-Ai", -5),
            ),
        ).toBe("admin");
    });

    it("collapses technical cloud types into the shared business category", () => {
        expect(cloudCategory({ type: "inference" })).toBe("compute");
        expect(cloudCategory({ type: "gpu" })).toBe("compute");
        expect(cloudCategory({ type: "infra" })).toBe("infrastructure");
        expect(cloudCategory({ type: "mystery" })).toBe("uncategorized");
    });

    it("labels only the canonical vocabulary", () => {
        expect(categoryLabel("development")).toBe("Development");
        expect(categoryLabel("uncategorized")).toBe("Uncategorized");
    });
});
