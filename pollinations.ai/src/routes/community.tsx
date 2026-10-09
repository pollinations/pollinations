import {
    AppIcon,
    BeakerIcon,
    Callout,
    CodeIcon,
    ContentHeader,
    cn,
    ExternalLinkButton,
    Eyebrow,
    Heading,
    InlineLink,
    LinkCard,
    LiveDot,
    MegaphoneIcon,
    StatCard,
    Surface,
    Text,
} from "@pollinations/ui";
import { createFileRoute } from "@tanstack/react-router";
import { useArt } from "../art";
import { LINKS, SOCIAL_LINKS } from "../copy/content/socialLinks";
import {
    SUPPORTERS,
    useContributors,
    useDiscordPresence,
    usePullRequestCount,
    useVotingIssues,
} from "../data/community";
import {
    compact,
    useAppDirectory,
    usePlatformStats,
} from "../data/publicStats";
import { routeHead } from "../routeMeta";
import { QuestLeaderboard } from "../ui/components/QuestLeaderboard";
import { BottomScene } from "../ui/site/BottomScene";
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
        title: "List your app",
        body: "Share what you built, get feedback, and help users discover it.",
        cta: {
            label: "List your app",
            href: LINKS.githubSubmitApp,
        },
    },
    {
        label: "Models & agents",
        icon: BeakerIcon,
        title: "Publish a model or agent",
        body: "Bring your own model or managed agent to the public catalog and make it available to builders.",
        cta: {
            label: "Request access",
            href: "https://github.com/pollinations/pollinations/issues/new?template=community-model-allowlist.yml",
        },
    },
    {
        label: "Code",
        icon: CodeIcon,
        title: "Improve code and docs",
        body: "Fix a bug, propose a feature, improve an example, or open a pull request.",
        cta: {
            label: "Find a GitHub Quest",
            href: `${SOCIAL_LINKS.github.url}/issues?q=is%3Aissue+is%3Aopen+label%3APOLLEN-QUEST`,
        },
    },
    {
        label: "Talk",
        icon: MegaphoneIcon,
        title: "Help in Discord",
        body: "Answer questions, share experiments, and tell the team what feels missing.",
        cta: { label: "Join the Discord", href: SOCIAL_LINKS.discord.url },
    },
];

/** Loading skeleton, or a note saying which feed failed or is empty. */
function FeedState({
    loading,
    failed,
    what,
}: {
    loading: boolean;
    failed: boolean;
    what: string;
}) {
    if (loading) {
        return (
            <div
                aria-busy="true"
                className="h-14 animate-pulse rounded-2xl bg-theme-bg-subtle"
            />
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

/** A live count hides when its feed fails and shows a skeleton while loading. */
// Only the Discord count is "right now"; the other metrics are totals.
const LIVE_METRIC = "online in Discord";

function liveMetric<T>(
    label: string,
    {
        data,
        loading,
        failed,
    }: { data: T | null; loading: boolean; failed: boolean },
    format: (value: T) => string,
) {
    if (failed || (!loading && data === null)) return null;
    return { label, value: loading || data === null ? null : format(data) };
}

function CommunityParticipation() {
    const votesScene = useArt("community", "votes");
    const { data: issues, loading, failed } = useVotingIssues();
    const online = useDiscordPresence();
    const pullRequests = usePullRequestCount();
    const platform = usePlatformStats();
    const apps = useAppDirectory();
    const ways = [
        liveMetric("listed apps", { ...apps, data: apps.data.length }, String),
        liveMetric("community models and agents", platform, (stats) =>
            compact(stats.community),
        ),
        liveMetric("PRs merged", pullRequests, compact),
        // The widget only exposes who is online now; a member total needs
        // a bot token, so this is the one live number the card can show.
        liveMetric(LIVE_METRIC, online, compact),
    ].map((metric, index) => ({ ...WAYS_IN[index], metric }));

    return (
        <>
            <HeroScene page="community">
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

            {/* No panel here: the sheet is already the block, so a panel only
                cut a seam through the hero art and indented the headings. */}
            <section
                className={cn(
                    postHeroSpacingClassName,
                    "flex flex-col gap-6 pt-5 sm:pt-6",
                )}
            >
                <ContentHeader
                    eyebrow="Get involved"
                    title="Help shape Pollinations"
                    subtitle="Share your work, contribute, or help decide what we build next."
                />
                <div className="grid grid-cols-1 gap-5 min-[900px]:grid-cols-2 xl:grid-cols-4">
                    {ways.map((way) => {
                        const WayIcon = way.icon;

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
                                        <Heading as="h3" size="card">
                                            {way.title}
                                        </Heading>
                                        <Text size="sm">{way.body}</Text>
                                    </div>
                                    <div className="flex flex-col items-start justify-end gap-3 min-[900px]:flex-row min-[900px]:items-end min-[900px]:justify-between xl:flex-col xl:items-start">
                                        {way.metric && (
                                            <StatCard
                                                variant="display"
                                                value={
                                                    way.metric.value ?? (
                                                        <span
                                                            aria-hidden="true"
                                                            className="block h-9 w-16 animate-pulse rounded-md bg-theme-bg-subtle"
                                                        />
                                                    )
                                                }
                                                label={
                                                    <>
                                                        {way.metric.label}
                                                        {way.metric.label ===
                                                            LIVE_METRIC &&
                                                            way.metric
                                                                .value && (
                                                                <LiveDot />
                                                            )}
                                                    </>
                                                }
                                            />
                                        )}
                                        {/* self-auto: follow the column's
                                            left edge instead of Button's
                                            default centring. */}
                                        <ExternalLinkButton
                                            href={way.cta.href}
                                            size="md"
                                            intent="brand"
                                            showIcon
                                            className="self-auto whitespace-nowrap"
                                        >
                                            {way.cta.label}
                                        </ExternalLinkButton>
                                    </div>
                                </div>
                            </Surface>
                        );
                    })}
                </div>

                <div className="flex flex-wrap items-center gap-x-8 gap-y-4 pt-5">
                    <div className="min-w-0 flex-1 basis-80">
                        {issues.length === 0 ? (
                            <FeedState
                                loading={loading}
                                failed={failed}
                                what="Open votes"
                            />
                        ) : (
                            <div className="flex flex-col gap-4">
                                {issues.map((issue) => (
                                    <InlineLink
                                        key={issue.number}
                                        href={issue.url}
                                        aria-label={`Open “${issue.title}” and add your vote`}
                                        className="flex w-fit max-w-full items-center gap-2"
                                    >
                                        <MegaphoneIcon
                                            aria-hidden="true"
                                            className="size-4 shrink-0"
                                        />
                                        <span className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
                                            <span className="font-semibold leading-snug text-theme-text-strong">
                                                {issue.title}
                                            </span>
                                            <span className="whitespace-nowrap text-xs text-theme-text-muted tabular-nums">
                                                {issue.reactions} reaction
                                                {issue.reactions === 1
                                                    ? ""
                                                    : "s"}
                                            </span>
                                        </span>
                                    </InlineLink>
                                ))}
                            </div>
                        )}
                    </div>
                    <InlineLink
                        href={LINKS.githubNewIssue}
                        size="sm"
                        tone="quiet"
                    >
                        Suggest an idea
                    </InlineLink>
                </div>
                <img
                    src={votesScene.src}
                    srcSet={votesScene.srcSet}
                    sizes="(max-width: 1440px) 100vw, 1200px"
                    alt=""
                    aria-hidden="true"
                    width={2048}
                    height={854}
                    loading="lazy"
                    decoding="async"
                    fetchPriority="low"
                    className="bottom-scene pointer-events-none block h-[clamp(12rem,24vw,20rem)] w-full select-none rounded-3xl object-cover object-bottom sm:rounded-block"
                />
            </section>
        </>
    );
}

function Contributors() {
    const { data: people, loading, failed } = useContributors();

    return (
        <section className="flex flex-col gap-5">
            <ContentHeader
                eyebrow="Contributors"
                title="Top code contributors"
                subtitle="These contributors have helped build and improve the platform. Want to join them?"
                action={
                    <InlineLink href={SOCIAL_LINKS.github.url}>
                        Open the repository
                    </InlineLink>
                }
            />
            {people.length === 0 && (
                <FeedState
                    loading={loading}
                    failed={failed}
                    what="Contributors"
                />
            )}
            <div className="grid grid-cols-[repeat(auto-fit,minmax(min(190px,100%),1fr))] gap-3.5">
                {people.map((person) => (
                    <LinkCard
                        key={person.login}
                        href={person.html_url}
                        showIcon={false}
                        surfaceClassName="flex-row items-center gap-3.5 p-4"
                    >
                        <img
                            src={`${person.avatar_url}&s=80`}
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
                                {person.contributions.toLocaleString()} commits
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

            <Contributors />

            <section className="flex flex-col gap-5">
                <ContentHeader
                    eyebrow="Supporters"
                    title="Who keeps the GPUs warm"
                    subtitle="Their credits and infrastructure help keep Pollinations running."
                />
                <div className="grid grid-cols-[repeat(auto-fit,minmax(min(240px,100%),1fr))] gap-3.5">
                    {SUPPORTERS.map((supporter) => (
                        <LinkCard
                            key={supporter.name}
                            href={supporter.url}
                            aria-label={supporter.name}
                            showIcon={false}
                            surfaceClassName="grid grid-cols-[2.5rem_minmax(0,1fr)] items-center gap-x-3 gap-y-0 px-5 py-4"
                        >
                            <span
                                aria-hidden="true"
                                className="row-span-2 h-9 w-9 bg-theme-text-strong"
                                style={{
                                    WebkitMask: `url(${supporter.logo}) center / contain no-repeat`,
                                    mask: `url(${supporter.logo}) center / contain no-repeat`,
                                }}
                            />
                            <span className="font-body text-base font-semibold text-theme-text-strong">
                                {supporter.name}
                            </span>
                            <span className="text-sm leading-snug text-theme-text-muted">
                                {supporter.description}
                            </span>
                        </LinkCard>
                    ))}
                </div>
            </section>

            <Callout
                tone="dark"
                title="Join the conversation"
                body="Builders are in there swapping prompts, debugging each other's apps, and telling us what to build next."
            >
                <ExternalLinkButton
                    href={SOCIAL_LINKS.discord.url}
                    intent="brand"
                    size="lg"
                >
                    Join the Discord
                </ExternalLinkButton>
            </Callout>
            <BottomScene page="community" />
        </>
    );
}
