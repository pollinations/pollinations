// biome-ignore-all lint/a11y/useKeyWithClickEvents: Component has global keyboard navigation via arrow keys
// biome-ignore-all lint/a11y/noStaticElementInteractions: Interactive elements handled via global keydown
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LAYOUT } from "../../copy/content/layout";
import { useAuth } from "../../hooks/useAuth";
import {
    type EntryContent,
    type EntryContentRequest,
    type PRContent,
    type TimelineEntry,
    useDiaryData,
} from "../../hooks/useDiaryData";
import { usePrettify } from "../../hooks/usePrettify";
import { LazyMarkdownGfm } from "./ui/lazy-markdown";

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
    "inline-flex items-center px-2 py-0.5 text-[11px] font-mono font-medium rounded-sub-card cursor-pointer transition duration-300 ease-in-out";
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
    // Crossfade image state
    const [shownImageUrl, setShownImageUrl] = useState("");
    const [prevImageUrl, setPrevImageUrl] = useState("");
    const [imgFading, setImgFading] = useState(false);
    // Smooth text transition state
    const [textVisible, setTextVisible] = useState(true);
    const [shownTitle, setShownTitle] = useState("");
    const [shownSummary, setShownSummary] = useState("");

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

    // Compute image URL early so the crossfade effect (a hook) can reference it unconditionally
    const currentImageUrl = onPR
        ? prContent?.imageUrl || ""
        : entry && entry.images.length > 0
          ? entry.images[
                entry.date.charCodeAt(entry.date.length - 1) %
                    entry.images.length
            ]?.url || ""
          : "";
    const entryDate = entry?.date;
    const entryType = entry?.type;
    const entrySummaryUrl = entry?.summaryUrl;

    // Fetch entry content when the selected entry changes
    // biome-ignore lint/correctness/useExhaustiveDependencies: prRefs excluded intentionally — it's an object ref that changes when timeline is enriched by getEntryContent, causing an infinite loop
    useEffect(() => {
        if (!entryDate || !entryType) return;
        const request: EntryContentRequest = {
            date: entryDate,
            type: entryType,
            summaryUrl: entrySummaryUrl,
            prRefs: entry?.prRefs ?? [],
        };
        setEntryContent(null);
        setPrContent(null);
        getEntryContent(request).then(setEntryContent);
    }, [entryDate, entryType, entrySummaryUrl, getEntryContent]);

    // Fetch PR content when y changes
    const currentPrRef = entry?.prRefs[y - 1];
    useEffect(() => {
        if (!onPR || !currentPrRef) {
            setPrContent(null);
            return;
        }
        setPrContent(null);
        getPRContent(currentPrRef.date, currentPrRef.number).then(setPrContent);
    }, [currentPrRef, onPR, getPRContent]);

    // Reset image error on navigation
    // biome-ignore lint/correctness/useExhaustiveDependencies: intentionally re-run when x/y change
    useEffect(() => {
        setImgError(false);
    }, [x, y]);

    // Crossfade: when image URL changes, keep old one underneath while new fades in
    const FADE_MS = 600;
    useEffect(() => {
        if (!currentImageUrl || currentImageUrl === shownImageUrl) return;
        setPrevImageUrl(shownImageUrl);
        setShownImageUrl(currentImageUrl);
        setImgFading(false); // new image starts transparent
        // next frame: trigger transition to opaque
        const raf = requestAnimationFrame(() => setImgFading(true));
        const t = setTimeout(() => {
            setPrevImageUrl("");
        }, FADE_MS);
        return () => {
            cancelAnimationFrame(raf);
            clearTimeout(t);
        };
    }, [currentImageUrl, shownImageUrl]);

    // Auto-cycle through day overview + PRs, pause 15s on user click
    const pauseUntil = useRef(0);
    const pauseAutoCycle = useCallback(() => {
        pauseUntil.current = Date.now() + 15000;
    }, []);
    useEffect(() => {
        if (maxY === 0) return;
        const interval = setInterval(() => {
            if (Date.now() < pauseUntil.current) return;
            setY((prev) => (prev + 1) % (maxY + 1));
        }, 5000);
        return () => clearInterval(interval);
    }, [maxY]);

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

    const displayTitle = onPR
        ? prContent?.title || LAYOUT.loadingEllipsis
        : entryContent?.title || LAYOUT.loadingEllipsis;
    const displaySummary = prettifiedSummary[0]?.text || rawSummary;

    // Smooth text transition: fade+slide out → swap content → fade+slide in
    const TEXT_FADE_MS = 400;
    useEffect(() => {
        if (!displayTitle && !displaySummary) return;
        setTextVisible(false);
        const t = setTimeout(() => {
            setShownTitle(displayTitle);
            setShownSummary(displaySummary);
            setTextVisible(true);
        }, TEXT_FADE_MS);
        return () => clearTimeout(t);
    }, [displayTitle, displaySummary]);

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

    // Image alt text
    const imageAlt = onPR
        ? `PR #${entry.prNumbers[y - 1]}`
        : `${entry.dayName} ${entry.dateLabel}`;

    // Image area — true crossfade: old fades out while new fades in
    const ImageBox = (
        <div className="w-full aspect-square bg-white shrink-0 relative overflow-hidden">
            {/* Previous image fades out */}
            {prevImageUrl && !imgError && (
                <img
                    key={`prev-${prevImageUrl}`}
                    src={prevImageUrl}
                    alt={imageAlt}
                    className="absolute inset-0 w-full h-full object-cover"
                    style={{
                        opacity: 1,
                        transition: `opacity ${FADE_MS}ms ease-in-out`,
                    }}
                />
            )}
            {/* Current image fades in */}
            {shownImageUrl && !imgError && (
                <img
                    key={`curr-${shownImageUrl}`}
                    src={shownImageUrl}
                    alt={imageAlt}
                    onError={() => setImgError(true)}
                    className="absolute inset-0 w-full h-full object-cover"
                    style={{
                        opacity: imgFading ? 1 : 0,
                        transition: `opacity ${FADE_MS}ms ease-in-out`,
                    }}
                />
            )}
        </div>
    );

    const dateLabel =
        entry.type === "week"
            ? `Week \u00B7 ${entry.dateLabel}`
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
                    className={`font-headline text-sm select-none flex items-center justify-center w-8 h-8 rounded-sub-card transition duration-200 ${
                        x > 0
                            ? "text-muted cursor-pointer bg-white/60 border-r-2 border-b-2 border-border-subtle shadow-[1px_1px_0_rgb(var(--dark)_/_0.08)] hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-none active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
                            : "text-dark/15 cursor-default bg-white/30"
                    }`}
                >
                    &#x25C0;
                </span>
                <span
                    className={`font-headline inline-flex items-center justify-center py-2 text-sm font-black uppercase tracking-wider rounded-tag cursor-pointer transition duration-300 ease-in-out min-w-[220px] ${!onPR ? `${chipActiveColors[x % chipActiveColors.length]} font-black` : chipInactiveDefault}`}
                    onClick={() => {
                        setY(0);
                        pauseAutoCycle();
                    }}
                >
                    {dateLabel}
                </span>
                <span
                    onClick={() => go("right")}
                    className={`font-headline text-sm select-none flex items-center justify-center w-8 h-8 rounded-sub-card transition duration-200 ${
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
                                pauseAutoCycle();
                            }}
                        >
                            #{pr}
                        </span>
                    ))}
                </div>
            )}

            <div className="mb-3.5" />

            {/* Title + Summary + metadata — smooth fade+slide transition */}
            <div
                style={{
                    opacity: textVisible ? 1 : 0,
                    transform: textVisible
                        ? "translateY(0)"
                        : "translateY(6px)",
                    transition: `opacity ${TEXT_FADE_MS}ms ease-in-out, transform ${TEXT_FADE_MS}ms ease-in-out`,
                }}
            >
                {/* Title */}
                <div className="font-headline text-xs text-dark leading-tight mb-3 font-bold">
                    {shownTitle || displayTitle}
                </div>

                {/* Summary */}
                <div className="text-sm text-muted leading-relaxed overflow-hidden line-clamp-[8]">
                    <LazyMarkdownGfm
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
                        {shownSummary || rawSummary}
                    </LazyMarkdownGfm>
                </div>

                {/* PR metadata */}
                {onPR && prContent && (
                    <div className="text-xs text-subtle mt-3.5">
                        {impactEmoji[prContent.impact] || "\u{1F4E6}"}{" "}
                        {prContent.impact} &middot; @{prContent.author}
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
