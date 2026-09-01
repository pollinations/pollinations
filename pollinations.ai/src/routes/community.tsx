import {
    AppIcon,
    ArrowRightIcon,
    BeakerIcon,
    Button,
    Callout,
    Chip,
    CodeIcon,
    ContentHeader,
    cn,
    DiscordIcon,
    Eyebrow,
    GitPullRequestIcon,
    InlineLink,
    LinkCard,
    Surface,
    TabButton,
} from "@pollinations/ui";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import {
    DISCORD_URL,
    REPO_URL,
    SUPPORTERS,
    useBuildDiary,
    useBuildDiaryAll,
    useBuildDiaryYear,
    useContributorCount,
    useContributors,
    useDiscordPresence,
    useVotingIssues,
} from "../data/community";
import {
    compact,
    useAppDirectory,
    usePlatformStats,
} from "../data/publicStats";
import { routeHead } from "../routeMeta";
import { QuestLeaderboard } from "../ui/components/QuestLeaderboard";
import { HeroScene, postHeroSpacingClassName } from "../ui/site/HeroScene";

export const Route = createFileRoute("/community")({
    head: () => routeHead("/community"),
    component: CommunityPage,
});

/** Four ways to contribute, from publishing work to shaping the platform. */
const WAYS_IN = [
    {
        label: "Apps",
        icon: AppIcon,
        title: "Publish an app",
        body: "Share what you built, get feedback, and help users discover it.",
        links: [
            {
                label: "Publish an app",
                href: "https://github.com/pollinations/pollinations/issues/new?template=APP-SUBMISSION.yml",
            },
        ],
    },
    {
        label: "Models",
        icon: BeakerIcon,
        title: "Publish a model",
        body: "Bring your own model to the public catalog and make it available to builders.",
        links: [
            {
                label: "Publish a model",
                href: "https://github.com/pollinations/pollinations/issues/new?template=community-model-allowlist.yml",
            },
        ],
    },
    {
        label: "Code",
        icon: CodeIcon,
        title: "Submit a feature, fix a bug, or improve the docs",
        body: "Open a PR, close an issue, propose a feature, or improve the examples.",
        links: [
            {
                label: "Good first issues",
                href: `${REPO_URL}/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22`,
            },
        ],
    },
    {
        label: "Talk",
        icon: DiscordIcon,
        title: "Help in Discord",
        body: "Answer questions, share experiments, and tell the team what feels missing.",
        links: [{ label: "Join the Discord", href: DISCORD_URL }],
    },
];

const FEED_SKELETON_KEYS = ["first", "second", "third", "fourth"];
const CONTRIBUTOR_COUNT_FALLBACK = 136;

/**
 * Every feed on this page can fail — GitHub is rate-limited per visitor IP and
 * Discord's widget can be off. Returning null on failure quietly deleted whole
 * sections, so on a bad day the page was a hero and a CTA with no sign that
 * anything was missing. Each section now says what it could not load.
 */
function FeedState({
    loading,
    failed,
    what,
    rows = 3,
}: {
    loading: boolean;
    failed: boolean;
    what: string;
    rows?: number;
}) {
    if (loading) {
        return (
            <div className="flex flex-col gap-3" aria-busy="true">
                {FEED_SKELETON_KEYS.slice(0, rows).map((key) => (
                    <div
                        key={key}
                        aria-hidden="true"
                        className="h-14 animate-pulse rounded-2xl bg-theme-bg-subtle"
                    />
                ))}
            </div>
        );
    }
    return (
        <p className="rounded-2xl border border-theme-border border-dashed px-5 py-6 text-sm text-theme-text-muted">
            {failed
                ? `${what} couldn’t be loaded right now.`
                : `No ${what.toLowerCase()} yet.`}
        </p>
    );
}

function CommunityParticipation() {
    const { data: issues, loading, failed } = useVotingIssues();
    const { data: online } = useDiscordPresence();
    const { data: contributorCount } = useContributorCount();
    const { data: platform } = usePlatformStats();
    const { data: apps } = useAppDirectory();
    const bare = loading || failed || issues.length === 0;
    const ways = [
        {
            ...WAYS_IN[0],
            metrics: [
                {
                    value: apps.length > 0 ? String(apps.length) : null,
                    label: "published apps",
                },
            ],
        },
        {
            ...WAYS_IN[1],
            metrics: [
                {
                    value:
                        platform !== null ? compact(platform.community) : null,
                    label: "published models",
                },
            ],
        },
        {
            ...WAYS_IN[2],
            metrics: [
                {
                    value: compact(
                        contributorCount ?? CONTRIBUTOR_COUNT_FALLBACK,
                    ),
                    label: "code contributors",
                },
            ],
        },
        {
            ...WAYS_IN[3],
            metrics: [
                {
                    value: online !== null ? String(online) : null,
                    label: "Discord online",
                },
            ],
        },
    ];

    return (
        <>
            <HeroScene scene="/heroes/community.webp">
                <ContentHeader
                    eyebrow="Open source, open roadmap"
                    title="Contribute"
                    subtitle={
                        <>
                            <strong>
                                Builders shape the platform directly.
                            </strong>{" "}
                            Share what you need, meet the people already using
                            it, and help decide what comes next.
                        </>
                    }
                    variant="page"
                />
            </HeroScene>

            <div
                className={cn(postHeroSpacingClassName, "flex flex-col gap-7")}
            >
                <div className="grid grid-cols-1 gap-5 min-[540px]:grid-cols-2 xl:grid-cols-4">
                    {ways.map((way) => {
                        const WayIcon = way.icon;

                        return (
                            <Surface
                                variant="card"
                                key={way.label}
                                className="flex flex-col gap-2.5 p-7 min-[700px]:p-5 lg:p-7"
                            >
                                <div className="flex items-center gap-1.5 text-theme-text-muted">
                                    <WayIcon className="size-3.5" />
                                    <Eyebrow>{way.label}</Eyebrow>
                                </div>
                                <h3 className="font-body text-xl font-semibold text-theme-text-strong">
                                    {way.title}
                                </h3>
                                <p className="text-sm leading-relaxed text-theme-text-base">
                                    {way.body}
                                </p>
                                <dl className="mt-auto flex flex-wrap gap-x-6 gap-y-3 pt-3">
                                    {way.metrics.map((metric) => (
                                        <div
                                            key={metric.label}
                                            className="flex flex-col gap-0.5"
                                        >
                                            <dt className="font-heading text-3xl text-theme-text-soft tabular-nums">
                                                {metric.value ?? (
                                                    <span
                                                        aria-hidden="true"
                                                        className="block h-8 w-14 animate-pulse rounded-md bg-theme-bg-subtle"
                                                    />
                                                )}
                                            </dt>
                                            <dd className="text-xs text-theme-text-muted">
                                                {metric.label}
                                            </dd>
                                        </div>
                                    ))}
                                </dl>
                                <div className="flex flex-wrap gap-2 pt-2">
                                    {way.links.map((link) => (
                                        <Button
                                            as="a"
                                            key={link.label}
                                            href={link.href}
                                            size="sm"
                                            appearance="raised"
                                            className="gap-2 whitespace-nowrap"
                                        >
                                            {link.label}
                                            <ArrowRightIcon className="size-3.5" />
                                        </Button>
                                    ))}
                                </div>
                            </Surface>
                        );
                    })}
                </div>

                <Surface
                    variant="card-themed"
                    className="flex flex-col gap-5 p-5 sm:p-6"
                >
                    <div className="flex flex-wrap items-start justify-between gap-4">
                        <div className="flex max-w-xl flex-col gap-2">
                            <Eyebrow>Have your say</Eyebrow>
                            <h3 className="font-subheading text-2xl leading-tight text-theme-text-strong sm:text-3xl">
                                Open votes
                            </h3>
                            <p className="text-sm leading-relaxed text-theme-text-base sm:text-base">
                                Community feedback shapes the roadmap. Add your
                                vote to the ideas you want the project to build
                                next.
                            </p>
                        </div>
                    </div>

                    {bare ? (
                        <FeedState
                            loading={loading}
                            failed={failed}
                            what="Open votes"
                        />
                    ) : (
                        <div className="grid grid-cols-1 gap-3 min-[700px]:grid-cols-3">
                            {issues.map((issue) => (
                                <Surface
                                    variant="card"
                                    key={issue.number}
                                    className="flex flex-col gap-5 rounded-2xl p-5"
                                >
                                    <span className="font-semibold leading-snug text-theme-text-strong">
                                        {issue.title}
                                    </span>
                                    <span className="mt-auto flex items-center justify-between gap-3">
                                        <Eyebrow
                                            size="chrome"
                                            className="tabular-nums"
                                        >
                                            {issue.votes} vote
                                            {issue.votes === 1 ? "" : "s"}
                                        </Eyebrow>
                                        <Button
                                            as="a"
                                            href={issue.url}
                                            size="sm"
                                            appearance="raised"
                                            className="gap-1.5"
                                        >
                                            Vote
                                            <ArrowRightIcon className="size-3.5" />
                                        </Button>
                                    </span>
                                </Surface>
                            ))}
                        </div>
                    )}
                </Surface>
            </div>
        </>
    );
}

type DiaryZoom = "year" | "month" | "day";
const DIARY_ZOOMS: DiaryZoom[] = ["year", "month", "day"];
const DIARY_ZOOM_LABELS: Record<DiaryZoom, string> = {
    year: "All time",
    month: "Year",
    day: "Month",
};

function BuildDiary() {
    const [zoom, setZoom] = useState<DiaryZoom>("year");
    const [visibleMonth, setVisibleMonth] = useState<string | null>(null);
    const [visibleYear, setVisibleYear] = useState<number | null>(null);
    const [selectedDate, setSelectedDate] = useState<string | null>(null);
    const {
        data: diary,
        loading,
        failed,
    } = useBuildDiary(visibleMonth ?? undefined);
    const { month, latestDay, days, hasEarlier, hasLater } = diary;
    const entries = days.filter((day) => day.title !== null);
    const representativeIndex = entries.length
        ? [...month].reduce((total, character) => {
              return total + character.charCodeAt(0);
          }, 0) % entries.length
        : -1;
    const fallbackSelected =
        zoom !== "day" && representativeIndex >= 0
            ? entries[representativeIndex]
            : entries[entries.length - 1];
    const anchorDate = selectedDate ?? fallbackSelected?.date ?? latestDay;
    const yearFromMonth = Number((month || anchorDate).slice(0, 4));
    const requestedYear = visibleYear ?? (yearFromMonth || undefined);
    const {
        data: yearDiary,
        loading: yearLoading,
        failed: yearFailed,
    } = useBuildDiaryYear(requestedYear, { enabled: zoom === "month" });
    const {
        data: allDiary,
        loading: allLoading,
        failed: allFailed,
    } = useBuildDiaryAll();
    const selected =
        days.find((day) => day.date === selectedDate) ??
        days.find((day) => day.date === anchorDate) ??
        fallbackSelected;
    const selectedIndex = selected
        ? entries.findIndex((day) => day.date === selected.date)
        : -1;
    const previous = selectedIndex > 0 ? entries[selectedIndex - 1] : null;
    const next =
        selectedIndex >= 0 && selectedIndex < entries.length - 1
            ? entries[selectedIndex + 1]
            : null;
    const formatDate = (date: string, full = false) =>
        new Date(`${date}T00:00:00Z`).toLocaleDateString("en-GB", {
            day: "numeric",
            month: "short",
            ...(full ? { year: "numeric" } : {}),
            timeZone: "UTC",
        });

    const formatMonth = (value: string) =>
        new Date(`${value}-01T00:00:00Z`).toLocaleDateString("en-GB", {
            month: "long",
            year: "numeric",
            timeZone: "UTC",
        });

    const chartItems =
        zoom === "year"
            ? allDiary.years.map((item) => ({
                  key: String(item.year),
                  value: item.prCount,
                  label: String(item.year),
                  available: item.prCount > 0,
                  active: item.year === (visibleYear ?? yearFromMonth),
                  ariaLabel: `${item.year}: ${item.prCount} pull request${item.prCount === 1 ? "" : "s"} merged`,
                  onSelect: () => {
                      setVisibleYear(item.year);
                      setVisibleMonth(item.representativeDate.slice(0, 7));
                      setSelectedDate(item.representativeDate);
                  },
              }))
            : zoom === "month"
              ? yearDiary.months.map((item) => ({
                    key: item.month,
                    value: item.prCount,
                    label: new Date(
                        `${item.month}-01T00:00:00Z`,
                    ).toLocaleDateString("en-GB", {
                        month: "short",
                        timeZone: "UTC",
                    }),
                    available: item.prCount > 0,
                    active: item.month === month,
                    ariaLabel: `${formatMonth(item.month)}: ${item.prCount} pull request${item.prCount === 1 ? "" : "s"} merged`,
                    onSelect: () => {
                        setVisibleMonth(item.month);
                        setSelectedDate(null);
                    },
                }))
              : days.map((day) => ({
                    key: day.date,
                    value: day.prCount,
                    label: formatDate(day.date),
                    available: day.title !== null,
                    active: day.date === selected?.date,
                    ariaLabel: `${formatDate(day.date, true)}: ${day.prCount} pull request${day.prCount === 1 ? "" : "s"} merged`,
                    onSelect: () => setSelectedDate(day.date),
                }));
    const periodPrs = chartItems.reduce((sum, item) => sum + item.value, 0);
    const maxPrs = Math.max(...chartItems.map((item) => item.value), 1);
    const points = chartItems.map((item, index) => ({
        item,
        x:
            chartItems.length === 1
                ? 50
                : 2 + (index / (chartItems.length - 1)) * 96,
        y: 92 - (item.value / maxPrs) * 84,
    }));
    const curve = points.reduce((path, point, index) => {
        if (index === 0) return `M ${point.x} ${point.y}`;
        const previousPoint = points[index - 1];
        const midpoint = (previousPoint.x + point.x) / 2;
        return `${path} C ${midpoint} ${previousPoint.y}, ${midpoint} ${point.y}, ${point.x} ${point.y}`;
    }, "");
    const area = points.length
        ? `${curve} L ${points[points.length - 1].x} 100 L ${points[0].x} 100 Z`
        : "";
    const zoomLoading =
        (zoom === "year" && allLoading) || (zoom === "month" && yearLoading);
    const zoomFailed =
        (zoom === "year" && allFailed) || (zoom === "month" && yearFailed);
    const bare = failed || entries.length === 0;
    const periodName =
        zoom === "year"
            ? "All time"
            : zoom === "month"
              ? String(yearDiary.year || requestedYear || "")
              : formatMonth(month);
    const chartTitle =
        zoom === "year"
            ? "Yearly merged PRs"
            : zoom === "month"
              ? "Monthly merged PRs"
              : "Daily merged PRs";
    const hasPreviousPeriod =
        zoom === "year"
            ? false
            : zoom === "month"
              ? yearDiary.hasEarlier
              : hasEarlier;
    const hasNextPeriod =
        zoom === "year"
            ? false
            : zoom === "month"
              ? yearDiary.hasLater
              : hasLater;
    const navigationUnit = zoom === "month" ? "year" : "month";

    const shiftPeriod = (amount: number) => {
        if (zoom === "year") {
            return;
        }
        if (zoom === "month") {
            const targetYear =
                (yearDiary.year || requestedYear || allDiary.latestYear) +
                amount;
            const representative = allDiary.years.find(
                (item) => item.year === targetYear,
            );
            setVisibleYear(targetYear);
            if (representative) {
                setVisibleMonth(representative.representativeDate.slice(0, 7));
                setSelectedDate(representative.representativeDate);
            }
            return;
        }
        if (!month) return;
        const [year, monthIndex] = month.split("-").map(Number);
        const date = new Date(Date.UTC(year, monthIndex - 1 + amount, 1));
        setVisibleMonth(date.toISOString().slice(0, 7));
        setSelectedDate(null);
    };

    const selectZoom = (nextZoom: DiaryZoom) => {
        if (nextZoom === "year") {
            setVisibleYear(allDiary.latestYear);
            setVisibleMonth(latestDay.slice(0, 7));
            setSelectedDate(null);
        } else if (nextZoom === "month") {
            setVisibleYear(allDiary.latestYear);
            setVisibleMonth(latestDay.slice(0, 7));
            setSelectedDate(null);
        } else {
            setVisibleMonth(latestDay.slice(0, 7));
            setSelectedDate(null);
        }
        setZoom(nextZoom);
    };

    return (
        <section className="flex flex-col gap-5">
            <ContentHeader
                eyebrow="Build diary"
                title="What we shipped in the community"
                subtitle="See the full history by year, the current year by month, or the current month day by day."
            />
            {bare ? (
                <FeedState
                    loading={loading}
                    failed={failed}
                    what="The build diary"
                    rows={2}
                />
            ) : (
                <>
                    <Surface
                        variant="card-themed"
                        className="flex flex-col gap-4 p-5 sm:p-6"
                    >
                        <div className="flex flex-wrap items-center justify-between gap-3">
                            <fieldset
                                aria-label="Build diary zoom"
                                className="m-0 flex flex-wrap gap-1.5 border-0 p-0"
                            >
                                {DIARY_ZOOMS.map((level) => (
                                    <TabButton
                                        key={level}
                                        active={zoom === level}
                                        size="sm"
                                        onClick={() => selectZoom(level)}
                                    >
                                        {DIARY_ZOOM_LABELS[level]}
                                    </TabButton>
                                ))}
                            </fieldset>
                            <div className="flex flex-wrap items-center gap-2">
                                {zoom !== "year" && (
                                    <Button
                                        size="sm"
                                        intent="neutral"
                                        disabled={!hasPreviousPeriod}
                                        onClick={() => shiftPeriod(-1)}
                                        aria-label={`Previous ${navigationUnit}`}
                                        className="h-8 w-8 p-0"
                                    >
                                        <ArrowRightIcon className="h-3.5 w-3.5 rotate-180" />
                                    </Button>
                                )}
                                <Chip
                                    size="lg"
                                    className="h-8 rounded-full !bg-transparent px-3 text-sm"
                                >
                                    {zoomLoading ? (
                                        "Loading…"
                                    ) : zoomFailed ? (
                                        "Unavailable"
                                    ) : (
                                        <>
                                            <span>{periodName}</span>
                                            <span aria-hidden="true">·</span>
                                            <GitPullRequestIcon className="h-3 w-3" />
                                            <span className="tabular-nums">
                                                {periodPrs.toLocaleString()}
                                            </span>
                                        </>
                                    )}
                                </Chip>
                                {zoom !== "year" && (
                                    <Button
                                        size="sm"
                                        intent="neutral"
                                        disabled={!hasNextPeriod}
                                        onClick={() => shiftPeriod(1)}
                                        aria-label={`Next ${navigationUnit}`}
                                        className="h-8 w-8 p-0"
                                    >
                                        <ArrowRightIcon className="h-3.5 w-3.5" />
                                    </Button>
                                )}
                            </div>
                        </div>
                        {zoomLoading || zoomFailed ? (
                            <FeedState
                                loading={zoomLoading}
                                failed={zoomFailed}
                                what={`${zoom[0].toUpperCase()}${zoom.slice(1)} view`}
                                rows={2}
                            />
                        ) : (
                            <div className="relative h-44 min-w-0 pl-9 sm:h-52">
                                <span className="sr-only">
                                    {chartTitle}: {periodName}. {periodPrs}{" "}
                                    merged pull request
                                    {periodPrs === 1 ? "" : "s"}.
                                </span>
                                <span className="absolute top-0 left-0 text-micro text-theme-text-muted tabular-nums">
                                    {maxPrs}
                                </span>
                                <span className="absolute top-1/2 left-0 -translate-y-1/2 text-micro text-theme-text-muted tabular-nums">
                                    {Math.ceil(maxPrs / 2)}
                                </span>
                                <span className="absolute bottom-7 left-0 text-micro text-theme-text-muted tabular-nums">
                                    0
                                </span>
                                <div className="absolute top-2 right-1 bottom-7 left-9">
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
                                    {points
                                        .filter(({ item }) => item.value > 0)
                                        .map(({ item, x, y }) => (
                                            <button
                                                key={item.key}
                                                type="button"
                                                disabled={!item.available}
                                                onClick={item.onSelect}
                                                aria-label={item.ariaLabel}
                                                aria-pressed={item.active}
                                                title={`${item.label} · ${item.value} PR${item.value === 1 ? "" : "s"}`}
                                                className={`absolute -translate-x-1/2 -translate-y-1/2 rounded-full border-2 transition-transform motion-reduce:transition-none ${
                                                    item.active
                                                        ? "size-5 border-theme-text-strong bg-theme-bg-active"
                                                        : "size-3 border-theme-text-soft bg-surface-opaque hover:scale-125"
                                                }`}
                                                style={{
                                                    left: `${x}%`,
                                                    top: `${y}%`,
                                                }}
                                            />
                                        ))}
                                </div>
                                <div className="absolute right-1 bottom-0 left-9 flex justify-between text-micro text-theme-text-muted">
                                    <span>{chartItems[0]?.label}</span>
                                    <span>
                                        {
                                            chartItems[chartItems.length - 1]
                                                ?.label
                                        }
                                    </span>
                                </div>
                            </div>
                        )}
                    </Surface>

                    {selected?.title && (
                        <Surface
                            variant="card"
                            className="grid overflow-hidden p-0 md:grid-cols-[minmax(260px,0.9fr)_minmax(0,1.1fr)]"
                        >
                            <img
                                key={selected.imageUrl}
                                src={selected.imageUrl ?? undefined}
                                alt=""
                                aria-hidden="true"
                                loading="lazy"
                                className="aspect-[4/3] h-full min-h-0 w-full bg-theme-bg-subtle object-cover md:aspect-auto md:min-h-72"
                            />
                            <div className="flex min-w-0 flex-col gap-4 p-5 sm:p-7">
                                <div className="flex flex-wrap items-center gap-2.5">
                                    <Eyebrow size="chrome">
                                        {formatDate(selected.date, true)}
                                    </Eyebrow>
                                    <Chip size="sm">
                                        {selected.prCount} PR
                                        {selected.prCount === 1 ? "" : "s"}
                                    </Chip>
                                </div>
                                <h3 className="font-subheading text-2xl leading-tight text-theme-text-strong sm:text-3xl">
                                    {selected.title}
                                </h3>
                                <p className="text-sm leading-relaxed text-theme-text-base sm:text-base">
                                    {selected.summary}
                                </p>
                                <div className="mt-auto flex flex-wrap items-center justify-between gap-4 pt-2">
                                    {selected.url && (
                                        <InlineLink href={selected.url}>
                                            {selected.url.includes(
                                                "/tree/news/",
                                            )
                                                ? "See the day’s PRs"
                                                : "Open the pull request"}
                                        </InlineLink>
                                    )}
                                    <div className="ml-auto flex items-center gap-2">
                                        <Button
                                            size="sm"
                                            intent="neutral"
                                            disabled={!previous}
                                            onClick={() =>
                                                previous &&
                                                setSelectedDate(previous.date)
                                            }
                                            aria-label="Previous diary entry"
                                            title="Previous day"
                                            className="h-9 w-9 p-0"
                                        >
                                            <ArrowRightIcon className="h-4 w-4 rotate-180" />
                                        </Button>
                                        <Button
                                            size="sm"
                                            intent="neutral"
                                            disabled={!next}
                                            onClick={() =>
                                                next &&
                                                setSelectedDate(next.date)
                                            }
                                            aria-label="Next diary entry"
                                            title="Next day"
                                            className="h-9 w-9 p-0"
                                        >
                                            <ArrowRightIcon className="h-4 w-4" />
                                        </Button>
                                    </div>
                                </div>
                            </div>
                        </Surface>
                    )}
                </>
            )}
        </section>
    );
}

function Contributors() {
    const { data: people, loading, failed } = useContributors();
    const bare = loading || people.length === 0;

    return (
        <section className="flex flex-col gap-5">
            <ContentHeader
                eyebrow="Contributors"
                title="Top contributors"
                subtitle="These contributors have helped build and improve the platform. Want to join them?"
                action={
                    <InlineLink href={REPO_URL}>Open the repository</InlineLink>
                }
            />
            {bare && (
                <FeedState
                    loading={loading}
                    failed={failed && people.length === 0}
                    what="Contributors"
                    rows={2}
                />
            )}
            <div className="grid grid-cols-[repeat(auto-fit,minmax(min(190px,100%),1fr))] gap-3.5">
                {people.map((person) => (
                    <LinkCard
                        key={person.login}
                        href={person.profileUrl}
                        showIcon={false}
                        surfaceClassName="flex-row items-center gap-3.5 rounded-2xl p-4"
                    >
                        <img
                            src={`${person.avatarUrl}&s=80`}
                            alt=""
                            aria-hidden="true"
                            loading="lazy"
                            width={40}
                            height={40}
                            className="size-10 shrink-0 rounded-[10px] bg-theme-bg-subtle"
                        />
                        <span className="flex min-w-0 flex-col">
                            <span className="truncate font-semibold text-sm text-theme-text-strong">
                                {person.login}
                            </span>
                            <span className="text-xs text-theme-text-muted tabular-nums">
                                {person.commits.toLocaleString()} commits
                            </span>
                        </span>
                    </LinkCard>
                ))}
            </div>
        </section>
    );
}

function CommunityPage() {
    return (
        <>
            <CommunityParticipation />

            <QuestLeaderboard />

            <BuildDiary />

            <Contributors />

            <section className="flex flex-col gap-5">
                <ContentHeader
                    eyebrow="Supporters"
                    title="Who keeps the GPUs warm"
                    subtitle="Their credits and infrastructure help people start building with free Pollen earned through Quests."
                />
                <div className="grid grid-cols-[repeat(auto-fit,minmax(min(240px,100%),1fr))] gap-3.5">
                    {SUPPORTERS.map((supporter) => (
                        <a
                            key={supporter.name}
                            href={supporter.url}
                            aria-label={supporter.name}
                            className="grid grid-cols-[2.5rem_minmax(0,1fr)] items-center gap-x-3 rounded-2xl border border-theme-border border-dashed px-5 py-4 transition-colors hover:border-theme-bg-active hover:bg-surface-opaque motion-reduce:transition-none"
                        >
                            <span
                                aria-hidden="true"
                                className="row-span-2 h-9 w-9 bg-theme-text-strong"
                                style={{
                                    maskImage: `url(${supporter.logo})`,
                                    WebkitMaskImage: `url(${supporter.logo})`,
                                    maskRepeat: "no-repeat",
                                    WebkitMaskRepeat: "no-repeat",
                                    maskPosition: "center",
                                    WebkitMaskPosition: "center",
                                    maskSize: "contain",
                                    WebkitMaskSize: "contain",
                                }}
                            />
                            <span className="font-body text-base font-semibold text-theme-text-strong">
                                {supporter.name}
                            </span>
                            <span className="text-sm leading-snug text-theme-text-muted">
                                {supporter.description}
                            </span>
                        </a>
                    ))}
                </div>
            </section>

            <Callout
                tone="dark"
                title="Join the conversation"
                body="Builders are in there swapping prompts, debugging each other's apps, and telling us what to build next."
            >
                <Button
                    as="a"
                    href={DISCORD_URL}
                    appearance="raised"
                    className="bg-brand-accent text-brand-dark"
                >
                    Join Discord
                </Button>
                <InlineLink href={REPO_URL} className="px-2 text-base">
                    Browse the repo
                </InlineLink>
            </Callout>
        </>
    );
}
