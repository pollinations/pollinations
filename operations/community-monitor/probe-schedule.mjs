const HOUR = 60 * 60 * 1000;

// Retry budget only: this state never decides model visibility or health.
export function nextProbeAt(previous) {
    if (!previous) return 0;
    // A passing image probe costs up to $0.25, so a healthy image model is
    // rechecked daily. Everything else keeps the four-hour base.
    const base = previous.imagePassed ? 24 : 4;
    const delay = Math.min(base * 2 ** previous.failures, 6 * 24) * HOUR;
    return Date.parse(previous.lastAt) + delay;
}

export function recordProbe(previous, result) {
    return {
        lastAt: result.timestamp,
        failures:
            result.ok ||
            result.status === "ERR" ||
            result.status === "INVALID" ||
            (typeof result.status === "number" && result.status < 500)
                ? 0
                : (previous?.failures ?? 0) + 1,
        operation: result.operation,
        imagePassed: (result.ok && result.category === "image") || undefined,
    };
}
