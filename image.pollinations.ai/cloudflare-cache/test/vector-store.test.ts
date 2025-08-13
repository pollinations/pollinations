import { env } from "cloudflare:test";
import { test as baseTest, describe, expect } from "vitest";
import type { EmbeddingService } from "../src/embedding-service.ts";
import {
    createEmbeddingService,
    variableThreshold,
} from "../src/embedding-service.ts";
import { cosineSimilarity } from "./util.ts";
const test = baseTest.extend<{ embed: EmbeddingService }>({
    embed: async ({ task: _ }, use) => {
        await use(createEmbeddingService(env.AI));
    },
});

test("Similar prompts produce a cache hit", async () => {});
