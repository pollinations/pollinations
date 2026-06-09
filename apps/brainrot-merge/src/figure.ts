// Figure extraction for "figure" piece styles (e.g. the Brainrot preset).
//
// Generated images arrive as photos of a single character on a plain white
// background. This module turns one into:
//   1. a cutout sprite (background made transparent) for rendering, and
//   2. a simplified convex-hull polygon for the physics body.
//
// The hull is area-normalized by the caller (useGameEngine) so a piece's
// physical footprint always matches its tier — shapes change how pieces
// rest and stack, never how much space a tier is worth.

export type FigureData = {
    /** Object URL of the cutout sprite (transparent background PNG). */
    cutoutUrl: string;
    /**
     * Convex hull of the figure in sprite pixel space, centered on the hull
     * centroid (so the polygon's centroid is at 0,0), wound clockwise.
     */
    vertices: Array<{ x: number; y: number }>;
    /** Hull area in sprite pixel space (for tier normalization). */
    area: number;
    /** Sprite size in pixels (square source images). */
    spriteSize: { width: number; height: number };
    /**
     * Offset from the hull centroid to the sprite's center, in sprite pixel
     * space. Lets the renderer align the sprite with the physics body.
     */
    spriteOffset: { x: number; y: number };
};

const BG_TOLERANCE = 42;
const MAX_HULL_VERTICES = 12;
// Reject extractions that are implausibly empty/full — likely a busy
// background or a failed generation; the caller falls back to circles.
const MIN_FG_FRACTION = 0.04;
const MAX_FG_FRACTION = 0.82;
const ANALYSIS_SIZE = 128;

type Point = { x: number; y: number };

function cross(o: Point, a: Point, b: Point) {
    return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
}

// Andrew's monotone chain. Input order does not matter.
function convexHull(points: Point[]): Point[] {
    const sorted = [...points].sort((p, q) => p.x - q.x || p.y - q.y);
    if (sorted.length <= 3) return sorted;
    const lower: Point[] = [];
    for (const p of sorted) {
        while (
            lower.length >= 2 &&
            cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0
        ) {
            lower.pop();
        }
        lower.push(p);
    }
    const upper: Point[] = [];
    for (let i = sorted.length - 1; i >= 0; i -= 1) {
        const p = sorted[i];
        while (
            upper.length >= 2 &&
            cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0
        ) {
            upper.pop();
        }
        upper.push(p);
    }
    lower.pop();
    upper.pop();
    return [...lower, ...upper];
}

// Repeatedly drop the vertex whose removal loses the least area until the
// hull is small enough for a stable physics body.
function simplifyHull(hull: Point[], maxVertices: number): Point[] {
    const poly = [...hull];
    while (poly.length > maxVertices) {
        let bestIndex = 0;
        let bestLoss = Number.POSITIVE_INFINITY;
        for (let i = 0; i < poly.length; i += 1) {
            const a = poly[(i - 1 + poly.length) % poly.length];
            const b = poly[i];
            const c = poly[(i + 1) % poly.length];
            const loss = Math.abs(cross(a, b, c)) / 2;
            if (loss < bestLoss) {
                bestLoss = loss;
                bestIndex = i;
            }
        }
        poly.splice(bestIndex, 1);
    }
    return poly;
}

function polygonArea(poly: Point[]) {
    let sum = 0;
    for (let i = 0; i < poly.length; i += 1) {
        const a = poly[i];
        const b = poly[(i + 1) % poly.length];
        sum += a.x * b.y - b.x * a.y;
    }
    return Math.abs(sum) / 2;
}

function polygonCentroid(poly: Point[]): Point {
    let area = 0;
    let cx = 0;
    let cy = 0;
    for (let i = 0; i < poly.length; i += 1) {
        const a = poly[i];
        const b = poly[(i + 1) % poly.length];
        const f = a.x * b.y - b.x * a.y;
        area += f;
        cx += (a.x + b.x) * f;
        cy += (a.y + b.y) * f;
    }
    area /= 2;
    if (area === 0) return poly[0] ?? { x: 0, y: 0 };
    return { x: cx / (6 * area), y: cy / (6 * area) };
}

// Foreground mask via flood fill from the image borders over near-background
// pixels. Filling from the borders (rather than thresholding everywhere)
// keeps light areas inside the figure — a shark's white belly stays opaque.
function buildForegroundMask(
    data: Uint8ClampedArray,
    width: number,
    height: number,
) {
    const sampleBackground = () => {
        let r = 0;
        let g = 0;
        let b = 0;
        let count = 0;
        const margin = Math.max(2, Math.floor(width * 0.02));
        for (let y = 0; y < height; y += 1) {
            const edgeRow = y < margin || y >= height - margin;
            for (let x = 0; x < width; x += 1) {
                if (!edgeRow && x >= margin && x < width - margin) continue;
                const i = (y * width + x) * 4;
                r += data[i];
                g += data[i + 1];
                b += data[i + 2];
                count += 1;
            }
        }
        return { r: r / count, g: g / count, b: b / count };
    };

    const bg = sampleBackground();
    const isBackground = (index: number) => {
        const i = index * 4;
        const dr = data[i] - bg.r;
        const dg = data[i + 1] - bg.g;
        const db = data[i + 2] - bg.b;
        return Math.sqrt(dr * dr + dg * dg + db * db) < BG_TOLERANCE;
    };

    const removed = new Uint8Array(width * height);
    const queue: number[] = [];
    const push = (index: number) => {
        if (!removed[index] && isBackground(index)) {
            removed[index] = 1;
            queue.push(index);
        }
    };
    for (let x = 0; x < width; x += 1) {
        push(x);
        push((height - 1) * width + x);
    }
    for (let y = 0; y < height; y += 1) {
        push(y * width);
        push(y * width + width - 1);
    }
    while (queue.length > 0) {
        const index = queue.pop() as number;
        const x = index % width;
        const y = (index - x) / width;
        if (x > 0) push(index - 1);
        if (x < width - 1) push(index + 1);
        if (y > 0) push(index - width);
        if (y < height - 1) push(index + width);
    }
    return removed;
}

/**
 * Extract a cutout sprite and a simplified convex-hull collider from a
 * generated figure image. Returns null when the image does not look like a
 * single figure on a plain background — callers then keep circle physics
 * and token rendering.
 */
export async function extractFigure(
    imageBlob: Blob,
): Promise<FigureData | null> {
    try {
        const bitmap = await createImageBitmap(imageBlob);
        const width = bitmap.width;
        const height = bitmap.height;

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext("2d");
        if (!context) return null;
        context.drawImage(bitmap, 0, 0);
        bitmap.close();

        const image = context.getImageData(0, 0, width, height);
        const removed = buildForegroundMask(image.data, width, height);

        // Hull from a downsampled grid of foreground pixels — the hull of a
        // sparse sample is visually identical and far cheaper than using
        // every pixel.
        const step = Math.max(1, Math.floor(width / ANALYSIS_SIZE));
        const samples: Point[] = [];
        let foregroundCount = 0;
        for (let y = 0; y < height; y += 1) {
            for (let x = 0; x < width; x += 1) {
                if (removed[y * width + x]) continue;
                foregroundCount += 1;
                if (x % step === 0 && y % step === 0) {
                    samples.push({ x, y });
                }
            }
        }
        const foregroundFraction = foregroundCount / (width * height);
        if (
            foregroundFraction < MIN_FG_FRACTION ||
            foregroundFraction > MAX_FG_FRACTION ||
            samples.length < 8
        ) {
            return null;
        }

        const hull = simplifyHull(convexHull(samples), MAX_HULL_VERTICES);
        if (hull.length < 3) return null;
        const area = polygonArea(hull);
        if (area <= 0) return null;
        const centroid = polygonCentroid(hull);

        for (let index = 0; index < removed.length; index += 1) {
            if (removed[index]) image.data[index * 4 + 3] = 0;
        }
        context.putImageData(image, 0, 0);
        const cutoutBlob = await new Promise<Blob | null>((resolve) => {
            canvas.toBlob(resolve, "image/png");
        });
        if (!cutoutBlob) return null;

        return {
            cutoutUrl: URL.createObjectURL(cutoutBlob),
            vertices: hull.map((p) => ({
                x: p.x - centroid.x,
                y: p.y - centroid.y,
            })),
            area,
            spriteSize: { width, height },
            spriteOffset: {
                x: width / 2 - centroid.x,
                y: height / 2 - centroid.y,
            },
        };
    } catch {
        return null;
    }
}
