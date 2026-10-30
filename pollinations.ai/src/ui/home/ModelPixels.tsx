import type { CSSProperties } from "react";

export type PixelKind =
    | "image"
    | "text"
    | "audio"
    | "video"
    | "embedding"
    | "community";

/** CSS custom properties read by the `.site-px-*` rules in styles.css. */
type Motion = Record<`--${string}`, string>;

/** 12×9 cells: `#` full colour, `+` half tone, anything else empty. */
type Layer = { rows: string[]; motion?: Motion };

const appear = (delay: number): Motion => ({
    "--px-anim": "site-px-appear 160ms linear",
    "--px-delay": `${delay}ms`,
});
const type = (length: number, delay: number): Motion => ({
    "--px-anim": `site-px-type ${length * 40}ms steps(${length})`,
    "--px-delay": `${delay}ms`,
    "--px-origin": "left",
});
const bounce = (low: number, delay: number): Motion => ({
    "--px-anim": "site-px-bounce 400ms steps(2)",
    "--px-delay": `${delay}ms`,
    "--px-origin": "bottom",
    "--px-low": String(low),
});
const gather = (dx: number, dy: number): Motion => ({
    "--px-anim": "site-px-gather 900ms steps(3)",
    "--px-dx": `${dx}px`,
    "--px-dy": `${dy}px`,
});

// One bar of the audio meter, `height` cells tall, in column `column`.
const bar = (column: number, height: number): string[] =>
    Array.from({ length: 9 }, (_, row) =>
        row >= 9 - height
            ? `${".".repeat(column)}#${".".repeat(11 - column)}`
            : "",
    );

// A 2×2 dot with its top-left cell at (column, row).
const dot = (column: number, row: number, tone = "#"): string[] =>
    Array.from({ length: 9 }, (_, r) =>
        r === row || r === row + 1
            ? `${".".repeat(column)}${tone.repeat(2)}${".".repeat(10 - column)}`
            : "",
    );

const DRAWINGS: Record<PixelKind, Layer[]> = {
    // A picture that develops band by band.
    image: [
        {
            rows: [
                "############",
                "#..........#",
                "#..........#",
                "#..........#",
                "#..........#",
                "#..........#",
                "#..........#",
                "#..........#",
                "############",
            ],
        },
        { rows: ["", "", ".......++...", ".......++..."], motion: appear(0) },
        {
            rows: ["", "", "", "", "....#.......", "...###..#..."],
            motion: appear(160),
        },
        {
            rows: ["", "", "", "", "", "", "..#####.###.", ".##########."],
            motion: appear(320),
        },
    ],
    // Three lines type in, then the cursor blinks.
    text: [
        { rows: ["", "#########..."], motion: type(9, 0) },
        { rows: ["", "", "", "", "############"], motion: type(12, 360) },
        {
            rows: ["", "", "", "", "", "", "", "######......"],
            motion: type(6, 840),
        },
        {
            rows: ["", "", "", "", "", "", ".......+", ".......+", ".......+"],
            motion: {
                "--px-anim": "site-px-blink 400ms steps(1)",
                "--px-delay": "1080ms",
            },
        },
    ],
    // A level meter.
    audio: [
        { rows: bar(0, 4), motion: bounce(0.5, 0) },
        { rows: bar(2, 7), motion: bounce(0.3, 60) },
        { rows: bar(4, 9), motion: bounce(0.45, 120) },
        { rows: bar(6, 5), motion: bounce(0.4, 180) },
        { rows: bar(8, 8), motion: bounce(0.35, 240) },
        { rows: bar(10, 3), motion: bounce(0.6, 300) },
    ],
    // A film frame; the sprocket holes run.
    video: [
        {
            rows: [
                "",
                "############",
                "#....#.....#",
                "#....##....#",
                "#....###...#",
                "#....##....#",
                "#....#.....#",
                "############",
            ],
        },
        {
            rows: ["+.+.+.+.+.+.", "", "", "", "", "", "", "", "+.+.+.+.+.+."],
            motion: { "--px-anim": "site-px-run 480ms steps(1)" },
        },
    ],
    // Scattered points gather into a cluster.
    embedding: [
        { rows: dot(5, 3, "+") },
        { rows: dot(0, 0), motion: gather(4, 3) },
        { rows: dot(10, 1), motion: gather(-4, 2) },
        { rows: dot(1, 7), motion: gather(3, -3) },
        { rows: dot(9, 6), motion: gather(-3, -2) },
    ],
    // A sprout grows: stem, then one leaf, then the other.
    community: [
        {
            rows: ["", "", "", "", "", "", "", "..++++++++..", ".++++++++++."],
        },
        {
            rows: [
                "",
                "",
                "",
                "",
                "....#..#....",
                ".....##.....",
                ".....##.....",
            ],
            motion: appear(0),
        },
        {
            rows: ["", "..###.......", ".####.......", "..###......."],
            motion: appear(200),
        },
        {
            rows: ["", ".......###..", ".......####.", ".......###.."],
            motion: appear(400),
        },
    ],
};

/** One path of every cell drawn with `tone`. */
function cells(rows: string[], tone: string) {
    return rows
        .flatMap((row, y) =>
            [...row].map((cell, x) =>
                cell === tone ? `M${x} ${y}h1v1h-1z` : "",
            ),
        )
        .join("");
}

function Art({ rows }: { rows: string[] }) {
    const full = cells(rows, "#");
    const half = cells(rows, "+");
    return (
        <>
            {full && <path d={full} />}
            {half && <path d={half} opacity={0.45} />}
        </>
    );
}

/**
 * A small pixel drawing for a model card, in the card's colour. Animated
 * layers sit in two groups: the outer plays once when the grid first comes
 * into view, the inner plays on hover or focus.
 */
export function ModelPixels({
    kind,
    color,
}: {
    kind: PixelKind;
    color: string;
}) {
    return (
        <svg
            aria-hidden="true"
            className="site-model-pixels"
            viewBox="0 0 12 9"
            shapeRendering="crispEdges"
            style={{ color }}
        >
            {DRAWINGS[kind].map(({ rows, motion }) =>
                motion ? (
                    <g
                        key={rows.join("|")}
                        className="site-px-seen"
                        style={motion as CSSProperties}
                    >
                        <g className="site-px-hover">
                            <Art rows={rows} />
                        </g>
                    </g>
                ) : (
                    <g key={rows.join("|")}>
                        <Art rows={rows} />
                    </g>
                ),
            )}
        </svg>
    );
}
