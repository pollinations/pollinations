import { DurableObject } from "cloudflare:workers";

const encoder = new TextEncoder();
// Unsent bytes after which a listener counts as stalled and gets no more
// events: the VM buffered without limit, but an object has 128 MB for all its
// listeners
export const MAX_BACKLOG_BYTES = 1_000_000;
// The image VM kept its last 50 events and replayed the last past_results
// (default 20) of them to each new listener
const MAX_HISTORY = 50;
const DEFAULT_REPLAY = 20;

/**
 * The public /feed of one legacy API: every connected listener gets each event
 * published while it stays connected, as the VM's in-memory listener list did,
 * until more than MAX_BACKLOG_BYTES wait unsent. Events published with `keep`
 * are also replayed to new listeners (image only).
 * One object per API; nothing is stored, so a restart drops the listeners and
 * the replay as a VM restart did.
 */
export class FeedHub extends DurableObject {
    writers = new Set();
    // Kept events, oldest first; null for one no listener gets
    history = [];

    /** A listener's request: its response streams the events */
    fetch(request) {
        const { readable, writable } = new TransformStream(
            undefined,
            new ByteLengthQueuingStrategy({ highWaterMark: MAX_BACKLOG_BYTES }),
        );
        const writer = writable.getWriter();
        const replay =
            Number.parseInt(
                new URL(request.url).searchParams.get("past_results"),
            ) || DEFAULT_REPLAY;
        for (const line of this.history.slice(-replay)) {
            if (line !== null)
                writer.write(encoder.encode(line)).catch(() => {});
        }
        this.writers.add(writer);
        // A listener that leaves cancels the response body, which errors the writer
        writer.closed.catch(() => this.writers.delete(writer));
        return new Response(readable);
    }

    /**
     * @param {string | null} line one server-sent event, "data: ...\n\n", or
     *   null for a kept event that no listener gets
     * @param {boolean} [keep] whether new listeners get it replayed
     */
    publish(line, keep = false) {
        if (keep) {
            this.history.push(line);
            if (this.history.length > MAX_HISTORY) this.history.shift();
        }
        if (line === null) return;
        const bytes = encoder.encode(line);
        for (const writer of this.writers) {
            // A stalled listener's stream ends after what it already has, so
            // it may reconnect. Ending it with an error would drop that
            // backlog sooner, but leaves rejections in the runtime's own pipe.
            if (writer.desiredSize < 0) {
                this.writers.delete(writer);
                writer.close().catch(() => {});
                continue;
            }
            writer.write(bytes).catch(() => this.writers.delete(writer));
        }
    }
}
