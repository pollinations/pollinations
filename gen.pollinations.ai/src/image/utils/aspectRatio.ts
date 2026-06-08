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
    const requested = width / height;
    return ASPECT_RATIOS.reduce((best, ar) =>
        Math.abs(requested - ar.ratio) < Math.abs(requested - best.ratio)
            ? ar
            : best,
    ).label;
}
