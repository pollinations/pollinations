/** Keep zero visible; allow headroom and preserve negative metrics like margin. */
export function dataWindow(values) {
    const rawMin = Math.min(...values);
    const rawMax = Math.max(...values);
    const span = rawMax - rawMin || Math.abs(rawMax) || 1;
    return {
        min: rawMin >= 0 ? 0 : rawMin - span * 0.08,
        max: Math.max(0, rawMax + span * 0.08),
    };
}
