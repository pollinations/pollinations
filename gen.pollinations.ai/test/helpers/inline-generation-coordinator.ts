import type {
    GenerationCacheIdentity,
    GenerationErrorSnapshot,
    GenerationJob,
    GenerationJobHead,
    GenerationOutcome,
} from "@/middleware/generation-deduplication.ts";
import { executeGeneration } from "@/utils/execute-generation.ts";

type InlineSubmission = {
    cache: GenerationCacheIdentity;
    owners: Set<string>;
    error?: GenerationErrorSnapshot;
};

async function cacheExists(
    bindings: CloudflareBindings,
    cache: GenerationCacheIdentity,
): Promise<boolean> {
    return cache.storage === "media"
        ? bindings.MEDIA.has(cache.key)
        : (await bindings.TEXT_BUCKET.head(cache.key)) !== null;
}

/** Keeps provider mocks in one isolate while exercising the real middleware. */
export function withInlineGenerationCoordinator(
    bindings: CloudflareBindings,
): CloudflareBindings {
    const coordinated = { ...bindings } as CloudflareBindings;
    const active = new Map<string, Promise<GenerationOutcome>>();
    const submissions = new Map<string, InlineSubmission>();

    // Runs (or joins) the one detached execution for a cache identity. The
    // promise settles only after the cache write, so a joiner that arrives
    // before that point still shares the single execution.
    async function run(
        name: string,
        head: GenerationJobHead,
        body?: ReadableStream<Uint8Array>,
    ): Promise<GenerationOutcome> {
        const running = active.get(name);
        if (running) {
            await body?.cancel();
            return running;
        }
        const job: GenerationJob = body
            ? {
                  ...head,
                  request: {
                      ...head.request,
                      body: new Uint8Array(
                          await new Response(body).arrayBuffer(),
                      ),
                  },
              }
            : head;
        const started = (async () => {
            const execution = await executeGeneration(job, coordinated);
            await execution.settlement;
            return execution.result;
        })();
        active.set(name, started);
        void started
            .finally(() => {
                if (active.get(name) === started) active.delete(name);
            })
            .catch(() => {});
        return started;
    }

    coordinated.GENERATION_COORDINATOR = {
        getByName(name: string) {
            return {
                async startAndWait(
                    head: GenerationJobHead,
                    body?: ReadableStream<Uint8Array>,
                ): Promise<GenerationOutcome> {
                    return run(name, head, body);
                },
                async submit(
                    head: GenerationJobHead,
                    body: ReadableStream<Uint8Array> | undefined,
                    owner: string,
                ) {
                    let record = submissions.get(name);
                    if (!record) {
                        record = { cache: head.cache, owners: new Set() };
                        submissions.set(name, record);
                    }
                    record.owners.add(owner);
                    if (await cacheExists(coordinated, head.cache)) {
                        await body?.cancel();
                        return {
                            state: "succeeded" as const,
                            cache: head.cache,
                        };
                    }
                    const outcome = run(name, head, body);
                    void outcome
                        .then((result) => {
                            if (result.status === "failed") {
                                record.error = result.error;
                            }
                        })
                        .catch(() => {});
                    return { state: "pending" as const };
                },
                async status(owner: string) {
                    const record = submissions.get(name);
                    if (!record?.owners.has(owner)) return null;
                    if (active.has(name)) return { state: "pending" as const };
                    if (record.error) {
                        return {
                            state: "failed" as const,
                            error: record.error,
                        };
                    }
                    if (!(await cacheExists(coordinated, record.cache))) {
                        return null;
                    }
                    return { state: "succeeded" as const, cache: record.cache };
                },
            };
        },
    } as never;
    return coordinated;
}
