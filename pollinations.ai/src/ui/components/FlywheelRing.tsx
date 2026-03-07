// Flywheel diagram — horizontal linear flow:
// Build → Ship → Grow → Earn
// with a curved return arrow from Earn back to Build.

interface FlywheelRingProps {
    pageCopy: Record<string, unknown>;
}

const NODES: readonly {
    num: string;
    emojiKey: string;
    labelKey: string;
    soon?: boolean;
}[] = [
    { num: "1", emojiKey: "loopBuildEmoji", labelKey: "loopBuild" },
    { num: "2", emojiKey: "loopShipEmoji", labelKey: "loopShip" },
    { num: "3", emojiKey: "loopGrowEmoji", labelKey: "loopGrow" },
    { num: "4", emojiKey: "loopEarnEmoji", labelKey: "loopEarn", soon: true },
];

function PixelArrowRight() {
    return (
        <div className="flex items-center shrink-0" aria-hidden="true">
            {/* Shaft */}
            <div className="w-4 md:w-6 h-1 bg-muted" />
            {/* Arrowhead — CSS borders */}
            <div className="w-0 h-0 border-t-[5px] border-t-transparent border-b-[5px] border-b-transparent border-l-[6px] border-l-muted" />
        </div>
    );
}

export function FlywheelRing({ pageCopy }: FlywheelRingProps) {
    const copy = pageCopy as Record<string, string>;

    return (
        <div className="w-full">
            {/* Horizontal flow: nodes with arrows between */}
            <div className="flex items-center justify-between w-full">
                {NODES.map((node, i) => (
                    <div key={node.num} className="contents">
                        {/* Node */}
                        <div className="flex flex-col items-center gap-2 relative">
                            {node.soon && (
                                <span className="absolute -top-5 md:-top-6 left-1/2 -translate-x-1/2 font-body text-[8px] md:text-[10px] font-bold text-subtle uppercase tracking-wider whitespace-nowrap bg-white border border-tan px-1.5 py-0.5">
                                    {copy.comingSoonBadge}
                                </span>
                            )}
                            <span className="text-[32px] md:text-[40px] leading-none">
                                {copy[node.emojiKey]}
                            </span>
                            <span className="font-headline text-[8px] md:text-xs font-black uppercase tracking-wider whitespace-nowrap text-dark">
                                {copy[node.labelKey]}
                            </span>
                        </div>
                        {/* Arrow between nodes (not after last) */}
                        {i < NODES.length - 1 && (
                            <div className="flex-1 flex items-center justify-center px-1 md:px-2">
                                <PixelArrowRight />
                            </div>
                        )}
                    </div>
                ))}
            </div>

            {/* Return arrow: pixel U-shape + CSS triangle arrowhead */}
            <div
                className="relative w-full mt-4"
                style={{ height: "32px" }}
                aria-hidden="true"
            >
                {/* Pixel U-shape bar (no arrowhead) */}
                <svg
                    className="absolute inset-0 w-full h-full"
                    viewBox="0 0 400 40"
                    preserveAspectRatio="none"
                    style={{ imageRendering: "pixelated" }}
                    aria-hidden="true"
                >
                    <rect
                        x="370"
                        y="0"
                        width="6"
                        height="16"
                        fill="rgb(var(--muted))"
                    />
                    <rect
                        x="24"
                        y="12"
                        width="352"
                        height="6"
                        fill="rgb(var(--muted))"
                    />
                    <rect
                        x="24"
                        y="0"
                        width="6"
                        height="16"
                        fill="rgb(var(--muted))"
                    />
                </svg>
                {/* CSS triangle arrowhead pointing up */}
                <div
                    className="absolute w-0 h-0"
                    style={{
                        left: "calc(6.75% - 6px)",
                        top: "-12px",
                        borderLeft: "6px solid transparent",
                        borderRight: "6px solid transparent",
                        borderBottom: "8px solid rgb(var(--muted))",
                    }}
                />
            </div>
        </div>
    );
}
