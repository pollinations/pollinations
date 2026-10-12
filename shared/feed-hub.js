import { DurableObject } from "cloudflare:workers";

const encoder = new TextEncoder();

/**
 * The public /feed of one legacy API: every connected listener gets each event
 * published while it stays connected, as the VM's in-memory listener list did.
 * One object per API; nothing is stored, so a restart drops the listeners as a
 * VM restart did.
 */
export class FeedHub extends DurableObject {
    writers = new Set();

    /** A listener's request: its response streams the events */
    fetch() {
        const { readable, writable } = new TransformStream();
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
            writer.write(bytes).catch(() => this.writers.delete(writer));
        }
    }
}
