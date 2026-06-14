import {
    ExternalLinkButton,
    InlineLink,
    LinkCard,
    Section,
    Surface,
} from "@pollinations/ui";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Contributors } from "../components/community/Contributors.tsx";
import {
    COMMUNITY_META,
    CONTRIBUTE,
    CONTRIBUTE_CARDS,
    HERO,
    HERO_STATS,
    type HeroStatLiveKey,
    START,
    START_CARDS,
    START_DISCORD,
    type StartCardData,
    SUPPORTERS,
    SUPPORTERS_LIST,
    VOTING,
    VOTING_ISSUES,
} from "../components/community/copy.ts";
import { loadApps } from "../lib/apps.ts";

const GITHUB_REPO_API =
    "https://api.github.com/repos/pollinations/pollinations";
const DISCORD_INVITE_API =
    "https://discord.com/api/v10/invites/pollinations-ai-885844321461485618?with_counts=true";

export const Route = createFileRoute("/community")({
    head: () => ({
        meta: [
            { title: COMMUNITY_META.title },
            { name: "description", content: COMMUNITY_META.description },
        ],
    }),
    component: CommunityPage,
});

type LiveStatValues = Partial<Record<HeroStatLiveKey, string>>;

function formatStatCount(count: number): string {
    return new Intl.NumberFormat("en", {
        maximumFractionDigits: 1,
        notation: "compact",
    }).format(count);
}

async function fetchGitHubStars(signal: AbortSignal): Promise<number> {
    const res = await fetch(GITHUB_REPO_API, {
        headers: { Accept: "application/vnd.github+json" },
        signal,
    });
    if (!res.ok) throw new Error("GitHub stars unavailable");

    const data = (await res.json()) as { stargazers_count?: unknown };
    if (typeof data.stargazers_count !== "number") {
        throw new Error("GitHub stars missing");
    }
    return data.stargazers_count;
}

async function fetchDiscordMembers(signal: AbortSignal): Promise<number> {
    const res = await fetch(DISCORD_INVITE_API, { signal });
    if (!res.ok) throw new Error("Discord members unavailable");

    const data = (await res.json()) as { approximate_member_count?: unknown };
    if (typeof data.approximate_member_count !== "number") {
        throw new Error("Discord members missing");
    }
    return data.approximate_member_count;
}

function useLiveHeroStats(): LiveStatValues {
    const [liveStats, setLiveStats] = useState<LiveStatValues>({});

    useEffect(() => {
        const controller = new AbortController();

        async function loadStats() {
            const [discordMembers, githubStars, liveApps] =
                await Promise.allSettled([
                    fetchDiscordMembers(controller.signal),
                    fetchGitHubStars(controller.signal),
                    loadApps(),
                ]);

            if (controller.signal.aborted) return;

            const nextStats: LiveStatValues = {};
            if (discordMembers.status === "fulfilled") {
                nextStats.discordMembers = formatStatCount(
                    discordMembers.value,
                );
            }
            if (githubStars.status === "fulfilled") {
                nextStats.githubStars = formatStatCount(githubStars.value);
            }
            if (liveApps.status === "fulfilled") {
                nextStats.liveApps = formatStatCount(liveApps.value.length);
            }
            setLiveStats(nextStats);
        }

        void loadStats();

        return () => controller.abort();
    }, []);

    return liveStats;
}

function CommunityPage() {
    const liveHeroStats = useLiveHeroStats();

    return (
        <div className="mx-auto flex max-w-5xl flex-col gap-12 px-4 py-10 sm:px-6">
            {/* Hero */}
            <section className="flex flex-col gap-5">
                <h1 className="font-heading text-4xl leading-none text-theme-text-strong sm:text-5xl">
                    {HERO.title}
                </h1>
                <p className="flex flex-col font-body text-lg text-theme-text-base">
                    <span>
                        {HERO.subtitlePrefix}
                        <strong className="font-semibold text-theme-text-strong">
                            {HERO.subtitleBold}
                        </strong>
                    </span>
                    <span>{HERO.subtitleSuffix.trim()}</span>
                </p>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-theme-text-soft">
                    {HERO_STATS.map((stat, i) => {
                        const value = stat.liveKey
                            ? (liveHeroStats[stat.liveKey] ?? stat.value)
                            : stat.value;
                        const inner = (
                            <>
                                <strong className="font-subheading text-base text-theme-text-strong">
                                    {value}
                                </strong>
                                {stat.label}
                            </>
                        );
                        return (
                            <span
                                key={stat.label}
                                className="flex items-center gap-2"
                            >
                                {i > 0 && (
                                    <span className="text-theme-text-muted">
                                        ·
                                    </span>
                                )}
                                {stat.href ? (
                                    <InlineLink
                                        href={stat.href}
                                        className="gap-2 text-sm"
                                    >
                                        {inner}
                                    </InlineLink>
                                ) : (
                                    <span className="flex items-center gap-2">
                                        {inner}
                                    </span>
                                )}
                            </span>
                        );
                    })}
                </div>
            </section>

            {/* Build with the community */}
            <Section
                title={CONTRIBUTE.title}
                framed
                intro={<p>{CONTRIBUTE.body}</p>}
            >
                <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                    {CONTRIBUTE_CARDS.map((card) => {
                        const Icon = card.icon;

                        return (
                            <LinkCard key={card.title} href={card.href}>
                                <div className="flex items-center gap-2">
                                    <span
                                        aria-hidden="true"
                                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-theme-bg-active text-theme-text-strong"
                                    >
                                        <Icon className="h-5 w-5" />
                                    </span>
                                    <h3 className="font-subheading text-base text-theme-text-strong">
                                        {card.title}
                                    </h3>
                                </div>
                                <p className="text-sm text-theme-text-base">
                                    {card.body}
                                </p>
                            </LinkCard>
                        );
                    })}
                </div>

                <p className="max-w-2xl text-sm text-theme-text-soft">
                    {CONTRIBUTE.notePre}
                    <InlineLink href={CONTRIBUTE.noteHref} className="text-sm">
                        {CONTRIBUTE.noteLink}
                    </InlineLink>
                    {CONTRIBUTE.notePost}
                </p>

                <ExternalLinkButton
                    href={CONTRIBUTE.ctaHref}
                    size="md"
                    className="self-start"
                >
                    {CONTRIBUTE.ctaLabel}
                </ExternalLinkButton>
            </Section>

            {/* Where to start */}
            <Section title={START.title} framed>
                <div className="flex flex-col gap-4">
                    <StartCard card={START_DISCORD} />
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                        {START_CARDS.map((card) => (
                            <StartCard key={card.title} card={card} />
                        ))}
                    </div>
                </div>
            </Section>

            {/* Have your say */}
            <Section title={VOTING.title} framed>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                    {VOTING_ISSUES.map((issue) => {
                        const Icon = issue.icon;

                        return (
                            <LinkCard key={issue.url} href={issue.url}>
                                <div className="flex items-center justify-between">
                                    <span
                                        aria-hidden="true"
                                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-theme-bg-active text-theme-text-strong"
                                    >
                                        <Icon className="h-5 w-5" />
                                    </span>
                                    <span className="font-mono text-xs text-theme-text-soft">
                                        {issue.votes} {VOTING.votesLabel}
                                    </span>
                                </div>
                                <p className="font-subheading text-sm text-theme-text-strong">
                                    {issue.title}
                                </p>
                            </LinkCard>
                        );
                    })}
                </div>
            </Section>

            {/* Top contributors (live) */}
            <Contributors />

            {/* Supporters */}
            <Section
                title={SUPPORTERS.title}
                framed
                intro={<p>{SUPPORTERS.subtitle}</p>}
            >
                <div
                    data-theme="accent"
                    className="grid grid-cols-2 gap-x-6 gap-y-8 sm:grid-cols-3 lg:grid-cols-4"
                >
                    {SUPPORTERS_LIST.map((supporter) => (
                        <a
                            key={supporter.name}
                            href={supporter.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="group flex min-h-28 flex-col items-center justify-center gap-3 rounded-xl bg-surface-opaque/80 p-4 text-center shadow-well outline-none transition hover:-translate-y-0.5 hover:bg-surface-opaque/95 focus-visible:ring-2 focus-visible:ring-theme-border"
                        >
                            <span className="flex h-16 w-full items-center justify-center text-ink-900">
                                <span
                                    aria-hidden="true"
                                    className="block h-12 w-12 bg-current transition group-hover:scale-105"
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
                            </span>
                            <span className="text-[10px] font-medium leading-tight text-theme-text-soft">
                                {supporter.name}
                            </span>
                        </a>
                    ))}
                </div>
            </Section>
        </div>
    );
}

function StartCard({ card }: { card: StartCardData }) {
    const Icon = card.icon;

    return (
        <Surface
            variant="card"
            className="flex h-full flex-col gap-3 bg-surface-white p-5"
        >
            <div className="flex items-center gap-2">
                <span
                    aria-hidden="true"
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-theme-bg-active text-theme-text-strong"
                >
                    <Icon className="h-5 w-5" />
                </span>
                <h3 className="font-subheading text-lg text-theme-text-strong">
                    {card.title}
                </h3>
            </div>
            <p className="text-sm text-theme-text-base">{card.body}</p>
            <ExternalLinkButton
                href={card.href}
                size="md"
                className="mt-auto self-start"
            >
                {card.buttonLabel}
            </ExternalLinkButton>
        </Surface>
    );
}
