// biome-ignore-all lint/a11y/useKeyWithClickEvents: Component has global keyboard navigation via arrow keys
// biome-ignore-all lint/a11y/noStaticElementInteractions: Interactive elements handled via global keydown
import { useCallback, useEffect, useState } from "react";
import {
    type EntryContent,
    type PRContent,
    type TimelineEntry,
    useDiaryData,
} from "../../hooks/useDiaryData";

const BAR = 20;
const MOBILE_BP = 580;

const impactEmoji: Record<string, string> = {
    feature: "\u{1F680}",
    improvement: "\u{1F9E0}",
    bug_fix: "\u{1F6E0}",
    infrastructure: "\u{2699}\u{FE0F}",
    docs: "\u{1F4D6}",
    community: "\u{1F91D}",
};

function Tip({
    label,
    children,
}: {
    label: string;
    children: React.ReactNode;
}) {
    return (
        <div className="group/tip" style={{ position: "relative" }}>
            {children}
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1 bg-surface-card text-text-body-main text-[10px] rounded-tag shadow-lg border border-border-main opacity-0 group-hover/tip:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50">
                {label}
            </div>
        </div>
    );
}

const chipBase =
    "inline-flex items-center px-2 py-0.5 text-[11px] font-mono font-medium rounded-tag cursor-pointer transition-colors";
const chipActive =
    "bg-button-primary-bg text-text-on-color border border-border-highlight";
const chipInactive =
    "bg-input-background text-text-body-secondary border border-border-faint hover:border-border-main";

export function BuildDiary() {
    const { timeline, loading, error, getEntryContent, getPRContent } =
        useDiaryData();

    const [x, setX] = useState(-1); // -1 until loaded
    const [y, setY] = useState(0); // 0 = overview, 1+ = PR index
    const [isMobile, setIsMobile] = useState(false);
    const [entryContent, setEntryContent] = useState<EntryContent | null>(null);
    const [prContent, setPrContent] = useState<PRContent | null>(null);
    const [imgError, setImgError] = useState(false);

    // Responsive check
    useEffect(() => {
        const check = () => setIsMobile(window.innerWidth < MOBILE_BP);
        check();
        window.addEventListener("resize", check);
        return () => window.removeEventListener("resize", check);
    }, []);

    // Set initial position to most recent entry
    useEffect(() => {
        if (timeline.length > 0 && x === -1) {
            setX(timeline.length - 1);
        }
    }, [timeline, x]);

    const entry: TimelineEntry | undefined = timeline[x];
    const maxPRs = Math.max(...timeline.map((t) => t.prNumbers.length), 1);
    const maxY = entry ? entry.prNumbers.length : 0;
    const onPR = y > 0 && y <= maxY;

    // Fetch entry content when x changes
    const entryDate = entry?.date;
    const entryType = entry?.type;
    useEffect(() => {
        if (!entryDate || !entryType) return;
        setEntryContent(null);
        setPrContent(null);
        getEntryContent(entryDate, entryType).then(setEntryContent);
    }, [entryDate, entryType, getEntryContent]);

    // Fetch PR content when y changes
    const currentPrNum = entry?.prNumbers[y - 1];
    useEffect(() => {
        if (!entryDate || !onPR || !currentPrNum) {
            setPrContent(null);
            return;
        }
        setPrContent(null);
        getPRContent(entryDate, currentPrNum).then(setPrContent);
    }, [entryDate, currentPrNum, onPR, getPRContent]);

    // Reset image error on navigation
    // biome-ignore lint/correctness/useExhaustiveDependencies: intentionally re-run when x/y change
    useEffect(() => {
        setImgError(false);
    }, [x, y]);

    // Navigation — only left/right now
    const go = useCallback(
        (dir: "left" | "right") => {
            if (!entry) return;
            if (dir === "left" && x > 0) {
                setX(x - 1);
                setY(0);
            }
            if (dir === "right" && x < timeline.length - 1) {
                setX(x + 1);
                setY(0);
            }
        },
        [x, timeline.length, entry],
    );

    // Keyboard — only ← →
    useEffect(() => {
        const h = (e: KeyboardEvent) => {
            if (e.key === "ArrowLeft") go("left");
            if (e.key === "ArrowRight") go("right");
        };
        window.addEventListener("keydown", h);
        return () => window.removeEventListener("keydown", h);
    }, [go]);

    // Loading state
    if (loading) {
        return (
            <div
                className="font-body"
                style={{
                    padding: "40px 0",
                    textAlign: "center",
                    color: "rgb(var(--text-tertiary))",
                }}
            >
                Loading build diary...
            </div>
        );
    }

    if (error || timeline.length === 0 || !entry) {
        return null;
    }

    // Current image — random platform variant (seeded by entry date for stability)
    const currentImageUrl = onPR
        ? prContent?.imageUrl || ""
        : entry.images.length > 0
          ? entry.images[
                entry.date.charCodeAt(entry.date.length - 1) %
                    entry.images.length
            ]?.url || ""
          : "";

    // Image alt text
    const imageAlt = onPR
        ? `PR #${entry.prNumbers[y - 1]}`
        : `${entry.dayName} ${entry.dateLabel}`;

    const ac = (active: boolean): React.CSSProperties => ({
        fontSize: 12,
        userSelect: "none",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: active
            ? "rgb(var(--text-secondary))"
            : "rgb(var(--text-primary) / 0.15)",
        cursor: active ? "pointer" : "default",
    });

    // Timeline bar
    const TimelineBar = (
        <div
            style={{
                display: "flex",
                alignItems: "center",
                height: BAR,
                flex: 1,
            }}
        >
            <div
                onClick={() => go("left")}
                style={{ ...ac(x > 0), width: BAR, flexShrink: 0 }}
            >
                &#x25C0;
            </div>
            <div
                style={{
                    flex: 1,
                    height: 2,
                    background: "rgb(var(--border-faint))",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "0 4px",
                }}
            >
                {timeline.map((t, i) => {
                    const prCount = t.prNumbers.length;
                    const barH =
                        prCount === 0 ? 2 : (prCount / maxPRs) * (BAR - 4) + 3;
                    const isCurrent = i === x;
                    const isMilestone = t.type === "week";
                    const needsGap =
                        i > 0 && t.weekNum !== timeline[i - 1].weekNum;
                    const tipLabel = isMilestone
                        ? `\u2726 Week ${t.weekNum} \u00B7 ${t.dateLabel}`
                        : `${t.dayName} \u00B7 ${t.dateLabel}${prCount > 0 ? ` \u00B7 ${prCount} PRs` : ""}`;
                    return (
                        <div
                            key={`${t.date}-${t.type}`}
                            style={{ display: "flex", alignItems: "center" }}
                        >
                            {needsGap && <div style={{ width: 4 }} />}
                            <Tip label={tipLabel}>
                                <div
                                    onClick={() => {
                                        setX(i);
                                        setY(0);
                                    }}
                                    style={{
                                        width: isCurrent ? 10 : 6,
                                        height: barH,
                                        background: isCurrent
                                            ? "rgb(var(--text-primary))"
                                            : isMilestone
                                              ? "rgb(var(--text-brand))"
                                              : "rgb(var(--border-subtle))",
                                        cursor: "pointer",
                                    }}
                                />
                            </Tip>
                        </div>
                    );
                })}
            </div>
            <div
                onClick={() => go("right")}
                style={{
                    ...ac(x < timeline.length - 1),
                    width: BAR,
                    flexShrink: 0,
                }}
            >
                &#x25B6;
            </div>
        </div>
    );

    // Image area
    const ImageBox = (
        <div
            style={{
                width: "100%",
                aspectRatio: "1",
                background: "rgb(var(--input-bg))",
                flexShrink: 0,
                position: "relative",
                overflow: "hidden",
            }}
        >
            {currentImageUrl && !imgError && (
                <img
                    src={currentImageUrl}
                    alt={imageAlt}
                    onError={() => setImgError(true)}
                    style={{
                        width: "100%",
                        height: "100%",
                        objectFit: "cover",
                        display: "block",
                    }}
                />
            )}
        </div>
    );

    // Text panel
    const displayTitle = onPR
        ? prContent?.title || "..."
        : entryContent?.title || "...";
    const displaySummary = onPR
        ? prContent?.description || ""
        : entryContent?.summary || "";

    // Date heading label
    const dateLabel =
        entry.type === "week"
            ? `\u2726 ${entry.dateLabel}`
            : `${entry.dayName} \u00B7 ${entry.dateLabel}`;

    const TextPanel = (
        <div
            className="font-body"
            style={{
                flex: 1,
                minWidth: 0,
                padding: isMobile ? "16px 4px 20px" : "0 28px",
                display: "flex",
                flexDirection: "column",
                justifyContent: "flex-start",
                overflow: "hidden",
                boxSizing: "border-box",
            }}
        >
            {/* Date chip — big, own row */}
            <span
                className={`font-headline self-start inline-flex items-center px-4 py-2 text-2xl font-black uppercase tracking-wider rounded-tag cursor-pointer transition-colors ${!onPR ? chipActive : chipInactive}`}
                onClick={() => setY(0)}
            >
                {dateLabel}
            </span>

            {/* PR chips — row below */}
            {entry.prNumbers.length > 0 && (
                <div
                    style={{
                        display: "flex",
                        gap: 4,
                        marginTop: 8,
                        flexWrap: "wrap",
                    }}
                >
                    {entry.prNumbers.map((pr, i) => (
                        <span
                            key={pr}
                            className={`${chipBase} ${y === i + 1 ? chipActive : chipInactive}`}
                            onClick={() => setY(i + 1)}
                        >
                            #{pr}
                        </span>
                    ))}
                </div>
            )}

            <div style={{ marginBottom: 14 }} />

            {/* Title */}
            <div
                className="font-headline"
                style={{
                    fontSize: 22,
                    color: "rgb(var(--text-primary))",
                    lineHeight: 1.3,
                    marginBottom: 12,
                    fontWeight: 700,
                }}
            >
                {displayTitle}
            </div>

            {/* Summary */}
            <div
                style={{
                    fontSize: 14,
                    color: "rgb(var(--text-secondary))",
                    lineHeight: 1.6,
                    overflow: "hidden",
                    display: "-webkit-box",
                    WebkitLineClamp: 8,
                    WebkitBoxOrient: "vertical",
                }}
            >
                {displaySummary}
            </div>

            {/* PR metadata */}
            {onPR && prContent && (
                <div
                    style={{
                        fontSize: 12,
                        color: "rgb(var(--text-tertiary))",
                        marginTop: 14,
                    }}
                >
                    {impactEmoji[prContent.impact] || "\u{1F4E6}"}{" "}
                    {prContent.impact} &middot; @{prContent.author}
                </div>
            )}

            {/* Weekly DNA quote */}
            {entry.type === "week" && entryContent?.dna && !onPR && (
                <div
                    style={{
                        marginTop: 16,
                        padding: "8px 12px",
                        borderLeft: "2px solid rgb(var(--border-subtle))",
                        color: "rgb(var(--text-secondary))",
                        fontSize: 13,
                        fontStyle: "italic",
                        lineHeight: 1.5,
                    }}
                >
                    &ldquo;{entryContent.dna}&rdquo;
                </div>
            )}
        </div>
    );

    if (isMobile) {
        return (
            <div
                className="font-body"
                style={{
                    color: "rgb(var(--text-primary))",
                    width: "100%",
                    paddingTop: 16,
                    paddingBottom: 24,
                }}
            >
                {ImageBox}
                <div
                    style={{
                        display: "flex",
                        alignItems: "center",
                        marginTop: 8,
                    }}
                >
                    {TimelineBar}
                </div>
                {TextPanel}
            </div>
        );
    }

    return (
        <div
            className="font-body"
            style={{
                color: "rgb(var(--text-primary))",
                width: "100%",
                padding: "16px 0",
            }}
        >
            <div style={{ display: "flex", alignItems: "stretch" }}>
                <div
                    style={{
                        width: "55%",
                        flexShrink: 0,
                        display: "flex",
                        flexDirection: "column",
                    }}
                >
                    {ImageBox}
                    <div
                        style={{
                            display: "flex",
                            alignItems: "center",
                            marginTop: 8,
                        }}
                    >
                        {TimelineBar}
                    </div>
                </div>
                {TextPanel}
            </div>
        </div>
    );
}
