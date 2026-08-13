import { env, runDurableObjectAlarm } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import type {
    GenerationJob,
    GenerationOutcome,
} from "@/middleware/generation-deduplication.ts";

type CoordinatorStub = {
    startAndWait(job: GenerationJob): Promise<{
        role: "owner" | "joiner";
        outcome: GenerationOutcome;
    }>;
};

function testJob(key: string, body?: string): GenerationJob {
    return {
        cache: { storage: "text", key },
        request: {
            url: "https://gen.pollinations.ai/robots.txt",
            method: body === undefined ? "GET" : "POST",
            headers: [],
            ...(body !== undefined && { body }),
        },
        auth: {
            user: { id: "user-1", tier: "seed" },
            apiKey: { id: "key-1" },
        },
    };
}

describe("GenerationCoordinator", () => {
    it("admits one owner and one joiner for the same cache identity", async () => {
        const stub = env.GENERATION_COORDINATOR.getByName(
            `test-${crypto.randomUUID()}`,
        ) as unknown as CoordinatorStub;
        const job = testJob(`missing-${crypto.randomUUID()}`);

        const owner = stub.startAndWait(job);
        const joiner = stub.startAndWait(job);
        await new Promise((resolve) => setTimeout(resolve, 0));
        await runDurableObjectAlarm(stub as never);

        const results = await Promise.all([owner, joiner]);
        expect(results.map((result) => result.role).sort()).toEqual([
            "joiner",
            "owner",
        ]);
        expect(
            results.every((result) => result.outcome.status === "failed"),
        ).toBe(true);
    });

    it("persists request bodies larger than one storage value", async () => {
        const stub = env.GENERATION_COORDINATOR.getByName(
            `test-${crypto.randomUUID()}`,
        ) as unknown as CoordinatorStub;
        const result = stub.startAndWait(
            testJob(`large-${crypto.randomUUID()}`, "x".repeat(2_100_000)),
        );
        await new Promise((resolve) => setTimeout(resolve, 0));
        await runDurableObjectAlarm(stub as never);

        expect((await result).outcome.status).toBe("failed");
    });
});
