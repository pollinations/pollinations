import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import type {
    GenerationCoordinatorStatus,
    GenerationJob,
} from "@/utils/idempotent-generation.ts";

type CoordinatorStub = {
    start(job: GenerationJob): Promise<{ role: "owner" | "joiner" }>;
    getStatus(): Promise<GenerationCoordinatorStatus>;
};

describe("GenerationCoordinator", () => {
    it("runs alarms through the loopback executor without a public route", async () => {
        const stub = env.GENERATION_COORDINATOR?.getByName(
            `test-${crypto.randomUUID()}`,
        ) as unknown as CoordinatorStub;
        const job: GenerationJob = {
            request: {
                url: "https://gen.pollinations.ai/robots.txt",
                method: "GET",
                headers: [],
            },
            auth: {
                user: { id: "user-1", tier: "seed" },
                apiKey: { id: "key-1" },
            },
        };

        expect(await stub.start(job)).toEqual({ role: "owner" });
        let status = await stub.getStatus();
        for (
            let attempt = 0;
            attempt < 100 && status.status !== "failed";
            attempt += 1
        ) {
            await new Promise((resolve) => setTimeout(resolve, 10));
            status = await stub.getStatus();
        }

        expect(status).toMatchObject({
            status: "failed",
            response: { status: 502, retryable: true },
        });
    });
});
