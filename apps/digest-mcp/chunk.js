/**
 * Split long text into ordered, readable chunks for a summarisation pass.
 *
 * Plain string maths on purpose: no dependency, no tokeniser, and the same
 * result in Node and in a Worker.
 */

const DEFAULT_CHARS = 12000;

/**
 * Prefer to break on a paragraph, then a sentence, then a word, so a chunk
 * does not start mid-thought.
 */
function findBreak(text, start, end) {
    const window = text.slice(start, end);
    const floor = Math.floor(window.length * 0.6);
    for (const marker of ["\n\n", "\n", ". ", "? ", "! ", "; ", ", ", " "]) {
        const at = window.lastIndexOf(marker);
        if (at >= floor) return start + at + marker.length;
    }
    return end;
}

/**
 * @param {string} text
 * @param {number} [maxChars] soft upper bound per chunk
 * @returns {string[]} chunks in reading order, never empty strings
 */
export function chunkText(text, maxChars = DEFAULT_CHARS) {
    const clean = String(text ?? "")
        .replace(/\r\n?/g, "\n")
        .trim();
    if (!clean) return [];

    const size = Math.max(200, Math.floor(maxChars) || DEFAULT_CHARS);
    const chunks = [];
    let start = 0;
    while (start < clean.length) {
        let end = Math.min(start + size, clean.length);
        if (end < clean.length) end = findBreak(clean, start, end);
        // The break can land a hair past the budget; that is fine, but it must
        // always move forward or the loop never ends.
        if (end <= start) end = Math.min(start + size, clean.length);
        const piece = clean.slice(start, end).trim();
        if (piece) chunks.push(piece);
        start = end;
    }
    return chunks;
}
