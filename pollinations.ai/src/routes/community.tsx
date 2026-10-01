import {
    ContentHeader,
    cn,
    ExternalLinkButton,
    InlineLink,
    LinkCard,
    LoadingStatus,
    Surface,
} from "@pollinations/ui";
import { createFileRoute } from "@tanstack/react-router";
import { useArt } from "../art";
import { COMMUNITY_PAGE } from "../copy/content/community";
import { LINKS, SOCIAL_LINKS } from "../copy/content/socialLinks";
import { usePageCopy } from "../hooks/usePageCopy";
import { useTranslate } from "../hooks/useTranslate";
import { routeHead } from "../routeMeta";
import { BuildDiary } from "../ui/components/BuildDiary";
import { QuestLeaderboard } from "../ui/components/QuestLeaderboard";
import { TopContributors } from "../ui/components/TopContributors";
import { BottomScene } from "../ui/site/BottomScene";
import { HeroScene, postHeroSpacingClassName } from "../ui/site/HeroScene";

export const Route = createFileRoute("/community")({
    head: () => routeHead("/community"),
    component: CommunityPage,
});

interface VotingIssue {
    emoji: string;
    title: string;
    url: string;
    votes: number;
}

function CommunityPage() {
    const { copy: pageCopy, isTranslating } = usePageCopy(COMMUNITY_PAGE);
    const votesScene = useArt("community", "votes");

    const { translated: translatedVotingIssues } = useTranslate(
        COMMUNITY_PAGE.votingIssues as VotingIssue[],
        "title",
    );

    const contributeCards = [
        {
            href: LINKS.githubSubmitApp,
            title: pageCopy.contributeCard1Title,
            body: pageCopy.contributeCard1Body,
        },
        {
            href: LINKS.githubNewIssue,
            title: pageCopy.contributeCard2Title,
            body: pageCopy.contributeCard2Body,
        },
        {
            href: SOCIAL_LINKS.discord.url,
            title: pageCopy.contributeCard3Title,
            body: pageCopy.contributeCard3Body,
        },
    ];

    return (
        <>
            {/* Section 1 — Hero */}
            <HeroScene page="community">
                {isTranslating && <LoadingStatus>Translating</LoadingStatus>}
                <ContentHeader
                    eyebrow={null}
                    title={pageCopy.title}
                    subtitle={
                        <>
                            {pageCopy.subtitlePrefix}{" "}
                            <strong>{pageCopy.subtitleBold}</strong>
                            {pageCopy.subtitleSuffix}
                        </>
                    }
                    variant="page"
                />
                <p className="text-sm text-theme-text-muted">
                    <InlineLink
                        href={SOCIAL_LINKS.discord.url}
                        tone="quiet"
                        showIcon={false}
                    >
                        <span className="font-semibold text-theme-text-strong">
                            {pageCopy.heroStat1}
                        </span>{" "}
                        {pageCopy.heroStat1Label}
                    </InlineLink>
                    <span className="mx-2">·</span>
                    <InlineLink
                        href={SOCIAL_LINKS.github.url}
                        tone="quiet"
                        showIcon={false}
                    >
                        <span className="font-semibold text-theme-text-strong">
                            {pageCopy.heroStat2}
                        </span>{" "}
                        {pageCopy.heroStat2Label}
                    </InlineLink>
                    <span className="mx-2">·</span>
                    <span className="font-semibold text-theme-text-strong">
                        {pageCopy.heroStat3}
                    </span>{" "}
                    {pageCopy.heroStat3Label}
                </p>
            </HeroScene>

            {/* Section 2 — Build with the community */}
            <Surface
                variant="panel"
                className={cn(postHeroSpacingClassName, "flex flex-col gap-6")}
            >
                <div className="flex max-w-xl flex-col gap-2">
                    <h2 className="font-subheading text-2xl leading-tight text-theme-text-strong sm:text-3xl">
                        {pageCopy.contributeTitle}
                    </h2>
                    <p className="text-sm leading-relaxed text-theme-text-base sm:text-base">
                        {pageCopy.contributeBody}
                    </p>
                </div>
                <div className="grid grid-cols-1 gap-5 min-[900px]:grid-cols-3">
                    {contributeCards.map((card) => (
                        <LinkCard
                            key={card.href}
                            href={card.href}
                            surfaceClassName="gap-2.5 p-5 sm:p-6 xl:p-5"
                        >
                            <h3 className="font-body text-xl font-semibold text-theme-text-strong">
                                {card.title}
                            </h3>
                            <p className="text-sm leading-relaxed text-theme-text-base">
                                {card.body}
                            </p>
                        </LinkCard>
                    ))}
                </div>
                <p className="text-sm leading-relaxed text-theme-text-muted">
                    {pageCopy.contributeNotePre}
                    <InlineLink href={SOCIAL_LINKS.discord.url}>
                        {pageCopy.contributeNoteLink}
                    </InlineLink>
                    {pageCopy.contributeNotePost}
                </p>
                <ExternalLinkButton
                    href={SOCIAL_LINKS.discord.url}
                    size="md"
                    intent="brand"
                    className="self-start"
                >
                    {pageCopy.learnAboutTiersButton}
                </ExternalLinkButton>
            </Surface>

            {/* Section 3 — Jump In */}
            <section className="flex flex-col gap-5">
                <ContentHeader eyebrow={null} title={pageCopy.jumpInTitle} />
                <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                    {/* Discord — full width */}
                    <Surface
                        variant="card"
                        className="flex flex-col gap-4 p-5 sm:p-6 md:col-span-2"
                    >
                        <h3 className="font-body text-xl font-semibold text-theme-text-strong">
                            {pageCopy.discordTitle}
                        </h3>
                        <p className="text-sm leading-relaxed text-theme-text-base">
                            {pageCopy.discordEmoji} {pageCopy.discordDesc1}
                            <em>{pageCopy.discordDesc1Em}</em>
                            {pageCopy.discordDesc1End}
                            <br />
                            {pageCopy.discordDesc2Pre}
                            <InlineLink href={LINKS.discordPollenBeta}>
                                {pageCopy.discordDesc2Link}
                            </InlineLink>
                            {pageCopy.discordDesc2Post}
                        </p>
                        <ExternalLinkButton
                            href={SOCIAL_LINKS.discord.url}
                            size="md"
                            intent="brand"
                            className="self-start"
                        >
                            {pageCopy.joinDiscordButton}
                        </ExternalLinkButton>
                    </Surface>

                    {/* GitHub + Submit App — 2 columns on desktop */}
                    <Surface
                        variant="card"
                        className="flex flex-col gap-4 p-5 sm:p-6"
                    >
                        <h3 className="font-body text-xl font-semibold text-theme-text-strong">
                            {pageCopy.githubTitle}
                        </h3>
                        <p className="text-sm leading-relaxed text-theme-text-base">
                            {pageCopy.githubEmoji} {pageCopy.githubDesc}
                            <strong>{pageCopy.githubDescBold}</strong>
                            {pageCopy.githubDescEnd}
                        </p>
                        <ExternalLinkButton
                            href={SOCIAL_LINKS.github.url}
                            size="md"
                            intent="brand"
                            className="self-start"
                        >
                            {pageCopy.starContributeButton}
                        </ExternalLinkButton>
                    </Surface>

                    <Surface
                        variant="card"
                        className="flex flex-col gap-4 p-5 sm:p-6"
                    >
                        <h3 className="font-body text-xl font-semibold text-theme-text-strong">
                            {pageCopy.submitAppTitle}
                        </h3>
                        <p className="text-sm leading-relaxed text-theme-text-base">
                            {pageCopy.submitEmoji} {pageCopy.submitDesc}
                            <strong>{pageCopy.submitDescBold}</strong>
                        </p>
                        <ExternalLinkButton
                            href={LINKS.githubSubmitApp}
                            size="md"
                            intent="brand"
                            className="self-start"
                        >
                            {pageCopy.submitAppButton}
                        </ExternalLinkButton>
                    </Surface>
                </div>
            </section>

            {/* Section 4 — Voting */}
            <Surface
                variant="panel"
                className="overflow-hidden polli:p-0 polli:sm:p-0"
            >
                <div className="flex flex-col gap-6 p-5 pb-0 sm:p-6 sm:pb-0">
                    <h2 className="font-subheading text-2xl leading-tight text-theme-text-strong sm:text-3xl">
                        {pageCopy.votingTitle}
                    </h2>
                    <div className="flex flex-col gap-4">
                        {translatedVotingIssues.map((issue) => (
                            <InlineLink
                                key={issue.url}
                                href={issue.url}
                                className="flex w-fit max-w-full items-center gap-2"
                            >
                                <span aria-hidden="true" className="shrink-0">
                                    {issue.emoji}
                                </span>
                                <span className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
                                    <span className="whitespace-nowrap text-xs text-theme-text-muted tabular-nums">
                                        {issue.votes} {pageCopy.votesLabel}
                                    </span>
                                    <span className="font-semibold leading-snug text-theme-text-strong">
                                        {issue.title}
                                    </span>
                                </span>
                            </InlineLink>
                        ))}
                    </div>
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
                    className="bottom-scene pointer-events-none mt-4 block h-[clamp(12rem,24vw,20rem)] w-full select-none object-cover object-bottom"
                />
            </Surface>

            <QuestLeaderboard />

            <TopContributors />

            {/* Section 5 — Build Diary + Supporters */}
            <section className="flex flex-col gap-5">
                <ContentHeader
                    eyebrow={null}
                    title={pageCopy.buildDiaryTitle}
                    subtitle={pageCopy.buildDiarySubtitle}
                />
                <BuildDiary />
            </section>

            <section className="flex flex-col gap-5">
                <ContentHeader
                    eyebrow={null}
                    title={pageCopy.supportersTitle}
                />
                <div className="grid grid-cols-[repeat(auto-fit,minmax(min(240px,100%),1fr))] gap-3.5">
                    {COMMUNITY_PAGE.supportersList.map((supporter) => (
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
                                className="h-9 w-9 bg-theme-text-strong"
                                style={{
                                    WebkitMask: `url(${supporter.logo}) center / contain no-repeat`,
                                    mask: `url(${supporter.logo}) center / contain no-repeat`,
                                }}
                            />
                            <span className="font-body text-base font-semibold text-theme-text-strong">
                                {supporter.name}
                            </span>
                        </Surface>
                    ))}
                </div>
            </section>
            <BottomScene page="community" />
        </>
    );
}
