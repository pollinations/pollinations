import { DurableObject } from "cloudflare:workers";
import { readResponseText } from "../../shared/response-bytes.ts";

// One object for all Wikimedia languages and APIs, shared by live environments.
// No queue: callers receive a retry time instead of accumulating pending work.
export class WikimediaSource extends DurableObject {
    busy = false;
    nextAllowedAt = 0;

    constructor(ctx, env) {
        super(ctx, env);
        ctx.blockConcurrencyWhile(async () => {
            this.nextAllowedAt = (await ctx.storage.get("nextAllowedAt")) ?? 0;
        });
    }

    async fetchJson(value) {
        const url = new URL(value);
        if (
            url.protocol !== "https:" ||
            url.port ||
            url.username ||
            url.password ||
            !/^(?:[a-z]{2,12}(?:-[a-z]{2,12})?\.wikipedia\.org|en\.wiktionary\.org)$/.test(
                url.hostname,
            )
        ) {
            throw new Error("Unsupported research source.");
        }
        const started = Date.now();
        if (this.busy || started < this.nextAllowedAt) {
            throw new Error(
                `Wikimedia is busy. Retry in ${Math.max(1, Math.ceil((this.nextAllowedAt - started) / 1000))} seconds.`,
            );
        }
        this.busy = true;
        const deadline = started + 10_000;
        // Persist the whole in-flight reservation before network I/O. A restart
        // cannot admit another request while the old fetch may still be running.
        this.nextAllowedAt = deadline + 5_000;
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), deadline - started);
        let response;
        let pauseUntil = 0;
        try {
            await this.ctx.storage.put("nextAllowedAt", this.nextAllowedAt);
            if (Date.now() >= deadline)
                throw new Error("Source deadline exceeded.");
            response = await fetch(url, {
                headers: {
                    "User-Agent":
                        "PollinationsResearch/0.1 (hello@pollinations.ai)",
                    Accept: "application/json",
                },
                redirect: "follow",
                signal: controller.signal,
            });
            if (response.status === 429 || response.status === 503) {
                const retry = response.headers.get("retry-after");
                const seconds = retry === null ? Number.NaN : Number(retry);
                const until =
                    Number.isFinite(seconds) && seconds >= 0
                        ? Date.now() + seconds * 1000
                        : Date.parse(retry ?? "");
                pauseUntil = Math.max(
                    Date.now() + 5_000,
                    Number.isFinite(until) ? until : 0,
                );
            }
            if (!response.ok) {
                throw new Error(
                    `Source returned HTTP ${response.status}.${pauseUntil ? ` Retry in ${Math.ceil((pauseUntil - Date.now()) / 1000)} seconds.` : ""}`,
                );
            }
            return JSON.parse(
                await readResponseText(
                    response,
                    512 * 1024,
                    () => new Error("Source response exceeds 512 KiB."),
                ),
            );
        } finally {
            controller.abort();
            clearTimeout(timer);
            await response?.body?.cancel().catch(() => {});
            const gap =
                url.pathname === "/w/api.php" && Date.now() - started > 1000
                    ? 5_000
                    : 500;
            this.nextAllowedAt = Math.max(pauseUntil, Date.now() + gap);
            try {
                await this.ctx.storage.put("nextAllowedAt", this.nextAllowedAt);
            } finally {
                this.busy = false;
            }
        }
    }
}
