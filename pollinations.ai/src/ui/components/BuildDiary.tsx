// biome-ignore-all lint/a11y/useKeyWithClickEvents: Component has global keyboard navigation via arrow keys
// biome-ignore-all lint/a11y/noStaticElementInteractions: Interactive elements handled via global keydown
import { useCallback, useEffect, useState } from "react";
import {
    type EntryContent,
    type PRContent,
    type TimelineEntry,
    useDiaryData,
} from "../../hooks/useDiaryData";

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
        <div className="group/tip relative">
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
    const maxY = entry ? entry.prNumbers.length : 0;
    const onPR = y > 0 && y <= maxY;

    // Fetch entry content when x changes
    const entryDate = entry?.date;
    const entryType = entry?.type;
    const entryPrNumbers = entry?.prNumbers;
    useEffect(() => {
        if (!entryDate || !entryType || !entryPrNumbers) return;
        setEntryContent(null);
        setPrContent(null);
        getEntryContent(entryDate, entryType, entryPrNumbers).then(
            setEntryContent,
        );
    }, [entryDate, entryType, entryPrNumbers, getEntryContent]);

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

    // Keyboard — only ← →, skip when focus is in an interactive element
    useEffect(() => {
        const h = (e: KeyboardEvent) => {
            const tag = (e.target as HTMLElement)?.tagName;
            if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT")
                return;
            if ((e.target as HTMLElement)?.isContentEditable) return;
            if (e.key === "ArrowLeft") go("left");
            if (e.key === "ArrowRight") go("right");
        };
        window.addEventListener("keydown", h);
        return () => window.removeEventListener("keydown", h);
    }, [go]);

    // Loading state
    if (loading) {
        return (
            <div className="font-body py-10 text-center text-text-body-tertiary">
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

    // Timeline bar — dots only, no arrows
    const TimelineBar = (
        <div className="flex items-center h-5 flex-1">
            <div className="flex-1 h-0.5 bg-border-faint flex items-center justify-between px-1">
                {timeline.map((t, i) => {
                    const isCurrent = i === x;
                    const isMilestone = t.type === "week";
                    const needsGap =
                        i > 0 && t.weekNum !== timeline[i - 1].weekNum;
                    const tipLabel = isMilestone
                        ? `Week ${t.weekNum}`
                        : t.dateLabel;
                    return (
                        <div
                            key={`${t.date}-${t.type}`}
                            className="flex items-center"
                        >
                            {needsGap && <div className="w-1" />}
                            <Tip label={tipLabel}>
                                <div
                                    onClick={() => {
                                        setX(i);
                                        setY(0);
                                    }}
                                    className="w-5 h-5 flex items-center justify-center cursor-pointer"
                                >
                                    <div
                                        className={`rounded-full ${
                                            isCurrent
                                                ? "w-2.5 h-2.5 bg-text-body-main"
                                                : isMilestone
                                                  ? "w-1.5 h-1.5 bg-text-brand"
                                                  : "w-1.5 h-1.5 bg-border-subtle"
                                        }`}
                                    />
                                </div>
                            </Tip>
                        </div>
                    );
                })}
            </div>
        </div>
    );

    // Image area
    const ImageBox = (
        <div className="w-full aspect-square bg-input-background shrink-0 relative overflow-hidden">
            {currentImageUrl && !imgError && (
                <img
                    src={currentImageUrl}
                    alt={imageAlt}
                    onError={() => setImgError(true)}
                    className="w-full h-full object-cover block"
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
            ? `Week ${entry.weekNum}`
            : `${entry.dayName} \u00B7 ${entry.dateLabel}`;

    const TextPanel = (
        <div
            className={`font-body flex-1 min-w-0 flex flex-col justify-start overflow-hidden box-border ${
                isMobile ? "px-1 pt-4 pb-5" : "px-7"
            }`}
        >
            {/* Date chip with nav arrows */}
            <div className="self-start inline-flex items-center gap-2">
                <span
                    onClick={() => go("left")}
                    className={`font-headline text-lg select-none flex items-center justify-center transition-colors ${
                        x > 0
                            ? "text-text-body-secondary cursor-pointer"
                            : "text-text-body-main/15 cursor-default"
                    }`}
                >
                    &#x25C0;
                </span>
                <span
                    className={`font-headline inline-flex items-center justify-center py-2 text-2xl font-black uppercase tracking-wider rounded-tag cursor-pointer transition-colors min-w-[220px] ${!onPR ? chipActive : chipInactive}`}
                    onClick={() => setY(0)}
                >
                    {dateLabel}
                </span>
                <span
                    onClick={() => go("right")}
                    className={`font-headline text-lg select-none flex items-center justify-center transition-colors ${
                        x < timeline.length - 1
                            ? "text-text-body-secondary cursor-pointer"
                            : "text-text-body-main/15 cursor-default"
                    }`}
                >
                    &#x25B6;
                </span>
            </div>

            {/* PR chips — row below */}
            {entry.prNumbers.length > 0 && (
                <div className="flex gap-1 mt-2 flex-wrap">
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

            <div className="mb-3.5" />

            {/* Title */}
            <div className="font-headline text-[22px] text-text-body-main leading-tight mb-3 font-bold">
                {displayTitle}
            </div>

            {/* Summary */}
            <div className="text-sm text-text-body-secondary leading-relaxed overflow-hidden line-clamp-[8]">
                {displaySummary}
            </div>

            {/* PR metadata */}
            {onPR && prContent && (
                <div className="text-xs text-text-body-tertiary mt-3.5">
                    {impactEmoji[prContent.impact] || "\u{1F4E6}"}{" "}
                    {prContent.impact} &middot; @{prContent.author}
                </div>
            )}

            {/* Weekly DNA quote */}
            {entry.type === "week" && entryContent?.dna && !onPR && (
                <div className="mt-4 px-3 py-2 border-l-2 border-border-subtle text-text-body-secondary text-[13px] italic leading-normal">
                    &ldquo;{entryContent.dna}&rdquo;
                </div>
            )}
        </div>
    );

    if (isMobile) {
        return (
            <div className="font-body text-text-body-main w-full pt-4 pb-6">
                {ImageBox}
                <div className="flex items-center mt-2">{TimelineBar}</div>
                {TextPanel}
            </div>
        );
    }

    return (
        <div className="font-body text-text-body-main w-full py-4">
            <div className="flex items-stretch">
                <div className="w-[55%] shrink-0 flex flex-col">
                    {ImageBox}
                    <div className="flex items-center mt-2">{TimelineBar}</div>
                </div>
                {TextPanel}
            </div>
        </div>
    );
}
