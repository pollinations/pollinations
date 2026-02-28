import { DurableObject } from "cloudflare:workers";

const STALE_MS = 120_000; // 2min — consider processing request stale

/**
 * RequestDeduplicator Durable Object
 *
 * Cross-isolate inflight request deduplication — tracks only "processing" state.
 * Does NOT store responses. Concurrent duplicates wait until processing completes,
 * then fall through to the cache layer which will have the response.
 *
 * Flow:
 * 1. First request: checkRequest → {proceed: true}, origin runs, markDone()
 * 2. Concurrent duplicate: checkRequest → {waiting: true}, polls, sees idle → falls through → cache HIT
 * 3. Sequential request: checkRequest → {proceed: true} (no processing flag)
 */
export class RequestDeduplicator extends DurableObject {
    private processing = false;
    private timestamp = 0;

    constructor(ctx: DurableObjectState, env: CloudflareBindings) {
        super(ctx, env);

        ctx.blockConcurrencyWhile(async () => {
            const stored = await ctx.storage.get<{ timestamp: number }>(
                "processing",
            );
            if (stored) {
                this.processing = true;
                this.timestamp = stored.timestamp;
            }
        });
    }

    async checkRequest(): Promise<{ proceed: true } | { waiting: true }> {
        const now = Date.now();

        if (this.processing) {
            if (now - this.timestamp > STALE_MS) {
                // Stale — let this request take over
            } else {
                return { waiting: true };
            }
        }

        this.processing = true;
        this.timestamp = now;
        await this.ctx.storage.put("processing", { timestamp: now });
        return { proceed: true };
    }

    async markDone(): Promise<void> {
        this.processing = false;
        this.timestamp = 0;
        await this.ctx.storage.delete("processing");
    }
}
