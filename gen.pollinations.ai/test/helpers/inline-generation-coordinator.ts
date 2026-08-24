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
                    const authorization =
                        await coordinated.ENTER_BILLING.authorize(
                            job.billingRequest.token,
                            job.billingRequest.authorization,
                        );
                    if (!authorization.ok) {
                        throw new Error(authorization.error);
                    }
                    try {
                        const execution = await executeGeneration(
                            new Request(job.request.url, {
                                method: job.request.method,
                                headers: job.request.headers,
                                body: job.request.body?.slice().buffer,
                            }),
                            job.auth,
                            job.requestId,
                            job.balanceCheckResult,
                            authorization.grant.id,
                            coordinated,
                        );
                        await execution.settlement;
                        return execution.result;
                    } catch (error) {
                        await coordinated.ENTER_BILLING.cancel(
                            authorization.grant.id,
                        );
                        throw error;
                    }
                },
            } as never;
        },
    } as never;
    return coordinated;
}
