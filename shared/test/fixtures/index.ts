import { test as base, vi } from "vitest";
import { TINYBIRD_HOST } from "../../registry/model-health.ts";
import { createTestApiKey } from "./api-keys.ts";

export const RESTRICTED_TEXT_TEST_MODEL = "openai/gpt-5-nano" as const;
export const RESTRICTED_IMAGE_TEST_MODEL =
    "black-forest-labs/flux.1-schnell" as const;
export const RESTRICTED_TEST_MODELS = [
    RESTRICTED_TEXT_TEST_MODEL,
    RESTRICTED_IMAGE_TEST_MODEL,
] as const;

type SharedFixtures = {
    apiKey: string;
    paidApiKey: string;
    pubApiKey: string;
    restrictedApiKey: string;
    exhaustedBudgetApiKey: string;
    budgetedApiKey: { key: string; id: string; userId: string };
    /**
     * Serves a canned Tinybird model_health response for catalog health
     * tests, or simulates a full monitoring outage when given null.
     * Intercepts the fetch call before the worker's snapshot cache, so each
     * call sees fresh data. Returns a cleanup function.
     */
    bypassHealthCache: (
        data: { data: unknown[] } | null,
    ) => Promise<() => void>;
};

export const test = base.extend<SharedFixtures>({
    // biome-ignore lint/correctness/noEmptyPattern: vitest fixture pattern requires object destructuring
    apiKey: async ({}, use) => {
        const { key } = await createTestApiKey({
            user: { tierBalance: 100, packBalance: 0 },
        });
        await use(key);
    },
    // biome-ignore lint/correctness/noEmptyPattern: vitest fixture pattern requires object destructuring
    paidApiKey: async ({}, use) => {
        const { key } = await createTestApiKey({
            name: "paid-test-api-key",
            user: { packBalance: 100 },
        });
        await use(key);
    },
    // biome-ignore lint/correctness/noEmptyPattern: vitest fixture pattern requires object destructuring
    pubApiKey: async ({}, use) => {
        const { key } = await createTestApiKey({
            name: "publishable-test-key",
            type: "publishable",
        });
        await use(key);
    },
    // biome-ignore lint/correctness/noEmptyPattern: vitest fixture pattern requires object destructuring
    restrictedApiKey: async ({}, use) => {
        const { key } = await createTestApiKey({
            name: "restricted-test-api-key",
            allowedModels: [...RESTRICTED_TEST_MODELS],
        });
        await use(key);
    },
    // biome-ignore lint/correctness/noEmptyPattern: vitest fixture pattern requires object destructuring
    exhaustedBudgetApiKey: async ({}, use) => {
        const { key } = await createTestApiKey({
            name: "exhausted-budget-key",
            pollenBudget: 0,
        });
        await use(key);
    },
    // biome-ignore lint/correctness/noEmptyPattern: vitest fixture pattern requires object destructuring
    budgetedApiKey: async ({}, use) => {
        const { key, id, userId } = await createTestApiKey({
            name: "budgeted-test-key",
            pollenBudget: 100,
        });
        await use({ key, id, userId });
    },
    // biome-ignore lint/correctness/noEmptyPattern: vitest fixture pattern requires object destructuring
    bypassHealthCache: async ({}, use) => {
        const healthData: ({ data: unknown[] } | null)[] = [null];
        const realFetch = globalThis.fetch;
        const spy = vi
            .spyOn(globalThis, "fetch")
            .mockImplementation(async (input) => {
                if (
                    String(input).startsWith(
                        `${TINYBIRD_HOST}/v0/pipes/model_health`,
                    )
                ) {
                    const data = healthData[0];
                    if (data === null) {
                        return new Response("tinybird unavailable", {
                            status: 503,
                        });
                    }
                    return Response.json(data);
                }
                return realFetch(input);
            });
        await use(async (data) => {
            healthData[0] = data;
            return () => {
                healthData[0] = null;
                spy.mockRestore();
            };
        });
        spy.mockRestore();
    },
});

export { createTestApiKey, createTestUser } from "./api-keys.ts";
