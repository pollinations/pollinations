import { chunkText } from "./chunk.js";

/**
 * Turn a list of chunk summaries into one final markdown digest. Pure, so the
 * formatting can be tested without a network call.
 *
 * @param {object} input
 * @param {string[]} input.parts per-chunk summaries, in reading order
 * @param {string} [input.source] where the text came from
 * @param {number} [input.charCount] original size
 * @param {string} [input.model] model that produced the summaries
 * @returns {string} markdown
 */
export function formatDigest({ parts, source, charCount, model }) {
    const list = (parts || []).filter((p) => String(p ?? "").trim());
    if (!list.length) return "No content to summarise.";

    const head = [];
    if (source) head.push(`Source: ${source}`);
    if (charCount)
        head.push(`Read: ${charCount} characters in ${list.length} part(s)`);
    if (model) head.push(`Model: ${model}`);

    const body = list
        .map((part, index) =>
            list.length === 1
                ? String(part).trim()
                : `### Part ${index + 1}\n\n${String(part).trim()}`,
        )
        .join("\n\n");

    return head.length ? `${head.join(" · ")}\n\n${body}` : body;
}

/**
 * Validate the pieces a page fetch handed back before any model sees them.
 */
export function assertFetchable(url) {
    let parsed;
    try {
        parsed = new URL(url);
    } catch {
        throw new Error("Pass an absolute http(s) URL.");
    }
    if (!["http:", "https:"].includes(parsed.protocol)) {
        throw new Error("Only http(s) URLs can be read.");
    }
    return parsed;
}

export { chunkText };
