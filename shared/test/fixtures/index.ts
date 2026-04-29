import { test as base } from "vitest";
import { createTestApiKey } from "./api-keys.ts";

type SharedFixtures = {
    apiKey: string;
    paidApiKey: string;
    pubApiKey: string;
    restrictedApiKey: string;
    exhaustedBudgetApiKey: string;
    budgetedApiKey: { key: string; id: string; userId: string };
};

export const test = base.extend<SharedFixtures>({
    // biome-ignore lint/correctness/noEmptyPattern: vitest fixture pattern requires object destructuring
    apiKey: async ({}, use) => {
        const { key } = await createTestApiKey();
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
            metadata: { createdForApp: "test" },
        });
        await use(key);
    },
    // biome-ignore lint/correctness/noEmptyPattern: vitest fixture pattern requires object destructuring
    restrictedApiKey: async ({}, use) => {
        const { key } = await createTestApiKey({
            name: "restricted-test-key",
            allowedModels: ["openai-fast", "flux"],
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
});

export { createTestApiKey, createTestUser } from "./api-keys.ts";
