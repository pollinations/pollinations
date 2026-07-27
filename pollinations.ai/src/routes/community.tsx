import { createFileRoute } from "@tanstack/react-router";
import {
    DISCORD_URL,
    REPO_URL,
    SUPPORTERS,
    useBuildDiary,
    useContributors,
    useDiscordPresence,
    useRepoStars,
    useVotingIssues,
} from "../data/community";
import { compact, useAppDirectory } from "../data/publicStats";
import {
    ActionButton,
    ArrowLink,
    CalloutPanel,
    Card,
    CardGrid,
    Hero,
    PageHeader,
    PixelLabel,
    PixelRule,
    SectionHeader,
    StatRow,
} from "../ui/site/kit";

export const Route = createFileRoute("/community")({
    component: CommunityPage,
});

/** The three doors in, in the order they cost you effort. */
const WAYS_IN = [
    {
        label: "Ship",
        title: "Ship an app",
        body: "Share what you built, get feedback, and help users discover it.",
        linkLabel: "Submit your app",
        href: "https://github.com/pollinations/pollinations/issues/new?template=APP-SUBMISSION.yml",
    },
    {
        label: "Code",
        title: "Fix a bug or improve the docs",
        body: "Open a PR, close an issue, improve the examples, or make the docs clearer.",
        linkLabel: "Good first issues",
        href: `${REPO_URL}/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22`,
    },
    {
        label: "Talk",
        title: "Help in Discord",
        body: "Answer questions, share experiments, and tell the team what feels missing.",
        linkLabel: "Start in #pollen-beta",
        href: DISCORD_URL,
    },
];

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
                {Array.from({ length: rows }, (_, i) => (
                    <div
                        key={`row-${i}`}
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

function OpenVotes() {
    const { data: issues, loading, failed } = useVotingIssues();
    const bare = loading || failed || issues.length === 0;

    return (
        <div className="flex flex-col gap-4.5">
            <SectionHeader eyebrow="Have your say" title="Open votes" />
            <div className="flex flex-col gap-3">
                {bare ? (
                    <FeedState
                        loading={loading}
                        failed={failed}
                        what="Open votes"
                    />
                ) : (
                    issues.map((issue) => (
                        <Card
                            key={issue.number}
                            as="a"
                            href={issue.url}
                            className="flex-row items-center gap-4 rounded-2xl p-5"
                        >
                            <span className="flex-1 leading-snug text-theme-text-strong">
                                {issue.title}
                            </span>
                            <PixelLabel
                                variant="eyebrow"
                                className="shrink-0 tabular-nums"
                            >
                                {issue.votes} ▲
                            </PixelLabel>
                        </Card>
                    ))
                )}
            </div>
        </div>
    );
}

function BuildDiary() {
    const { data: entries, loading, failed } = useBuildDiary();
    const bare = loading || failed || entries.length === 0;

    return (
        <div className="flex flex-col gap-4.5">
            <SectionHeader
                eyebrow="Build diary"
                title="What we shipped"
                subtitle="A log of what lands, straight from the repo."
            />
            <div className="flex flex-col">
                {bare && (
                    <FeedState
                        loading={loading}
                        failed={failed}
                        what="The build diary"
                        rows={4}
                    />
                )}
                {entries.map((entry) => (
                    <a
                        key={entry.url}
                        href={entry.url}
                        className="flex items-start gap-4 border-theme-border border-b border-dashed py-3.5 hover:text-theme-text-strong"
                    >
                        <PixelLabel
                            variant="chrome"
                            className="w-16 shrink-0 pt-0.5 text-theme-text-soft"
                        >
                            {entry.date}
                        </PixelLabel>
                        <span className="flex-1 text-sm leading-relaxed text-theme-text-base">
                            {entry.summary}
                        </span>
                    </a>
                ))}
                <div className="pt-3.5">
                    <ArrowLink href={`${REPO_URL}/commits/main`}>
                        See every commit
                    </ArrowLink>
                </div>
            </div>
        </div>
    );
}

function Contributors() {
    const { data: people, loading, failed } = useContributors();
    const bare = loading || failed || people.length === 0;

    return (
        <section className="flex flex-col gap-5">
            <SectionHeader
                eyebrow="Contributors"
                title="Most active contributors"
                subtitle="These folks are actively building and improving the platform. Want to join them?"
                action={
                    <ArrowLink href={REPO_URL}>Open the repository</ArrowLink>
                }
            />
            {bare && (
                <FeedState
                    loading={loading}
                    failed={failed}
                    what="Contributors"
                    rows={2}
                />
            )}
            <div className="grid grid-cols-[repeat(auto-fit,minmax(min(190px,100%),1fr))] gap-3.5">
                {people.map((person) => (
                    <Card
                        key={person.login}
                        as="a"
                        href={person.profileUrl}
                        className="flex-row items-center gap-3.5 rounded-2xl p-4"
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
                    </Card>
                ))}
            </div>
        </section>
    );
}

function CommunityPage() {
    const { data: stars } = useRepoStars();
    const { data: online } = useDiscordPresence();
    const { data: apps } = useAppDirectory();

    /** Only what we can actually measure — a missing feed drops its stat. */
    const stats = [
        online !== null && {
            value: String(online),
            label: "online in Discord now",
        },
        stars !== null && { value: compact(stars), label: "GitHub stars" },
        apps.length > 0 && {
            value: String(apps.length),
            label: "live apps",
        },
    ].filter((stat): stat is { value: string; label: string } => Boolean(stat));

    return (
        <>
            {/* The whole cast, together — the page is about the three of us
                being more than one of us. */}
            <Hero scene="/heroes/community.webp">
                <PageHeader
                    eyebrow="Open source, open roadmap"
                    title="Contribute"
                    subtitle={
                        <>
                            <strong className="text-theme-text-strong">
                                Builders shape the platform directly.
                            </strong>{" "}
                            Share what you need, meet the people already using
                            it, and help decide what comes next.
                        </>
                    }
                />
                <StatRow stats={stats} />
                <div className="flex flex-wrap gap-3">
                    <ActionButton href={DISCORD_URL}>Join Discord</ActionButton>
                    <ActionButton href={REPO_URL} tone="plain">
                        Star &amp; contribute
                    </ActionButton>
                </div>
            </Hero>

            <PixelRule />

            <section className="flex flex-col gap-7">
                <SectionHeader
                    eyebrow="Ways in"
                    title="Build with the community"
                    subtitle="Meet other builders, talk with users, and work directly on the open source platform."
                />
                <CardGrid>
                    {WAYS_IN.map((way) => (
                        <Card key={way.label} className="gap-2.5 p-7">
                            <PixelLabel>{way.label}</PixelLabel>
                            <h3 className="font-subheading text-xl text-theme-text-strong">
                                {way.title}
                            </h3>
                            <p className="text-sm leading-relaxed text-theme-text-base">
                                {way.body}
                            </p>
                            <ArrowLink href={way.href} className="mt-auto pt-2">
                                {way.linkLabel}
                            </ArrowLink>
                        </Card>
                    ))}
                </CardGrid>
                <div className="flex flex-wrap items-center gap-3.5 rounded-2xl bg-theme-bg-subtle px-5 py-4">
                    <PixelLabel>Roadmap</PixelLabel>
                    <p className="flex-1 text-sm text-theme-text-base">
                        Community feedback shapes what gets built —{" "}
                        <strong className="text-theme-text-strong">
                            models, wallets, docs and developer tools
                        </strong>{" "}
                        all improve through what builders report and ship.
                    </p>
                </div>
            </section>

            <div className="grid grid-cols-[repeat(auto-fit,minmax(min(360px,100%),1fr))] items-start gap-8">
                <OpenVotes />
                <BuildDiary />
            </div>

            <Contributors />

            <section className="flex flex-col gap-5">
                <SectionHeader
                    eyebrow="Supporters"
                    title="Who keeps the GPUs warm"
                    subtitle="Credits and infrastructure from these folks are what let the free tier stay free."
                />
                <div className="grid grid-cols-[repeat(auto-fit,minmax(min(240px,100%),1fr))] gap-3.5">
                    {SUPPORTERS.map((supporter) => (
                        <a
                            key={supporter.name}
                            href={supporter.url}
                            className="flex flex-col gap-1.5 rounded-2xl border border-theme-border border-dashed px-5 py-4 transition-colors hover:border-theme-bg-active hover:bg-surface-opaque motion-reduce:transition-none"
                        >
                            <span className="font-subheading text-base text-theme-text-strong">
                                {supporter.name}
                            </span>
                            <span className="text-sm leading-snug text-theme-text-muted">
                                {supporter.description}
                            </span>
                        </a>
                    ))}
                </div>
            </section>

            <CalloutPanel
                tone="dark"
                title="Join the conversation"
                body="Builders are in there swapping prompts, debugging each other's apps, and telling us what to build next."
            >
                <ActionButton href={DISCORD_URL} tone="bright">
                    Join Discord
                </ActionButton>
                <ArrowLink href={REPO_URL} className="px-2 text-base">
                    Browse the repo
                </ArrowLink>
            </CalloutPanel>
        </>
    );
}
