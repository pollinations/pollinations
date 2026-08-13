import type { GenerationJob } from "@/middleware/generation-deduplication.ts";
import { executeGeneration } from "@/utils/execute-generation.ts";

/** Keeps provider mocks in one isolate while exercising the real middleware. */
export function withInlineGenerationCoordinator(
    bindings: CloudflareBindings,
): CloudflareBindings {
    const coordinated = { ...bindings } as CloudflareBindings;
    coordinated.GENERATION_COORDINATOR = {
        getByName() {
            return {
                async startAndWait(job: GenerationJob) {
                    const execution = await executeGeneration(
                        new Request(job.request.url, {
                            method: job.request.method,
                            headers: job.request.headers,
                            body: job.request.body,
                        }),
                        job.auth,
                        coordinated,
                    );
                    await execution.settlement;
                    return {
                        role: "owner" as const,
                        outcome: execution.result,
                    };
                },
            } as never;
        },
    } as never;
    return coordinated;
}
