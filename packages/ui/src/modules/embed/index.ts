import { useEffect } from "react";

/**
 * Pollinations embed contract — lets a host page (e.g. `/play`) size its iframe
 * to the embedded app's content, so there is no scrollbar inside the iframe.
 *
 * Cross-origin frames can't read each other's DOM, so the embedded app reports
 * its own content height to the parent via `postMessage`, and the host listens.
 */

/** Tag identifying messages that belong to this contract. */
export const EMBED_MESSAGE_SOURCE = "polli-embed";

export interface EmbedHeightMessage {
    source: typeof EMBED_MESSAGE_SOURCE;
    type: "height";
    /** Content height in CSS pixels. */
    value: number;
}

/**
 * App side. When `enabled` and running inside a frame, observe the document's
 * content height and post it to the parent whenever it changes. No-op on the
 * server, when disabled, or when not framed.
 */
export function useReportEmbedHeight(enabled = true): void {
    useEffect(() => {
        if (!enabled || typeof window === "undefined") return;
        if (window.parent === window.self) return; // not embedded

        let frame = 0;
        let last = -1;

        const post = () => {
            frame = 0;
            const height = Math.ceil(document.documentElement.scrollHeight);
            if (height <= 0 || height === last) return;
            last = height;
            const message: EmbedHeightMessage = {
                source: EMBED_MESSAGE_SOURCE,
                type: "height",
                value: height,
            };
            window.parent.postMessage(message, "*");
        };

        const schedule = () => {
            if (frame) return;
            frame = window.requestAnimationFrame(post);
        };

        const observer = new ResizeObserver(schedule);
        observer.observe(document.body);
        window.addEventListener("load", schedule);
        schedule(); // initial report

        return () => {
            observer.disconnect();
            window.removeEventListener("load", schedule);
            if (frame) window.cancelAnimationFrame(frame);
        };
    }, [enabled]);
}

/**
 * Host side. Returns the reported content height when `event` is a valid embed
 * height message from one of `allowedOrigins`, otherwise `null`. Validates the
 * origin so arbitrary pages can't drive the iframe size.
 */
export function parseEmbedHeightMessage(
    event: MessageEvent,
    allowedOrigins: readonly string[],
): number | null {
    if (!allowedOrigins.includes(event.origin)) return null;
    const data = event.data as Partial<EmbedHeightMessage> | null;
    if (
        !data ||
        data.source !== EMBED_MESSAGE_SOURCE ||
        data.type !== "height" ||
        typeof data.value !== "number" ||
        !Number.isFinite(data.value) ||
        data.value <= 0
    ) {
        return null;
    }
    return data.value;
}
