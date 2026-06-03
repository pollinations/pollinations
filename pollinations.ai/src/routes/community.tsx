import { ExternalLinkButton, Surface, type ThemeName } from "@pollinations/ui";
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
        <div
            data-theme="pink"
            className="mx-auto flex max-w-5xl flex-col gap-12 px-4 py-10 sm:px-6"
        >
            {/* Hero */}
            <section className="flex flex-col gap-5">
                <h1 className="font-heading text-4xl text-theme-text-strong sm:text-5xl">
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
                                <strong className="font-heading text-base text-theme-text-strong">
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
                                    <a
                                        href={stat.href}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="flex items-center gap-2 hover:underline"
                                    >
                                        {inner}
                                    </a>
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
                theme="blue"
                intro={CONTRIBUTE.body}
            >
                <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                    {CONTRIBUTE_CARDS.map((card) => (
                        <CardLink key={card.title} href={card.href}>
                            <h3 className="font-subheading text-base text-theme-text-strong">
                                {card.title}
                            </h3>
                            <p className="text-sm text-theme-text-base">
                                {card.body}
                            </p>
                        </CardLink>
                    ))}
                </div>

                <p className="max-w-2xl text-sm text-theme-text-soft">
                    {CONTRIBUTE.notePre}
                    <a
                        href={CONTRIBUTE.noteHref}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-semibold text-theme-text-strong hover:underline"
                    >
                        {CONTRIBUTE.noteLink}
                    </a>
                    {CONTRIBUTE.notePost}
                </p>

                <ExternalLinkButton
                    href={CONTRIBUTE.ctaHref}
                    theme="blue"
                    size="medium"
                    className="self-start"
                >
                    {CONTRIBUTE.ctaLabel}
                </ExternalLinkButton>
            </Section>

            {/* Where to start */}
            <Section title={START.title} theme="violet">
                <div className="flex flex-col gap-4">
                    <StartCard card={START_DISCORD} theme="violet" />
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                        {START_CARDS.map((card) => (
                            <StartCard
                                key={card.title}
                                card={card}
                                theme="violet"
                            />
                        ))}
                    </div>
                </div>
            </Section>

            {/* Have your say */}
            <Section title={VOTING.title} theme="pink">
                <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                    {VOTING_ISSUES.map((issue) => (
                        <CardLink key={issue.url} href={issue.url}>
                            <div className="flex items-center justify-between">
                                <span aria-hidden className="text-2xl">
                                    {issue.emoji}
                                </span>
                                <span className="font-mono text-xs text-theme-text-soft">
                                    {issue.votes} {VOTING.votesLabel}
                                </span>
                            </div>
                            <p className="font-subheading text-sm text-theme-text-strong">
                                {issue.title}
                            </p>
                        </CardLink>
                    ))}
                </div>
            </Section>

            {/* Top contributors (live) */}
            <Contributors />

            {/* Supporters */}
            <Section
                title={SUPPORTERS.title}
                theme="violet"
                intro={SUPPORTERS.subtitle}
            >
                <div className="grid grid-cols-3 gap-x-6 gap-y-8 sm:grid-cols-4 md:grid-cols-6">
                    {SUPPORTERS_LIST.map((supporter) => (
                        <a
                            key={supporter.name}
                            href={supporter.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="group flex flex-col items-center gap-2 text-center"
                        >
                            <Surface
                                variant="card"
                                className="flex h-16 w-16 items-center justify-center bg-white/80 p-0 font-heading text-lg text-theme-text-strong transition group-hover:-translate-y-0.5 group-hover:bg-white/90"
                            >
                                {initials(supporter.name)}
                            </Surface>
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

/** A section: heading (+ optional intro) above a themed panel that frames its content. */
function Section({
    title,
    theme,
    intro,
    children,
}: {
    title: string;
    theme: ThemeName;
    intro?: string;
    children: React.ReactNode;
}) {
    return (
        <section className="flex flex-col gap-4">
            <h2 className="font-subheading text-2xl text-theme-text-strong">
                {title}
            </h2>
            <Surface
                theme={theme}
                variant="panel"
                className="flex flex-col gap-5"
            >
                {intro && (
                    <p className="max-w-2xl text-theme-text-base">{intro}</p>
                )}
                {children}
            </Surface>
        </section>
    );
}

/** A whole-card link rendered as a white inner card on the section panel. */
function CardLink({
    href,
    children,
}: {
    href: string;
    children: React.ReactNode;
}) {
    return (
        <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="group block"
        >
            <Surface
                variant="card"
                className="flex h-full flex-col gap-1 bg-white/80 p-5 transition group-hover:-translate-y-0.5 group-hover:bg-white/90"
            >
                {children}
            </Surface>
        </a>
    );
}

function StartCard({ card, theme }: { card: StartCardData; theme: ThemeName }) {
    return (
        <Surface
            variant="card"
            className="flex h-full flex-col gap-3 bg-white/80 p-5"
        >
            <div className="flex items-center gap-2">
                <span aria-hidden className="text-xl">
                    {card.emoji}
                </span>
                <h3 className="font-subheading text-lg text-theme-text-strong">
                    {card.title}
                </h3>
            </div>
            <p className="text-sm text-theme-text-base">{card.body}</p>
            <ExternalLinkButton
                href={card.href}
                theme={theme}
                size="medium"
                className="mt-auto self-start"
            >
                {card.buttonLabel}
            </ExternalLinkButton>
        </Surface>
    );
}
