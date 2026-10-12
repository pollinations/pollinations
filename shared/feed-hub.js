import { DurableObject } from "cloudflare:workers";

const encoder = new TextEncoder();
// Unsent bytes after which a listener counts as stalled and gets no more
// events: the VM buffered without limit, but an object has 128 MB for all its
// listeners
export const MAX_BACKLOG_BYTES = 1_000_000;

/**
 * The public /feed of one legacy API: every connected listener gets each event
 * published while it stays connected, as the VM's in-memory listener list did,
 * until more than MAX_BACKLOG_BYTES wait unsent.
 * One object per API; nothing is stored, so a restart drops the listeners as a
 * VM restart did.
 */
export class FeedHub extends DurableObject {
    writers = new Set();

    /** A listener's request: its response streams the events */
    fetch() {
        const { readable, writable } = new TransformStream(
            undefined,
            new ByteLengthQueuingStrategy({ highWaterMark: MAX_BACKLOG_BYTES }),
        );
        const writer = writable.getWriter();
        this.writers.add(writer);
        // A listener that leaves cancels the response body, which errors the writer
        writer.closed.catch(() => this.writers.delete(writer));
        return new Response(readable);
    }

    /** @param {string} line one server-sent event, "data: ...\n\n" */
    publish(line) {
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
