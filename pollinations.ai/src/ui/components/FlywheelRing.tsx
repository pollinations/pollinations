// Animated flywheel ring for the "For Builders" section.
// Ports the SVG arrow-chain from the HTML mockup with theme-aware colors.

interface FlywheelRingProps {
    pageCopy: Record<string, unknown>;
}

// ── SVG path generation (same math as the HTML mockup) ──

const CX = 170;
const CY = 170;
const OUTER_R = 115;
const INNER_R = 75;
const MID_R = (OUTER_R + INNER_R) / 2;
const NOTCH = 14; // degrees
const GAP = 0.5;

function toRad(deg: number) {
    return ((deg - 90) * Math.PI) / 180;
}

function pt(r: number, deg: number) {
    const rad = toRad(deg);
    return { x: CX + r * Math.cos(rad), y: CY + r * Math.sin(rad) };
}

function arrowPath(s: number, e: number): string {
    const tailOuter = pt(OUTER_R, s + GAP);
    const tailNotch = pt(MID_R, s + GAP + NOTCH);
    const tailInner = pt(INNER_R, s + GAP);

    const headOuterBase = pt(OUTER_R, e - GAP);
    const headTip = pt(MID_R, e - GAP + NOTCH);
    const headInnerBase = pt(INNER_R, e - GAP);

    const outerSpan = e - GAP - (s + GAP);
    const outerLarge = outerSpan > 180 ? 1 : 0;
    const innerSpan = e - GAP - (s + GAP);
    const innerLarge = innerSpan > 180 ? 1 : 0;

    return [
        `M ${tailOuter.x} ${tailOuter.y}`,
        `L ${tailNotch.x} ${tailNotch.y}`,
        `L ${tailInner.x} ${tailInner.y}`,
        `A ${INNER_R} ${INNER_R} 0 ${innerLarge} 1 ${headInnerBase.x} ${headInnerBase.y}`,
        `L ${headTip.x} ${headTip.y}`,
        `L ${headOuterBase.x} ${headOuterBase.y}`,
        `A ${OUTER_R} ${OUTER_R} 0 ${outerLarge} 0 ${tailOuter.x} ${tailOuter.y}`,
        "Z",
    ].join(" ");
}

// Pre-compute the 4 segment paths (they never change)
const SEGMENTS = [
    { start: 0, end: 90, opacity: 0.3 },
    { start: 90, end: 180, opacity: 0.2 },
    { start: 180, end: 270, opacity: 0.3 },
    { start: 270, end: 360, opacity: 0.2 },
].map((seg) => ({
    d: arrowPath(seg.start, seg.end),
    opacity: seg.opacity,
}));

// Node positions — centered on the ring, containing emoji + label.
const NODE_R = 127; // px from ring center to node center (sits on ring)
const NODE_SIZE = 80; // px
const NODE_HALF = NODE_SIZE / 2;

const NODES: readonly {
    angle: number;
    num: string;
    emojiKey: string;
    labelKey: string;
    soon?: boolean;
}[] = [
    { angle: 0, num: "1", emojiKey: "loopBuildEmoji", labelKey: "loopBuild" },
    { angle: 90, num: "2", emojiKey: "loopShipEmoji", labelKey: "loopShip" },
    { angle: 180, num: "3", emojiKey: "loopGrowEmoji", labelKey: "loopGrow" },
    {
        angle: 270,
        num: "4",
        emojiKey: "loopEarnEmoji",
        labelKey: "loopEarn",
        soon: true,
    },
];

// Pre-compute node positions (node center x,y in the 340px container)
const NODE_POSITIONS = NODES.map((n) => {
    const center = pt(NODE_R, n.angle);
    return { ...n, cx: center.x, cy: center.y };
});

// ── Component ──

export function FlywheelRing({ pageCopy }: FlywheelRingProps) {
    const copy = pageCopy as Record<string, string>;

    return (
        <div className="flex lg:justify-center">
            <div className="relative w-[340px] h-[340px]">
                {/* SVG ring */}
                <svg
                    viewBox="0 0 340 340"
                    className="w-full h-full"
                    role="img"
                    aria-label="Flywheel cycle: build, ship, grow, earn"
                >
                    <g
                        className="origin-center"
                        style={{
                            animation: "flywheel-spin 30s linear infinite",
                            transformOrigin: "170px 170px",
                        }}
                    >
                        {SEGMENTS.map((seg) => (
                            <path
                                key={seg.d}
                                d={seg.d}
                                style={{
                                    fill: `rgb(var(--border-brand) / ${seg.opacity})`,
                                }}
                            />
                        ))}
                    </g>
                </svg>

                {/* Spin keyframe */}
                <style>{`
                    @keyframes flywheel-spin {
                        from { transform: rotate(0deg); }
                        to { transform: rotate(360deg); }
                    }
                `}</style>

                {/* Center label */}
                <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none">
                    <span className="font-headline text-sm font-black text-text-highlight tracking-wider">
                        {copy.flywheelCenter}
                    </span>
                </div>

                {/* Nodes — sitting on the ring with emoji + label inside */}
                {NODE_POSITIONS.map((node) => (
                    <div
                        key={node.num}
                        className="absolute z-10 flex flex-col items-center justify-center rounded-full backdrop-blur-sm"
                        style={{
                            left: `${node.cx - NODE_HALF}px`,
                            top: `${node.cy - NODE_HALF}px`,
                            width: `${NODE_SIZE}px`,
                            height: `${NODE_SIZE}px`,
                            background: "rgb(var(--surface-page) / 0.3)",
                            border: node.soon
                                ? "1.5px dashed rgb(var(--border-subtle))"
                                : undefined,
                        }}
                    >
                        <span
                            className={`text-[32px] leading-none ${node.soon ? "opacity-40" : ""}`}
                        >
                            {copy[node.emojiKey]}
                        </span>
                        <span
                            className={`font-headline text-[13px] font-bold text-text-body-main tracking-wider whitespace-nowrap mt-0.5 ${node.soon ? "opacity-40" : ""}`}
                        >
                            <span className="text-text-highlight opacity-50 mr-0.5">
                                {node.num}
                            </span>{" "}
                            {copy[node.labelKey]?.toUpperCase()}
                        </span>
                        {node.soon && (
                            <span className="absolute -bottom-5 left-1/2 -translate-x-1/2 font-headline text-[10px] font-black text-text-body-tertiary uppercase tracking-wider whitespace-nowrap bg-surface-card/80 border border-border-subtle rounded-tag px-1.5 py-0.5">
                                coming soon
                            </span>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
}
