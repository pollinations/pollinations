import {
    ArrowRightIcon,
    Button,
    LoadingStatus,
    Surface,
    TabButton,
    Text,
} from "@pollinations/ui";
import {
    lazy,
    Suspense,
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
} from "react";
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

// Markdown pulls in react-markdown; load it only once a summary renders.
const Markdown = lazy(() =>
    import("@pollinations/ui/markdown").then((module) => ({
        default: module.Markdown,
    })),
);

const impactEmoji: Record<string, string> = {
    feature: "\u{1F680}",
    improvement: "\u{1F9E0}",
    bug_fix: "\u{1F6E0}",
    infrastructure: "\u{2699}\u{FE0F}",
    docs: "\u{1F4D6}",
    community: "\u{1F91D}",
};

export function BuildDiary() {
    const { timeline, loading, error, getEntryContent, getPRContent } =
        useDiaryData();
    const { apiKey } = useAuth();

    const [x, setX] = useState(-1); // -1 until loaded
    const [y, setY] = useState(0); // 0 = overview, 1+ = PR index
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
        apiKey ?? undefined,
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
        return <LoadingStatus>{LAYOUT.loadingBuildDiary}</LoadingStatus>;
    }

    if (error || timeline.length === 0 || !entry) {
        return null;
    }

    // Image alt text
    const imageAlt = onPR
        ? `PR #${entry.prNumbers[y - 1]}`
        : `${entry.dayName} ${entry.dateLabel}`;

    const dateLabel =
        entry.type === "week"
            ? `Week \u00B7 ${entry.dateLabel}`
            : `${entry.dayName} \u00B7 ${entry.dateLabel}`;

    const summary = shownSummary || rawSummary;

    return (
        <Surface variant="card" className="overflow-hidden p-0">
            <div className="grid overflow-hidden min-[540px]:min-h-80 min-[540px]:grid-cols-[minmax(260px,0.9fr)_minmax(0,1.1fr)]">
                {/* Image area — true crossfade: old fades out while new fades in */}
                <div className="relative aspect-[4/3] min-h-0 overflow-hidden bg-theme-bg-subtle min-[540px]:aspect-auto">
                    {prevImageUrl && !imgError && (
                        <img
                            key={`prev-${prevImageUrl}`}
                            src={prevImageUrl}
                            alt={imageAlt}
                            className="absolute inset-0 h-full w-full object-cover"
                            style={{
                                opacity: 1,
                                transition: `opacity ${FADE_MS}ms ease-in-out`,
                            }}
                        />
                    )}
                    {shownImageUrl && !imgError && (
                        <img
                            key={`curr-${shownImageUrl}`}
                            src={shownImageUrl}
                            alt={imageAlt}
                            onError={() => setImgError(true)}
                            className="absolute inset-0 h-full w-full object-cover"
                            style={{
                                opacity: imgFading ? 1 : 0,
                                transition: `opacity ${FADE_MS}ms ease-in-out`,
                            }}
                        />
                    )}
                    <div className="absolute right-0 bottom-3 left-0 flex items-center justify-center gap-2">
                        <Button
                            size="sm"
                            intent="neutral"
                            disabled={x <= 0}
                            onClick={() => go("left")}
                            aria-label="Previous diary entry"
                            className="h-9 w-9 p-0"
                        >
                            <ArrowRightIcon className="h-4 w-4 rotate-180" />
                        </Button>
                        <Button
                            size="sm"
                            intent="neutral"
                            disabled={x >= timeline.length - 1}
                            onClick={() => go("right")}
                            aria-label="Next diary entry"
                            className="h-9 w-9 p-0"
                        >
                            <ArrowRightIcon className="h-4 w-4" />
                        </Button>
                    </div>
                </div>

                <div className="flex min-w-0 flex-col gap-4 p-5 sm:p-7">
                    <div className="flex flex-col items-start gap-2">
                        {/* Date chip returns to the day overview */}
                        <TabButton
                            active={!onPR}
                            size="sm"
                            onClick={() => {
                                setY(0);
                                pauseAutoCycle();
                            }}
                        >
                            {dateLabel}
                        </TabButton>

                        {/* PR chips — right below date */}
                        {entry.prNumbers.length > 0 && (
                            <div className="flex flex-wrap gap-1">
                                {entry.prNumbers.map((pr, i) => (
                                    <TabButton
                                        key={pr}
                                        active={y === i + 1}
                                        size="xs"
                                        className="font-mono"
                                        onClick={() => {
                                            setY(i + 1);
                                            pauseAutoCycle();
                                        }}
                                    >
                                        #{pr}
                                    </TabButton>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Title + Summary + metadata — smooth fade+slide transition */}
                    <div
                        className="flex flex-col gap-3"
                        style={{
                            opacity: textVisible ? 1 : 0,
                            transform: textVisible
                                ? "translateY(0)"
                                : "translateY(6px)",
                            transition: `opacity ${TEXT_FADE_MS}ms ease-in-out, transform ${TEXT_FADE_MS}ms ease-in-out`,
                        }}
                    >
                        <h3 className="line-clamp-2 font-subheading text-2xl text-theme-text-strong leading-tight sm:text-3xl">
                            {shownTitle || displayTitle}
                        </h3>

                        <div className="line-clamp-6 text-sm text-theme-text-base leading-relaxed sm:text-base">
                            <Suspense fallback={<span>{summary}</span>}>
                                <Markdown>{summary}</Markdown>
                            </Suspense>
                        </div>

                        {/* PR metadata */}
                        {onPR && prContent && (
                            <Text size="xs" tone="muted">
                                {impactEmoji[prContent.impact] || "\u{1F4E6}"}{" "}
                                {prContent.impact} &middot; @{prContent.author}
                            </Text>
                        )}
                    </div>
                </div>
            </div>
        </Surface>
    );
}
