// Flywheel diagram for the "For Builders" section.
// Four nodes (build, ship, grow, earn) connected by short straight arrows.

interface FlywheelRingProps {
    pageCopy: Record<string, unknown>;
}

const CX = 170;
const CY = 170;

function toRad(deg: number) {
    return ((deg - 90) * Math.PI) / 180;
}

function pt(r: number, deg: number) {
    const rad = toRad(deg);
    return { x: CX + r * Math.cos(rad), y: CY + r * Math.sin(rad) };
}

// Node positions
const NODE_R = 127;
const NODE_SIZE = 80;
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

const NODE_POSITIONS = NODES.map((n) => {
    const center = pt(NODE_R, n.angle);
    return { ...n, cx: center.x, cy: center.y };
});

// Short straight arrows between consecutive nodes
const ARROW_SIZE = 28;
const ARROW_HALF = ARROW_SIZE / 2;
const ARROW_R = 95; // radius where arrows sit (between center and nodes)

const ARROWS = [
    { angle: 45 }, // build → ship
    { angle: 135 }, // ship → grow
    { angle: 225 }, // grow → earn
    { angle: 315 }, // earn → build
].map((a) => {
    const center = pt(ARROW_R, a.angle);
    return { ...a, cx: center.x, cy: center.y };
});

export function FlywheelRing({ pageCopy }: FlywheelRingProps) {
    const copy = pageCopy as Record<string, string>;

    return (
        <div className="flex lg:justify-center">
            <div className="relative w-[340px] h-[340px]">
                {/* Short straight arrows between nodes */}
                {ARROWS.map((arrow) => (
                    <div
                        key={arrow.angle}
                        className="absolute z-0"
                        style={{
                            left: `${arrow.cx - ARROW_HALF}px`,
                            top: `${arrow.cy - ARROW_HALF}px`,
                            width: `${ARROW_SIZE}px`,
                            height: `${ARROW_SIZE}px`,
                        }}
                    >
                        <svg
                            viewBox="0 0 28 28"
                            className="w-full h-full"
                            aria-hidden="true"
                            style={{
                                transform: `rotate(${arrow.angle}deg)`,
                            }}
                        >
                            <path
                                d="M6 12 L18 12 L18 8 L24 14 L18 20 L18 16 L6 16 Z"
                                style={{
                                    fill: "rgb(var(--text-secondary))",
                                }}
                            />
                        </svg>
                    </div>
                ))}

                {/* Center label */}
                <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none">
                    <span className="font-headline text-sm font-black text-text-highlight tracking-wider">
                        {copy.flywheelCenter}
                    </span>
                </div>

                {/* Nodes — emoji + badge label */}
                {NODE_POSITIONS.map((node) => (
                    <div
                        key={node.num}
                        className="absolute z-10 flex flex-col items-center gap-1"
                        style={{
                            left: `${node.cx - NODE_HALF}px`,
                            top: `${node.cy - NODE_HALF}px`,
                            width: `${NODE_SIZE}px`,
                            height: `${NODE_SIZE}px`,
                            justifyContent: "center",
                        }}
                    >
                        <span className="text-[32px] leading-none">
                            {copy[node.emojiKey]}
                        </span>
                        <span
                            className={`font-headline text-[11px] font-black uppercase tracking-wider whitespace-nowrap px-2 py-0.5 rounded-full ${
                                node.soon
                                    ? "bg-border-accent/15 text-text-accent border border-border-accent/50"
                                    : "bg-button-focus-ring/20 text-text-highlight border border-border-highlight shadow-shadow-highlight-sm"
                            }`}
                        >
                            {copy[node.labelKey]}
                        </span>
                        {node.soon && (
                            <span className="absolute -bottom-3 left-1/2 -translate-x-1/2 font-body text-[10px] font-bold text-text-body-tertiary uppercase tracking-wider whitespace-nowrap bg-surface-card/80 border border-border-subtle rounded-tag px-1.5 py-0.5">
                                {copy.comingSoonBadge}
                            </span>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
}
