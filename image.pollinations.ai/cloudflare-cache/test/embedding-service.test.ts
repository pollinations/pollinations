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

test("cosineSimilarity should return the same results as the embedding model", async ({
    embed,
}) => {
    const [promptA, promptB] = [
        "A biig shark wearing a tuxedo.",
        "A biiig shark wearing a tuxedo.",
    ];

    const [ra, rb] = await Promise.all([embed(promptA), embed(promptB)]);
    const testSimilarityResult = cosineSimilarity(ra, rb);

    const cloudflareSimilarityResult = (await env.AI.run("@cf/baai/bge-m3", {
        query: promptA,
        contexts: [{ text: promptB }],
    })) as BGEM3OuputQuery;

    expect(testSimilarityResult).toBeCloseTo(
        cloudflareSimilarityResult.response[0].score,
    );
});

test("Similar prompts create high semantic similarity", async ({ embed }) => {
    const [promptA, promptB] = [
        "A biig shark wearing a tuxedo.",
        "A biiig shark wearing a tuxedo.",
    ];
    const [ra, rb] = await Promise.all([embed(promptA), embed(promptB)]);
    expect(cosineSimilarity(ra, rb)).toBeGreaterThan(
        variableThreshold(
            promptA.length,
            env.SEMANTIC_THRESHOLD_SHORT,
            env.SEMANTIC_THRESHOLD_LONG,
        ),
    );
    console.log(cosineSimilarity(ra, rb));
});

test("Variable threshold function should work as expected", async () => {
    expect(variableThreshold(1, 0.95, 0.995)).toBe(0.95);
    expect(variableThreshold(20, 0.95, 0.995)).toBe(0.95);
    expect(variableThreshold(400, 0.95, 0.995)).toBe(0.995);
    expect(variableThreshold(4000, 0.95, 0.995)).toBe(0.995);
});

describe("Slight differences with important implications should be below threshold", () => {
    test("short prompts", async ({ embed }) => {
        const promptA = "A blue sports car, racing in Tokyo.";
        const promptB = "A grey sports car, racing in Tokyo.";
        const [ra, rb] = await Promise.all([embed(promptA), embed(promptB)]);
        expect(cosineSimilarity(ra, rb)).toBeLessThan(
            variableThreshold(
                promptA.length,
                env.SEMANTIC_THRESHOLD_SHORT,
                env.SEMANTIC_THRESHOLD_LONG,
            ),
        );
        console.log(cosineSimilarity(ra, rb));
    });

    test("medium prompts", async ({ embed }) => {
        const promptA = `A hyper-realistic and atmospheric photo of a sleek, modified blue Nissan GT-R R35 sports car, mid-drift around a sharp, wet corner on a narrow street in Shinjuku, Tokyo. The scene is at night, during a heavy downpour, with rain splashing and creating visible droplets in the air. The car's tires are smoking, and its aggressive angle of attack suggests high speed and controlled chaos.`;

        const promptB = `A hyper-realistic and atmospheric photo of a sleek, modified grey Nissan GT-R R35 sports car, mid-drift around a sharp, wet corner on a narrow street in Shinjuku, Tokyo. The scene is at night, during a heavy downpour, with rain splashing and creating visible droplets in the air. The car's tires are smoking, and its aggressive angle of attack suggests high speed and controlled chaos.`;

        const [ra, rb] = await Promise.all([embed(promptA), embed(promptB)]);
        expect(cosineSimilarity(ra, rb)).toBeLessThan(
            variableThreshold(
                promptA.length,
                env.SEMANTIC_THRESHOLD_SHORT,
                env.SEMANTIC_THRESHOLD_LONG,
            ),
        );
        console.log(cosineSimilarity(ra, rb));
    });

    test("long prompts", async ({ embed }) => {
        const promptA = `A hyper-realistic and atmospheric photo of a sleek, modified blue Nissan GT-R R35 sports car, mid-drift around a sharp, wet corner on a narrow street in Shinjuku, Tokyo. The scene is at night, during a heavy downpour, with rain splashing and creating visible droplets in the air. The car's tires are smoking, and its aggressive angle of attack suggests high speed and controlled chaos. The asphalt is dark and reflective, mirroring the vibrant, oversaturated neon signs from the surrounding buildings.`;

        const promptB = `A hyper-realistic and atmospheric photo of a sleek, modified grey Nissan GT-R R35 sports car, mid-drift around a sharp, wet corner on a narrow street in Shinjuku, Tokyo. The scene is at night, during a heavy downpour, with rain splashing and creating visible droplets in the air. The car's tires are smoking, and its aggressive angle of attack suggests high speed and controlled chaos. The asphalt is dark and reflective, mirroring the vibrant, oversaturated neon signs from the surrounding buildings.`;

        const [ra, rb] = await Promise.all([embed(promptA), embed(promptB)]);
        expect(cosineSimilarity(ra, rb)).toBeLessThan(
            variableThreshold(
                promptA.length,
                env.SEMANTIC_THRESHOLD_SHORT,
                env.SEMANTIC_THRESHOLD_LONG,
            ),
        );
        console.log(cosineSimilarity(ra, rb));
    });
});
