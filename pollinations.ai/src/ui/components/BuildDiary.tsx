// biome-ignore-all lint/a11y/useKeyWithClickEvents: Component has global keyboard navigation via arrow keys
// biome-ignore-all lint/a11y/noStaticElementInteractions: Interactive elements handled via global keydown
import { useCallback, useEffect, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { LAYOUT } from "../../copy/content/layout";
import { useAuth } from "../../hooks/useAuth";
import {
    type EntryContent,
    type PRContent,
    type TimelineEntry,
    useDiaryData,
} from "../../hooks/useDiaryData";
import { usePrettify } from "../../hooks/usePrettify";

const MOBILE_BP = 580;

const impactEmoji: Record<string, string> = {
    feature: "\u{1F680}",
    improvement: "\u{1F9E0}",
    bug_fix: "\u{1F6E0}",
    infrastructure: "\u{2699}\u{FE0F}",
    docs: "\u{1F4D6}",
    community: "\u{1F91D}",
};

const chipBase =
    "inline-flex items-center px-2 py-0.5 text-[11px] font-mono font-medium rounded-sub-card cursor-pointer transition-all duration-300 ease-in-out";
const chipColors = [
    "border-primary-strong shadow-[1px_1px_0_rgb(var(--primary-strong)_/_0.3)]",
    "border-secondary-strong shadow-[1px_1px_0_rgb(var(--secondary-strong)_/_0.3)]",
    "border-tertiary-strong shadow-[1px_1px_0_rgb(var(--tertiary-strong)_/_0.3)]",
    "border-accent-strong shadow-[1px_1px_0_rgb(var(--accent-strong)_/_0.3)]",
];
const chipActiveColors = [
    "bg-primary-strong text-dark border-r-2 border-b-2 border-dark/20 shadow-[2px_2px_0_rgb(var(--dark)_/_0.2)]",
    "bg-secondary-strong text-dark border-r-2 border-b-2 border-dark/20 shadow-[2px_2px_0_rgb(var(--dark)_/_0.2)]",
    "bg-tertiary-strong text-dark border-r-2 border-b-2 border-dark/20 shadow-[2px_2px_0_rgb(var(--dark)_/_0.2)]",
    "bg-accent-strong text-dark border-r-2 border-b-2 border-dark/20 shadow-[2px_2px_0_rgb(var(--dark)_/_0.2)]",
];
const chipInactive =
    "bg-white/60 text-muted border-r-2 border-b-2 hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-none active:translate-x-[2px] active:translate-y-[2px] active:shadow-none";
const chipInactiveDefault =
    "bg-white/60 text-muted border-r-2 border-b-2 border-border-subtle shadow-[1px_1px_0_rgb(var(--dark)_/_0.08)] hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-none active:translate-x-[2px] active:translate-y-[2px] active:shadow-none";

export function BuildDiary() {
    const { timeline, loading, error, getEntryContent, getPRContent } =
        useDiaryData();
    const { apiKey } = useAuth();

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

    // Auto-cycle through day overview + PRs
    const [autoCycling, setAutoCycling] = useState(true);
    useEffect(() => {
        if (!autoCycling || maxY === 0) return;
        const interval = setInterval(() => {
            // Cycle: 0 (overview) → 1 → 2 → ... → maxY → 0
            setY((prev) => (prev + 1) % (maxY + 1));
        }, 5000);
        return () => clearInterval(interval);
    }, [autoCycling, maxY]);

    // Stop auto-cycling on manual interaction, restart on day change
    // biome-ignore lint/correctness/useExhaustiveDependencies: restart auto-cycle when day changes
    useEffect(() => {
        setAutoCycling(true);
    }, [x]);

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

    // Prettify the summary text
    const rawSummary = onPR
        ? prContent?.description || ""
        : entryContent?.summary || "";
    const rawTitle = onPR ? prContent?.title || "" : entryContent?.title || "";
    const summaryItem = useMemo(
        () =>
            rawSummary
                ? [{ id: `diary-${x}-${y}`, text: rawSummary, name: rawTitle }]
                : [],
        [rawSummary, rawTitle, x, y],
    );
    const { prettified: prettifiedSummary } = usePrettify(
        summaryItem,
        "text",
        apiKey,
        "name",
    );

    // Loading state
    if (loading) {
        return (
            <div className="font-body py-10 text-center text-subtle">
                {LAYOUT.loadingBuildDiary}
            </div>
        );
    }

    if (error || timeline.length === 0 || !entry) {
        return null;
    }

    // Current image
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

    // Image area — crossfade between overview and PR images
    const ImageBox = (
        <div className="w-full aspect-square bg-white shrink-0 relative overflow-hidden">
            {currentImageUrl && !imgError && (
                <img
                    key={currentImageUrl}
                    src={currentImageUrl}
                    alt={imageAlt}
                    onError={() => setImgError(true)}
                    className="absolute inset-0 w-full h-full object-cover animate-[fade-in_0.8s_ease-in-out]"
                />
            )}
        </div>
    );

    // Text panel
    const displayTitle = onPR
        ? prContent?.title || LAYOUT.loadingEllipsis
        : entryContent?.title || LAYOUT.loadingEllipsis;
    const displaySummary = prettifiedSummary[0]?.text || rawSummary;

    // Date heading label
    const dateLabel =
        entry.type === "week"
            ? `${LAYOUT.weekLabel} ${entry.weekNum}`
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
                    className={`font-headline text-sm select-none flex items-center justify-center w-8 h-8 rounded-sub-card transition-all duration-200 ${
                        x > 0
                            ? "text-muted cursor-pointer bg-white/60 border-r-2 border-b-2 border-border-subtle shadow-[1px_1px_0_rgb(var(--dark)_/_0.08)] hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-none active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
                            : "text-dark/15 cursor-default bg-white/30"
                    }`}
                >
                    &#x25C0;
                </span>
                <span
                    className={`font-headline inline-flex items-center justify-center py-2 text-sm font-black uppercase tracking-wider rounded-tag cursor-pointer transition-all duration-300 ease-in-out min-w-[220px] ${!onPR ? `${chipActiveColors[x % chipActiveColors.length]} font-black` : chipInactiveDefault}`}
                    onClick={() => {
                        setY(0);
                        setAutoCycling(false);
                    }}
                >
                    {dateLabel}
                </span>
                <span
                    onClick={() => go("right")}
                    className={`font-headline text-sm select-none flex items-center justify-center w-8 h-8 rounded-sub-card transition-all duration-200 ${
                        x < timeline.length - 1
                            ? "text-muted cursor-pointer bg-white/60 border-r-2 border-b-2 border-border-subtle shadow-[1px_1px_0_rgb(var(--dark)_/_0.08)] hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-none active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
                            : "text-dark/15 cursor-default bg-white/30"
                    }`}
                >
                    &#x25B6;
                </span>
            </div>

            {/* PR chips — right below date */}
            {entry.prNumbers.length > 0 && (
                <div className="flex gap-1 mt-2 flex-wrap">
                    {entry.prNumbers.map((pr, i) => (
                        <span
                            key={pr}
                            className={`${chipBase} ${y === i + 1 ? chipActiveColors[i % chipActiveColors.length] : `${chipInactive} ${chipColors[i % chipColors.length]}`}`}
                            onClick={() => {
                                setY(i + 1);
                                setAutoCycling(false);
                            }}
                        >
                            #{pr}
                        </span>
                    ))}
                </div>
            )}

            <div className="mb-3.5" />

            {/* Title + Summary + metadata — fade on change */}
            <div
                key={`content-${x}-${y}`}
                className="animate-[fade-in_0.5s_ease-in-out]"
            >
                {/* Title */}
                <div className="font-headline text-xs text-dark leading-tight mb-3 font-bold">
                    {displayTitle}
                </div>

                {/* Summary */}
                <div className="text-sm text-muted leading-relaxed overflow-hidden line-clamp-[8]">
                    <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        components={{
                            p: ({ node, ...props }) => (
                                <p {...props} className="mb-1 last:mb-0" />
                            ),
                            ul: ({ node, ...props }) => (
                                <ul
                                    {...props}
                                    className="mt-1 space-y-0.5 list-disc list-inside"
                                />
                            ),
                            li: ({ node, ...props }) => (
                                <li {...props} className="text-muted" />
                            ),
                            strong: ({ node, ...props }) => (
                                <strong
                                    {...props}
                                    className="text-dark font-black"
                                />
                            ),
                            em: ({ node, ...props }) => (
                                <em
                                    {...props}
                                    className="text-dark not-italic font-medium"
                                />
                            ),
                            code: ({ node, ...props }) => (
                                <code
                                    {...props}
                                    className="bg-white text-dark px-1.5 py-0.5 rounded text-xs font-mono"
                                />
                            ),
                        }}
                    >
                        {displaySummary}
                    </ReactMarkdown>
                </div>

                {/* PR metadata */}
                {onPR && prContent && (
                    <div className="text-xs text-subtle mt-3.5">
                        {impactEmoji[prContent.impact] || "\u{1F4E6}"}{" "}
                        {prContent.impact} &middot; @{prContent.author}
                    </div>
                )}

                {/* Weekly DNA quote */}
                {entry.type === "week" && entryContent?.dna && !onPR && (
                    <div className="mt-4 px-3 py-2 border-l-2 border-tan text-muted text-[13px] italic leading-normal">
                        &ldquo;{entryContent.dna}&rdquo;
                    </div>
                )}
            </div>
        </div>
    );

    if (isMobile) {
        return (
            <div className="font-body text-dark w-full pt-4 pb-6">
                {ImageBox}
                {TextPanel}
            </div>
        );
    }

    return (
        <div className="font-body text-dark w-full py-4">
            <div className="flex items-stretch">
                <div className="w-[55%] shrink-0">{ImageBox}</div>
                {TextPanel}
            </div>
        </div>
    );
}
