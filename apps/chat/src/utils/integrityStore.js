/**
 * Conversation integrity store.
 *
 * Hashes AI response content on arrival and stores hashes in sessionStorage.
 * Used to detect within-session tampering — if a stored hash no longer matches
 * the message content, the conversation record may have been modified.
 *
 * Hash algorithm: djb2 — fast, dependency-free, good enough for integrity signals
 * (not cryptographic, not suitable for security-critical use).
 *
 * sessionStorage scope: hashes persist across React re-renders but are cleared
 * when the tab is closed, making them safe for same-session verification only.
 *
 * All functions are try/catch guarded and will never throw to callers.
 *
 * Authored by stormdede515-eng
 * https://github.com/stormdede515-eng
 */

const PREFIX = "integrity:";

/**
 * Compute a djb2 hash of a string.
 * @param {string} str
 * @returns {string}
 */
function djb2(str) {
    let hash = 5381;
    for (let i = 0; i < str.length; i++) {
        hash = ((hash << 5) + hash) + str.charCodeAt(i);
        hash = hash & hash; // keep 32-bit
    }
    return Math.abs(hash).toString(36);
}

/**
 * Store the integrity hash for a completed AI response.
 * @param {string} turnId
 * @param {string} content — the full response text
 */
export function storeHash(turnId, content) {
    try {
        sessionStorage.setItem(PREFIX + turnId, djb2(content || ""));
    } catch {
        // sessionStorage quota or access error — silently skip
    }
}

/**
 * Verify a message's current content against its stored hash.
 *
 * @param {string} turnId
 * @param {string} content
 * @returns {true | false | null}
 *   true  — content matches stored hash (unmodified)
 *   false — content does NOT match (potentially tampered)
 *   null  — no hash on record (different session, or hash was never stored)
 */
export function verifyHash(turnId, content) {
    try {
        const stored = sessionStorage.getItem(PREFIX + turnId);
        if (stored === null) return null;
        return stored === djb2(content || "");
    } catch {
        return null;
    }
}

/**
 * Remove the stored hash for a turn (e.g., on chat clear).
 * @param {string} turnId
 */
export function clearHash(turnId) {
    try {
        sessionStorage.removeItem(PREFIX + turnId);
    } catch {
        // intentionally swallowed
    }
}
