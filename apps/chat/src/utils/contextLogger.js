/**
 * Context transparency logger.
 *
 * Tracks what data was logically received by the AI vs. silently dropped
 * before or during a request. Every method is fully try/catch guarded —
 * a failure here must never propagate to the caller or crash the send flow.
 *
 * Severity levels:
 *   "drop"    — confirmed data loss (provable from code path)
 *   "warning" — possible data loss (uncertain, model-dependent)
 *
 * Authored by stormdede515-eng
 * https://github.com/stormdede515-eng
 */

const _entries = [];

/**
 * Record a confirmed dropped item for a given turn.
 * @param {string} turnId
 * @param {"image"|"attachment"|"chat-history"} type
 * @param {string} reason
 * @param {object} [detail]
 */
function dropped(turnId, type, reason, detail = {}) {
    try {
        _entries.push({
            turnId,
            type,
            reason,
            detail,
            severity: "drop",
            ts: Date.now(),
        });
        console.warn(
            `[context-drop] turn=${turnId} type=${type} reason=${reason}`,
            detail,
        );
    } catch {
        // intentionally swallowed — logger must never crash caller
    }
}

/**
 * Record a non-critical warning — data may or may not have been received
 * depending on model behaviour. Does not indicate confirmed loss.
 * @param {string} turnId
 * @param {"image"|"attachment"} type
 * @param {string} reason
 * @param {object} [detail]
 */
function warn(turnId, type, reason, detail = {}) {
    try {
        _entries.push({
            turnId,
            type,
            reason,
            detail,
            severity: "warning",
            ts: Date.now(),
        });
        console.info(
            `[context-warn] turn=${turnId} type=${type} reason=${reason}`,
            detail,
        );
    } catch {
        // intentionally swallowed
    }
}

/**
 * Record one item that was successfully included in the request.
 * @param {string} turnId
 * @param {"image"|"attachment"|"text"} type
 * @param {object} [detail]
 */
function received(turnId, type, detail = {}) {
    try {
        _entries.push({
            turnId,
            type,
            detail,
            severity: "received",
            ts: Date.now(),
        });
    } catch {
        // intentionally swallowed
    }
}

/**
 * Return all entries (drops + warnings) that should surface to the user
 * for a given turn, in insertion order.
 * @param {string} turnId
 * @returns {object[]}
 */
function getVisibleForTurn(turnId) {
    try {
        return _entries.filter(
            (e) =>
                e.turnId === turnId &&
                (e.severity === "drop" || e.severity === "warning"),
        );
    } catch {
        return [];
    }
}

/**
 * Return only confirmed drops for a turn (no warnings).
 * @param {string} turnId
 * @returns {object[]}
 */
function getDroppedForTurn(turnId) {
    try {
        return _entries.filter(
            (e) => e.turnId === turnId && e.severity === "drop",
        );
    } catch {
        return [];
    }
}

/** Return all log entries for a turn (for debugging). */
function getForTurn(turnId) {
    try {
        return _entries.filter((e) => e.turnId === turnId);
    } catch {
        return [];
    }
}

/** Clear all entries (e.g. on chat reset). Safe to call at any time. */
function flush() {
    try {
        _entries.length = 0;
    } catch {
        // intentionally swallowed
    }
}

export const contextLogger = {
    dropped,
    warn,
    received,
    getVisibleForTurn,
    getDroppedForTurn,
    getForTurn,
    flush,
};
