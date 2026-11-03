import type {
    GenerationJob,
    GenerationJobHead,
} from "@/middleware/generation-deduplication.ts";
import { executeGeneration } from "@/utils/execute-generation.ts";

/** Keeps provider mocks in one isolate while exercising the real middleware. */
export function withInlineGenerationCoordinator(
    bindings: CloudflareBindings,
): CloudflareBindings {
    const coordinated = { ...bindings } as CloudflareBindings;
    const active = new Map<string, ReturnType<typeof executeGeneration>>();
    coordinated.GENERATION_COORDINATOR = {
        getByName(name: string) {
            return {
                async startAndWait(
                    head: GenerationJobHead,
                    body?: ReadableStream<Uint8Array>,
                ) {
                    let execution = active.get(name);
                    if (!execution) {
                        // Register before reading the body, as the real
                        // coordinator does, so concurrent joiners share it.
                        execution = (async () => {
                            const job: GenerationJob = body
                                ? {
                                      ...head,
                                      request: {
                                          ...head.request,
                                          body: new Uint8Array(
                                              await new Response(
                                                  body,
                                              ).arrayBuffer(),
                                          ),
                                      },
                                  }
                                : head;
                            return executeGeneration(job, coordinated);
                        })();
                        active.set(name, execution);
                    } else {
                        await body?.cancel();
                    }
                    try {
                        const completed = await execution;
                        await completed.settlement;
                        return completed.result;
                    } finally {
                        if (active.get(name) === execution) {
                            active.delete(name);
                        }
                    }
                },
            } as never;
        },
    } as never;
    return coordinated;
}
