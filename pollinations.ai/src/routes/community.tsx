import {
    ExternalLinkButton,
    InlineLink,
    LinkCard,
    Section,
    Surface,
} from "@pollinations/ui";
import { createFileRoute } from "@tanstack/react-router";
import { Contributors } from "../components/community/Contributors.tsx";
import {
    COMMUNITY_META,
    CONTRIBUTE,
    CONTRIBUTE_CARDS,
    HERO,
    HERO_STATS,
    START,
    START_CARDS,
    START_DISCORD,
    type StartCardData,
    SUPPORTERS,
    SUPPORTERS_LIST,
    VOTING,
    VOTING_ISSUES,
} from "../components/community/copy.ts";

export const Route = createFileRoute("/community")({
    head: () => ({
        meta: [
            { title: COMMUNITY_META.title },
            { name: "description", content: COMMUNITY_META.description },
        ],
    }),
    component: CommunityPage,
});

function initials(name: string): string {
    const words = name
        .replace(/[^a-zA-Z0-9 ]/g, " ")
        .trim()
        .split(/\s+/);
    if (words.length >= 2) {
        return (words[0][0] + words[1][0]).toUpperCase();
    }
    return (words[0] ?? name).slice(0, 2).toUpperCase();
}

function CommunityPage() {
    return (
        <div className="mx-auto flex max-w-5xl flex-col gap-12 px-4 py-10 sm:px-6">
            {/* Hero */}
            <section className="flex flex-col gap-5">
                <h1 className="font-heading text-4xl leading-none text-theme-text-strong sm:text-5xl">
                    {HERO.title}
                </h1>
                <p className="max-w-2xl font-body text-lg text-theme-text-base">
                    {HERO.subtitlePrefix}
                    <strong className="font-semibold text-theme-text-strong">
                        {HERO.subtitleBold}
                    </strong>
                    {HERO.subtitleSuffix}
                </p>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-theme-text-soft">
                    {HERO_STATS.map((stat, i) => {
                        const inner = (
                            <>
                                <strong className="font-subheading text-base text-theme-text-strong">
                                    {stat.value}
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
                    {CONTRIBUTE_CARDS.map((card) => (
                        <LinkCard key={card.title} href={card.href}>
                            <h3 className="font-subheading text-base text-theme-text-strong">
                                {card.title}
                            </h3>
                            <p className="text-sm text-theme-text-base">
                                {card.body}
                            </p>
                        </LinkCard>
                    ))}
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
                <div className="grid grid-cols-3 gap-x-6 gap-y-8 sm:grid-cols-4 md:grid-cols-6">
                    {SUPPORTERS_LIST.map((supporter) => (
                        <LinkCard
                            key={supporter.name}
                            href={supporter.url}
                            surfaceClassName="items-center gap-2 p-3 pr-8 text-center"
                        >
                            <span className="flex h-14 w-14 items-center justify-center rounded-lg bg-theme-bg-active font-heading text-lg text-theme-text-strong">
                                {initials(supporter.name)}
                            </span>
                            <span className="text-[10px] font-medium leading-tight text-theme-text-soft">
                                {supporter.name}
                            </span>
                        </LinkCard>
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
