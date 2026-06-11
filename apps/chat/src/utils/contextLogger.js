/**
 * Context transparency logger.
 *
 * Tracks what data was logically received by the AI vs. silently dropped
 * before or during a request. Every method is fully try/catch guarded —
 * a failure here must never propagate to the caller or crash the send flow.
 *
 * Authored by stormdede515-eng
 * https://github.com/stormdede515-eng
 */

const _entries = [];

/**
 * Record one dropped item for a given turn.
 * @param {string} turnId     - Assistant message ID that owns this turn.
 * @param {"image"|"attachment"|"chat-history"} type - Category of dropped data.
 * @param {string} reason     - Machine-readable reason code.
 * @param {object} [detail]   - Optional extra context (model name, file name, etc.).
 */
function dropped(turnId, type, reason, detail = {}) {
    try {
        const entry = {
            turnId,
            type,
            reason,
            detail,
            dropped: true,
            ts: Date.now(),
        };
        _entries.push(entry);
        console.warn(
            `[context-drop] turn=${turnId} type=${type} reason=${reason}`,
            detail,
        );
    } catch {
        // intentionally swallowed — logger must never crash caller
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
        _entries.push({ turnId, type, detail, dropped: false, ts: Date.now() });
    } catch {
        // intentionally swallowed
    }
}

/**
 * Return all log entries for a specific turn, in insertion order.
 * @param {string} turnId
 * @returns {{ turnId: string, type: string, reason?: string, detail: object, dropped: boolean, ts: number }[]}
 */
function getForTurn(turnId) {
    try {
        return _entries.filter((e) => e.turnId === turnId);
    } catch {
        return [];
    }
}

/**
 * Return only the dropped entries for a turn.
 * @param {string} turnId
 * @returns {object[]}
 */
function getDroppedForTurn(turnId) {
    try {
        return _entries.filter((e) => e.turnId === turnId && e.dropped);
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

export const contextLogger = { dropped, received, getForTurn, getDroppedForTurn, flush };
