import {
    ArrowRightIcon,
    Button,
    Chip,
    ContentHeader,
    EmptyState,
    Eyebrow,
    GitPullRequestIcon,
    Heading,
    InlineLink,
    Skeleton,
    Surface,
    Text,
} from "@pollinations/ui";
import { type KeyboardEvent, useRef, useState } from "react";
import { type DiaryMonth, useBuildDiary } from "../../data/community";

const NEWS_URL = "https://enter.pollinations.ai/news";

const monthName = (month: string, style: "long" | "short") =>
    new Date(`${month}-01T00:00:00Z`).toLocaleDateString("en-GB", {
        month: style,
        year: style === "long" ? "numeric" : "2-digit",
        timeZone: "UTC",
    });

/** Pull requests merged each month since 2025, with that month's write-up. */
export function BuildDiary() {
    const { data: months, loading, failed } = useBuildDiary();
    const [picked, setPicked] = useState<number | null>(null);
    // The latest month until the visitor picks another.
    const index = picked ?? months.length - 1;
    const current = months[index];

    return (
        <section
            aria-busy={loading || undefined}
            className="flex flex-col gap-5"
        >
            <ContentHeader
                eyebrow="Build diary"
                title="Explore our build history"
                subtitle="Pull requests merged each month since 2025, with the story of what shipped."
                action={
                    <InlineLink href={NEWS_URL}>Read all updates</InlineLink>
                }
            />
            {failed ? (
                <EmptyState>
                    The build diary couldn’t be loaded right now.
                </EmptyState>
            ) : loading || !current ? (
                <DiarySkeleton />
            ) : (
                <Surface variant="card" className="overflow-hidden p-0">
                    <Curve months={months} index={index} onPick={setPicked} />
                    <Story
                        month={current}
                        onPrevious={
                            index > 0 ? () => setPicked(index - 1) : undefined
                        }
                        onNext={
                            index < months.length - 1
                                ? () => setPicked(index + 1)
                                : undefined
                        }
                    />
                </Surface>
            )}
        </section>
    );
}

/**
 * One smooth curve with a single month picker: drag or tap anywhere on the
 * plot for the nearest month, or use the arrow keys. Dots are drawn, not
 * buttons, so 21 months stay easy to pick on a phone.
 */
function Curve({
    months,
    index,
    onPick,
}: {
    months: DiaryMonth[];
    index: number;
    onPick: (index: number) => void;
}) {
    const plot = useRef<HTMLDivElement>(null);
    // Touch picks on a tap or a sideways drag only, so scrolling past the
    // chart never changes the month. Mouse and pen pick straight away.
    const touch = useRef<{ x: number; y: number; dragging: boolean } | null>(
        null,
    );
    const max = Math.max(...months.map((month) => month.merged), 1);
    const points = months.map((month, i) => ({
        x: months.length === 1 ? 50 : 2 + (i / (months.length - 1)) * 96,
        y: 92 - (month.merged / max) * 84,
    }));
    const curve = points.reduce((path, point, i) => {
        if (i === 0) return `M ${point.x} ${point.y}`;
        const previous = points[i - 1];
        const mid = (previous.x + point.x) / 2;
        return `${path} C ${mid} ${previous.y}, ${mid} ${point.y}, ${point.x} ${point.y}`;
    }, "");
    // Closed along the zero line (y 92), not the plot's bottom edge.
    const area = `${curve} L ${points[points.length - 1].x} 92 L ${points[0].x} 92 Z`;
    const active = points[index];
    const current = months[index];
    const last = months.length - 1;

    const pickAt = (clientX: number) => {
        const box = plot.current?.getBoundingClientRect();
        if (!box) return;
        // Points span 2%–98% of the plot, so map into that band.
        const percent = ((clientX - box.left) / box.width) * 100;
        const ratio = Math.min(1, Math.max(0, (percent - 2) / 96));
        onPick(Math.round(ratio * last));
    };

    const step: Record<string, number> = {
        ArrowLeft: -1,
        ArrowDown: -1,
        ArrowRight: 1,
        ArrowUp: 1,
    };
    const onKeyDown = (event: KeyboardEvent) => {
        if (event.key === "Home") onPick(0);
        else if (event.key === "End") onPick(last);
        else if (event.key in step)
            onPick(Math.min(last, Math.max(0, index + step[event.key])));
        else return;
        event.preventDefault();
    };

    return (
        <div className="flex flex-col gap-3 p-5 sm:p-6">
            <Text size="sm" tone="muted">
                Pull requests merged each month
            </Text>
            <div className="relative h-44 pl-9 sm:h-52">
                {/* Labels share the plot's inset so each sits on its line. */}
                <div className="absolute top-2 bottom-7 left-0 text-micro text-theme-text-muted tabular-nums">
                    {[
                        [max, "8%"],
                        [Math.ceil(max / 2), "50%"],
                        [0, "92%"],
                    ].map(([value, top]) => (
                        <span
                            key={top}
                            className="absolute left-0 -translate-y-1/2"
                            style={{ top }}
                        >
                            {value}
                        </span>
                    ))}
                </div>
                <div
                    ref={plot}
                    role="slider"
                    tabIndex={0}
                    aria-label="Month"
                    aria-valuemin={0}
                    aria-valuemax={last}
                    aria-valuenow={index}
                    aria-valuetext={`${monthName(current.month, "long")}: ${current.merged} pull requests merged`}
                    onPointerDown={(event) => {
                        if (event.pointerType !== "touch") {
                            pickAt(event.clientX);
                            return;
                        }
                        touch.current = {
                            x: event.clientX,
                            y: event.clientY,
                            dragging: false,
                        };
                    }}
                    onPointerMove={(event) => {
                        const start = touch.current;
                        if (event.pointerType !== "touch") {
                            if (event.buttons === 1) pickAt(event.clientX);
                        } else if (start) {
                            const dx = Math.abs(event.clientX - start.x);
                            const dy = Math.abs(event.clientY - start.y);
                            if (dx > 8 && dx > dy) start.dragging = true;
                            if (start.dragging) pickAt(event.clientX);
                        }
                    }}
                    onPointerUp={(event) => {
                        if (touch.current) pickAt(event.clientX);
                        touch.current = null;
                    }}
                    onPointerCancel={() => {
                        touch.current = null;
                    }}
                    onKeyDown={onKeyDown}
                    className="absolute top-2 right-1 bottom-7 left-9 cursor-pointer touch-pan-y rounded-md outline-none focus-visible:ring-2 focus-visible:ring-theme-border"
                >
                    <span className="absolute top-[8%] right-0 left-0 border-theme-border border-t border-dashed" />
                    <span className="absolute top-1/2 right-0 left-0 border-theme-border border-t border-dashed" />
                    <span className="absolute top-[92%] right-0 left-0 border-theme-border border-t border-dashed" />
                    <svg
                        aria-hidden="true"
                        viewBox="0 0 100 100"
                        preserveAspectRatio="none"
                        className="absolute inset-0 h-full w-full overflow-visible"
                    >
                        <path
                            d={area}
                            fill="color-mix(in oklab, var(--polli-color-bg-active) 32%, transparent)"
                        />
                        <path
                            d={curve}
                            fill="none"
                            stroke="var(--polli-color-text-soft)"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth="2"
                            vectorEffect="non-scaling-stroke"
                        />
                    </svg>
                    {/* The picked month: a guide down to the axis and a dot. */}
                    <span
                        aria-hidden="true"
                        className="absolute bottom-[8%] border-theme-text-soft/60 border-l border-dashed"
                        style={{ left: `${active.x}%`, top: `${active.y}%` }}
                    />
                    {points.map((point, i) => (
                        <span
                            key={months[i].month}
                            aria-hidden="true"
                            className={
                                i === index
                                    ? "absolute size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-theme-text-strong bg-theme-bg-active"
                                    : "absolute size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-theme-text-soft/60"
                            }
                            style={{ left: `${point.x}%`, top: `${point.y}%` }}
                        />
                    ))}
                </div>
                <div className="absolute right-1 bottom-0 left-9 flex justify-between text-micro text-theme-text-muted">
                    <span>{monthName(months[0].month, "short")}</span>
                    <span>{monthName(months[last].month, "short")}</span>
                </div>
            </div>
        </div>
    );
}

/**
 * The loaded card's frame, so nothing below moves when the diary arrives.
 * Same blocks and heights as Curve and Story.
 */
function DiarySkeleton() {
    return (
        <Surface variant="card" className="overflow-hidden p-0">
            <div className="flex flex-col gap-3 p-5 sm:p-6">
                <Skeleton shape="text" className="h-6 w-48" />
                <Skeleton className="h-44 sm:h-52" />
            </div>
            <div className="grid border-theme-text-strong/10 border-t md:h-80 md:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
                <Skeleton
                    shape="media"
                    className="aspect-[16/9] md:aspect-auto md:h-80"
                />
                <div className="h-60 md:h-80" />
            </div>
        </Surface>
    );
}

/**
 * The picked month's write-up at a fixed height, so switching moves nothing.
 * Two columns from md, where the text column is wide enough for its clamps.
 */
function Story({
    month,
    onPrevious,
    onNext,
}: {
    month: DiaryMonth;
    onPrevious?: () => void;
    onNext?: () => void;
}) {
    return (
        <div className="grid border-theme-text-strong/10 border-t md:h-80 md:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
            <div className="relative aspect-[16/9] bg-theme-bg-subtle md:aspect-auto md:h-80">
                {/* A month without a write-up keeps the same frame, empty. */}
                {month.image && (
                    <img
                        key={month.month}
                        src={month.image}
                        alt=""
                        aria-hidden="true"
                        loading="lazy"
                        className="h-full w-full object-cover"
                    />
                )}
                <div className="absolute right-3 bottom-3 flex gap-2">
                    <Button
                        size="icon"
                        intent="surface"
                        disabled={!onPrevious}
                        onClick={onPrevious}
                        aria-label="Previous month"
                    >
                        <ArrowRightIcon className="size-4 rotate-180" />
                    </Button>
                    <Button
                        size="icon"
                        intent="surface"
                        disabled={!onNext}
                        onClick={onNext}
                        aria-label="Next month"
                    >
                        <ArrowRightIcon className="size-4" />
                    </Button>
                </div>
            </div>
            <div className="flex h-60 min-w-0 flex-col gap-3 p-5 md:h-80 md:p-7">
                <div className="flex flex-wrap items-center gap-2.5">
                    <Eyebrow>{monthName(month.month, "long")}</Eyebrow>
                    <Chip size="sm">
                        <GitPullRequestIcon className="size-3" />
                        {month.merged} PRs merged
                    </Chip>
                </div>
                <Heading as="h3" size="subsection" className="line-clamp-2">
                    {month.title ?? "No write-up for this month yet"}
                </Heading>
                {month.summary && (
                    <Text
                        size="sm"
                        className="line-clamp-3 leading-relaxed md:line-clamp-6"
                    >
                        {month.summary}
                    </Text>
                )}
            </div>
        </div>
    );
}
