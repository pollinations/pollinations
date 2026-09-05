import {
    AppIcon,
    ArrowRightIcon,
    BeakerIcon,
    Button,
    Callout,
    CardIcon,
    CheckIcon,
    ChevronIcon,
    Chip,
    CodeIcon,
    ContentHeader,
    cn,
    Dropdown,
    DropdownItem,
    ExternalLinkButton,
    ExternalLinkIcon,
    Eyebrow,
    GitPullRequestIcon,
    InlineLink,
    LinkCard,
    LogInIcon,
    MegaphoneIcon,
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
    useContributors,
    useDiscordPresence,
    usePullRequestCount,
    useVotingIssues,
} from "../data/community";
import { compact, useAppShowcase, usePlatformStats } from "../data/publicStats";
import { routeHead } from "../routeMeta";
import { QuestLeaderboard } from "../ui/components/QuestLeaderboard";
import { BottomScene } from "../ui/site/BottomScene";
import { DiscordPresenceBadge } from "../ui/site/DiscordPresenceBadge";
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
        label: "Models & agents",
        icon: BeakerIcon,
        title: "Publish a model or agent",
        body: "Bring your own model or managed agent to the public catalog and make it available to builders.",
        links: [
            {
                label: "Publish a model or agent",
                href: "https://github.com/pollinations/pollinations/issues/new?template=community-model-allowlist.yml",
            },
        ],
    },
    {
        label: "Code",
        icon: CodeIcon,
        title: "Contribute code or improve the docs",
        body: "Fix a bug, propose a feature, improve an example, or open a pull request.",
        links: [
            {
                label: "Find a good first issue",
                href: `${REPO_URL}/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22`,
            },
        ],
    },
    {
        label: "Talk",
        icon: MegaphoneIcon,
        title: "Help in Discord",
        body: "Answer questions, share experiments, and tell the team what feels missing.",
        links: [{ label: "Join Discord", href: DISCORD_URL }],
    },
];

const FEED_SKELETON_KEYS = ["first", "second", "third", "fourth"];

function voteIconFor(title: string) {
    if (/login|account|auth/i.test(title)) return LogInIcon;
    if (/model/i.test(title)) return BeakerIcon;
    if (/payment|billing/i.test(title)) return CardIcon;
    return MegaphoneIcon;
}

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
    const {
        data: pullRequestCount,
        loading: pullRequestsLoading,
        failed: pullRequestsFailed,
    } = usePullRequestCount();
    const {
        data: platform,
        loading: platformLoading,
        failed: platformFailed,
    } = usePlatformStats();
    const {
        data: showcase,
        loading: appsLoading,
        failed: appsFailed,
    } = useAppShowcase();
    const appCount = showcase[0]?.total_apps;
    const bare = loading || failed || issues.length === 0;
    const ways = [
        {
            ...WAYS_IN[0],
            metrics:
                appsFailed || (!appsLoading && appCount === undefined)
                    ? []
                    : [
                          {
                              value: appsLoading ? null : String(appCount),
                              label: "published apps",
                          },
                      ],
        },
        {
            ...WAYS_IN[1],
            metrics: platformFailed
                ? []
                : [
                      {
                          value:
                              platformLoading || platform === null
                                  ? null
                                  : compact(platform.community),
                          label: "published models",
                      },
                  ],
        },
        {
            ...WAYS_IN[2],
            metrics: pullRequestsFailed
                ? []
                : [
                      {
                          value:
                              pullRequestsLoading || pullRequestCount === null
                                  ? null
                                  : compact(pullRequestCount),
                          label: "PRs merged",
                      },
                  ],
        },
        { ...WAYS_IN[3], metrics: [] },
    ];

    return (
        <>
            <HeroScene
                scene="/heroes/community.webp"
                nightScene="/heroes/community-top-night.webp"
            >
                <ContentHeader
                    eyebrow="Open source, open roadmap"
                    title="Community"
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
                <div className="grid grid-cols-1 gap-5 min-[900px]:grid-cols-2 xl:grid-cols-4">
                    {ways.map((way) => {
                        const WayIcon = way.icon;
                        const isTalk = way.label === "Talk";

                        return (
                            <Surface
                                variant="card"
                                key={way.label}
                                className="p-5 sm:p-6 xl:p-5"
                            >
                                <div className="grid h-full content-between gap-4 min-[540px]:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] min-[900px]:grid-cols-1">
                                    <div className="flex flex-col gap-2.5">
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
                                    </div>
                                    <div className="flex flex-col items-start justify-end gap-3 min-[900px]:flex-row min-[900px]:items-end min-[900px]:justify-between xl:flex-col xl:items-start">
                                        {way.metrics.length > 0 && (
                                            <dl className="flex flex-wrap gap-x-6 gap-y-3">
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
                                        )}
                                        <div className="flex flex-col items-start gap-2">
                                            {isTalk && (
                                                <DiscordPresenceBadge
                                                    online={online}
                                                    glow={false}
                                                />
                                            )}
                                            <div className="flex flex-wrap gap-2">
                                                {way.links.map((link) => (
                                                    <ExternalLinkButton
                                                        key={link.label}
                                                        href={link.href}
                                                        size="sm"
                                                        appearance="raised"
                                                        showIcon
                                                        className="whitespace-nowrap"
                                                    >
                                                        {link.label}
                                                    </ExternalLinkButton>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
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
                            {issues.map((issue) => {
                                const VoteIcon = voteIconFor(issue.title);

                                return (
                                    <LinkCard
                                        key={issue.number}
                                        href={issue.url}
                                        showIcon={false}
                                        aria-label={`Open “${issue.title}” and add your vote`}
                                        className="group gap-5 rounded-2xl bg-surface-opaque p-5 transition-[background-color,transform] hover:-translate-y-0.5"
                                    >
                                        <span className="flex items-start gap-3">
                                            <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-theme-bg-subtle text-theme-text-soft">
                                                <VoteIcon className="size-4" />
                                            </span>
                                            <span className="font-semibold leading-snug text-theme-text-strong">
                                                {issue.title}
                                            </span>
                                        </span>
                                        <div className="mt-auto flex items-end justify-between gap-3">
                                            <dl>
                                                <div className="flex flex-col gap-0.5">
                                                    <dt className="font-heading text-3xl text-theme-text-soft tabular-nums">
                                                        {issue.votes}
                                                    </dt>
                                                    <dd className="text-xs text-theme-text-muted">
                                                        vote
                                                        {issue.votes === 1
                                                            ? ""
                                                            : "s"}
                                                    </dd>
                                                </div>
                                            </dl>
                                            <ExternalLinkIcon
                                                aria-hidden="true"
                                                className="size-7 text-theme-text-soft transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
                                            />
                                        </div>
                                    </LinkCard>
                                );
                            })}
                        </div>
                    )}
                </Surface>
            </div>
        </>
    );
}

type DiaryZoom = "all" | "month";
const DIARY_ZOOMS: DiaryZoom[] = ["all", "month"];
const DIARY_ZOOM_LABELS: Record<DiaryZoom, string> = {
    all: "All time",
    month: "Month",
};

function BuildDiary() {
    const [zoom, setZoom] = useState<DiaryZoom>("all");
    const [visibleMonth, setVisibleMonth] = useState<string | null>(null);
    const [selectedDate, setSelectedDate] = useState<string | null>(null);
    const {
        data: diary,
        loading,
        failed,
    } = useBuildDiary(visibleMonth ?? undefined);
    const { month, latestDay, days } = diary;
    const entries = days.filter((day) => day.title !== null);
    const representativeIndex = entries.length
        ? [...month].reduce((total, character) => {
              return total + character.charCodeAt(0);
          }, 0) % entries.length
        : -1;
    const fallbackSelected =
        zoom === "all" && representativeIndex >= 0
            ? entries[representativeIndex]
            : entries[entries.length - 1];
    const anchorDate = selectedDate ?? fallbackSelected?.date ?? latestDay;
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
    const activeMonths = allDiary.months.filter((item) => item.prCount > 0);
    const selectedMonth = activeMonths.find((item) => item.month === month);
    const selectedMonthIndex = selectedMonth
        ? activeMonths.findIndex((item) => item.month === selectedMonth.month)
        : -1;
    const previousMonth =
        selectedMonthIndex > 0 ? activeMonths[selectedMonthIndex - 1] : null;
    const nextMonth =
        selectedMonthIndex >= 0 && selectedMonthIndex < activeMonths.length - 1
            ? activeMonths[selectedMonthIndex + 1]
            : null;
    const showingMonthlyStory = zoom === "all" && Boolean(selectedMonth?.title);
    const story = showingMonthlyStory ? selectedMonth : selected;
    const previousStory = zoom === "all" ? previousMonth : previous;
    const nextStory = zoom === "all" ? nextMonth : next;
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
        zoom === "all"
            ? allDiary.months.map((item) => ({
                  key: item.month,
                  value: item.prCount,
                  label: new Date(
                      `${item.month}-01T00:00:00Z`,
                  ).toLocaleDateString("en-GB", {
                      month: "short",
                      year: "2-digit",
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
    const zoomLoading = zoom === "all" ? allLoading : loading;
    const zoomFailed = zoom === "all" ? allFailed : failed;
    const bare = failed || entries.length === 0;
    const periodName = zoom === "all" ? "All time" : formatMonth(month);
    const chartTitle =
        zoom === "all" ? "Monthly merged PRs" : "Daily merged PRs";
    const diaryYears = [
        ...new Set(allDiary.months.map((item) => item.month.slice(0, 4))),
    ];

    const selectZoom = (nextZoom: DiaryZoom) => {
        if (!visibleMonth) {
            setVisibleMonth(latestDay.slice(0, 7));
        }
        setSelectedDate(null);
        setZoom(nextZoom);
    };

    const showAdjacentStory = (direction: "previous" | "next") => {
        if (zoom === "all") {
            const adjacent =
                direction === "previous" ? previousMonth : nextMonth;
            if (!adjacent) return;
            setVisibleMonth(adjacent.month);
            setSelectedDate(null);
            return;
        }
        const adjacent = direction === "previous" ? previous : next;
        if (adjacent) setSelectedDate(adjacent.date);
    };

    return (
        <section className="flex flex-col gap-5">
            <ContentHeader
                eyebrow="Build diary"
                title="What shipped, day by day"
                subtitle="Pollinations’ build history from 2025 onward, told through merged pull requests and daily summaries."
            />
            {bare ? (
                <FeedState
                    loading={loading}
                    failed={failed}
                    what="The build diary"
                    rows={2}
                />
            ) : (
                <Surface variant="card" className="overflow-hidden p-0">
                    <div className="flex flex-col gap-4 p-5 sm:p-6">
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
                                {zoom === "month" && !zoomLoading && (
                                    <Dropdown
                                        align="end"
                                        className="max-h-80 w-60 overflow-y-auto p-2"
                                        trigger={(open) => (
                                            <Button
                                                type="button"
                                                size="sm"
                                                intent="neutral"
                                                aria-label={`Choose month, currently ${formatMonth(month)}`}
                                                className="min-h-8 gap-2 whitespace-nowrap px-3 py-1.5 text-xs"
                                            >
                                                {formatMonth(month)}
                                                <ChevronIcon
                                                    expanded={open}
                                                    className="size-3"
                                                />
                                            </Button>
                                        )}
                                    >
                                        {(close) => (
                                            <div className="flex flex-col gap-3">
                                                {diaryYears.map((year) => (
                                                    <div
                                                        key={year}
                                                        className="flex flex-col gap-1"
                                                    >
                                                        <Eyebrow
                                                            size="chrome"
                                                            className="px-3 pt-1 text-theme-text-muted"
                                                        >
                                                            {year}
                                                        </Eyebrow>
                                                        {allDiary.months
                                                            .filter((item) =>
                                                                item.month.startsWith(
                                                                    year,
                                                                ),
                                                            )
                                                            .map((item) => (
                                                                <DropdownItem
                                                                    key={
                                                                        item.month
                                                                    }
                                                                    aria-current={
                                                                        item.month ===
                                                                        month
                                                                            ? "date"
                                                                            : undefined
                                                                    }
                                                                    onClick={() => {
                                                                        setVisibleMonth(
                                                                            item.month,
                                                                        );
                                                                        setSelectedDate(
                                                                            null,
                                                                        );
                                                                        close();
                                                                    }}
                                                                >
                                                                    <span className="min-w-0 flex-1">
                                                                        {new Date(
                                                                            `${item.month}-01T00:00:00Z`,
                                                                        ).toLocaleDateString(
                                                                            "en-GB",
                                                                            {
                                                                                month: "long",
                                                                                timeZone:
                                                                                    "UTC",
                                                                            },
                                                                        )}
                                                                    </span>
                                                                    <span className="text-theme-text-muted text-xs tabular-nums">
                                                                        {item.prCount.toLocaleString()}
                                                                    </span>
                                                                    <CheckIcon
                                                                        className={cn(
                                                                            "size-3.5",
                                                                            item.month ===
                                                                                month
                                                                                ? "opacity-100"
                                                                                : "opacity-0",
                                                                        )}
                                                                    />
                                                                </DropdownItem>
                                                            ))}
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </Dropdown>
                                )}
                                <Chip
                                    size="lg"
                                    className="h-8 rounded-full !bg-transparent px-2 text-theme-text-muted text-xs"
                                >
                                    {zoomLoading ? (
                                        "Loading…"
                                    ) : zoomFailed ? (
                                        "Unavailable"
                                    ) : (
                                        <>
                                            <GitPullRequestIcon className="h-3 w-3" />
                                            <span className="tabular-nums">
                                                {periodPrs.toLocaleString()} PR
                                                {periodPrs === 1 ? "" : "s"}
                                            </span>
                                        </>
                                    )}
                                </Chip>
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
                                                className="group absolute flex size-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full disabled:cursor-default"
                                                style={{
                                                    left: `${x}%`,
                                                    top: `${y}%`,
                                                }}
                                            >
                                                <span
                                                    aria-hidden="true"
                                                    className={`block rounded-full border-2 transition-transform motion-reduce:transition-none ${
                                                        item.active
                                                            ? "size-5 border-theme-text-strong bg-theme-bg-active"
                                                            : "size-3 border-theme-text-soft bg-surface-opaque group-hover:scale-125"
                                                    }`}
                                                />
                                            </button>
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
                    </div>

                    {story?.title && (
                        <div className="grid overflow-hidden min-[540px]:h-80 min-[540px]:grid-cols-[minmax(260px,0.9fr)_minmax(0,1.1fr)]">
                            <div className="relative min-h-0 overflow-hidden">
                                <img
                                    key={story.imageUrl}
                                    src={story.imageUrl ?? undefined}
                                    alt=""
                                    aria-hidden="true"
                                    loading="lazy"
                                    className="aspect-[4/3] h-full min-h-0 w-full bg-theme-bg-subtle object-cover min-[540px]:aspect-auto"
                                />
                                <div className="absolute right-0 bottom-3 left-0 flex items-center justify-center gap-2">
                                    <Button
                                        size="sm"
                                        intent="neutral"
                                        disabled={!previousStory}
                                        onClick={() =>
                                            showAdjacentStory("previous")
                                        }
                                        aria-label={`Previous ${zoom === "all" ? "month" : "diary entry"}`}
                                        title={`Previous ${zoom === "all" ? "month" : "day"}`}
                                        className="h-9 w-9 p-0 shadow-well"
                                    >
                                        <ArrowRightIcon className="h-4 w-4 rotate-180" />
                                    </Button>
                                    <Button
                                        size="sm"
                                        intent="neutral"
                                        disabled={!nextStory}
                                        onClick={() =>
                                            showAdjacentStory("next")
                                        }
                                        aria-label={`Next ${zoom === "all" ? "month" : "diary entry"}`}
                                        title={`Next ${zoom === "all" ? "month" : "day"}`}
                                        className="h-9 w-9 p-0 shadow-well"
                                    >
                                        <ArrowRightIcon className="h-4 w-4" />
                                    </Button>
                                </div>
                            </div>
                            <div className="flex h-80 min-w-0 flex-col gap-4 p-5 sm:p-7">
                                <div className="flex flex-wrap items-center gap-2.5">
                                    <Eyebrow size="chrome">
                                        {showingMonthlyStory
                                            ? formatMonth(month)
                                            : formatDate(
                                                  selected?.date ?? latestDay,
                                                  true,
                                              )}
                                    </Eyebrow>
                                    <Chip size="sm">
                                        <GitPullRequestIcon className="h-3 w-3" />
                                        {story.prCount} PR
                                        {story.prCount === 1 ? "" : "s"}
                                    </Chip>
                                </div>
                                <h3 className="line-clamp-2 font-subheading text-2xl leading-tight text-theme-text-strong sm:text-3xl">
                                    {story.title}
                                </h3>
                                <p className="line-clamp-4 text-sm leading-relaxed text-theme-text-base min-[540px]:line-clamp-3 sm:text-base">
                                    {story.summary}
                                </p>
                            </div>
                        </div>
                    )}
                </Surface>
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
                        <Surface
                            as="a"
                            variant="card"
                            key={supporter.name}
                            href={supporter.url}
                            aria-label={supporter.name}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="grid grid-cols-[2.5rem_minmax(0,1fr)] items-center gap-x-3 rounded-2xl px-5 py-4 transition-colors hover:bg-theme-bg-subtle motion-reduce:transition-none"
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
                        </Surface>
                    ))}
                </div>
            </section>

            <Callout
                tone="dark"
                title="Join the conversation"
                body="Builders are in there swapping prompts, debugging each other's apps, and telling us what to build next."
            >
                <ExternalLinkButton
                    href={DISCORD_URL}
                    appearance="raised"
                    className="bg-brand-accent text-brand-dark"
                >
                    Join Discord
                </ExternalLinkButton>
                <InlineLink href={REPO_URL} className="px-2 text-base">
                    Browse the repo
                </InlineLink>
            </Callout>
            <BottomScene
                dayScene="/heroes/community-bottom-day.webp"
                nightScene="/heroes/community-bottom-night.webp"
            />
        </>
    );
}
