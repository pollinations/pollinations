// Shared by the xAI image (grok-imagine-image) and video (grok-imagine-video)
// handlers. If these surfaces ever need to diverge, split this table back into
// the relevant handler — that should be a deliberate decision.
export const ASPECT_RATIOS: Array<{ ratio: number; label: string }> = [
    { ratio: 1 / 1, label: "1:1" },
    { ratio: 16 / 9, label: "16:9" },
    { ratio: 9 / 16, label: "9:16" },
    { ratio: 4 / 3, label: "4:3" },
    { ratio: 3 / 4, label: "3:4" },
    { ratio: 3 / 2, label: "3:2" },
    { ratio: 2 / 3, label: "2:3" },
];

export function closestAspectRatio(
    width: number | undefined,
    height: number | undefined,
): string | undefined {
    if (!width || !height) return undefined;
    return closestByRatio(width, height, ASPECT_RATIOS).label;
}

/**
 * Pick the table entry whose ratio is closest to width/height by linear
 * difference. Earlier entries win ties. Each caller keeps its own
 * provider-specific table.
 */
export function closestByRatio<T extends { ratio: number }>(
    width: number,
    height: number,
    table: readonly T[],
): T {
    const requested = width / height;
    return table.reduce((best, entry) =>
        Math.abs(requested - entry.ratio) < Math.abs(requested - best.ratio)
            ? entry
            : best,
    );
}

/**
 * Pick the "W:H" ratio string closest to width/height by log-space distance
 * (symmetric for landscape/portrait): 1920×1080 → "16:9", 720×1280 → "9:16".
 * Earlier entries win ties.
 */
export function closestRatioLogSpace<T extends string>(
    width: number,
    height: number,
    ratios: readonly T[],
): T {
    const target = Math.log(width / height);
    let best = ratios[0];
    let bestDist = Number.POSITIVE_INFINITY;
    for (const ar of ratios) {
        const [w, h] = ar.split(":").map(Number);
        const dist = Math.abs(Math.log(w / h) - target);
        if (dist < bestDist) {
            bestDist = dist;
            best = ar;
        }
    }
    return best;
}
