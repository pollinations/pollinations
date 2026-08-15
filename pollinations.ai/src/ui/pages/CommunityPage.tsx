import { COMMUNITY_PAGE } from "../../copy/content/community";
import { LINKS, SOCIAL_LINKS } from "../../copy/content/socialLinks";
import { useCommunityLeaderboards } from "../../hooks/useCommunityLeaderboards";
import { useCommunityProviders } from "../../hooks/useCommunityProviders";
import { useDocumentMeta } from "../../hooks/useDocumentMeta";
import { usePageCopy } from "../../hooks/usePageCopy";
import { useTranslate } from "../../hooks/useTranslate";
import { ExternalLinkIcon } from "../assets/ExternalLinkIcon";
import { BuildDiary } from "../components/BuildDiary";
import { TopContributors } from "../components/TopContributors";
import { Button } from "../components/ui/button";
import { Divider } from "../components/ui/divider";
import { PageCard } from "../components/ui/page-card";
import { PageContainer } from "../components/ui/page-container";
import { SubCard } from "../components/ui/sub-card";
import { Body, Heading, Title } from "../components/ui/typography";

interface VotingIssue {
    emoji: string;
    title: string;
    url: string;
    votes: number;
}

export default function CommunityPage() {
    const { copy: pageCopy, isTranslating } = usePageCopy(COMMUNITY_PAGE);
    const { providers, loading: providersLoading } = useCommunityProviders();
    const { leaderboards, loading: leaderboardsLoading } =
        useCommunityLeaderboards();
    useDocumentMeta(pageCopy.pageTitle, pageCopy.pageDescription);

    const { translated: translatedVotingIssues } = useTranslate(
        COMMUNITY_PAGE.votingIssues as VotingIssue[],
        "title",
    );

    return (
        <PageContainer>
            <PageCard isTranslating={isTranslating}>
                {/* Section 1 — Hero */}
                <Title>{pageCopy.title}</Title>
                <div className="mb-8">
                    <Body spacing="none">
                        {pageCopy.subtitlePrefix}{" "}
                        <strong>{pageCopy.subtitleBold}</strong>
                        {pageCopy.subtitleSuffix}
                    </Body>
                </div>
                <p className="font-body text-base text-subtle mb-4">
                    <a
                        href={SOCIAL_LINKS.discord.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="hover:underline"
                    >
                        <span className="font-headline text-xs font-black text-muted">
                            {pageCopy.heroStat1}
                        </span>{" "}
                        {pageCopy.heroStat1Label}
                    </a>
                    <span className="mx-2 text-border-subtle">·</span>
                    <a
                        href={SOCIAL_LINKS.github.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="hover:underline"
                    >
                        <span className="font-headline text-xs font-black text-muted">
                            {pageCopy.heroStat2}
                        </span>{" "}
                        {pageCopy.heroStat2Label}
                    </a>
                    <span className="mx-2 text-border-subtle">·</span>
                    <span className="font-headline text-xs font-black text-muted">
                        {pageCopy.heroStat3}
                    </span>{" "}
                    {pageCopy.heroStat3Label}
                </p>

                <Divider />

                {/* Section 2 — Build with the community */}
                <div className="mb-12">
                    <Heading variant="section" spacing="comfortable">
                        {pageCopy.contributeTitle}
                    </Heading>
                    <Body spacing="comfortable">{pageCopy.contributeBody}</Body>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                        <a
                            href={LINKS.githubSubmitApp}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-4 bg-primary-light rounded-sub-card border-2 border-dark border-r-4 border-b-4 transition hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-none block"
                        >
                            <Heading
                                variant="subsection"
                                as="h3"
                                spacing="tight"
                            >
                                {pageCopy.contributeCard1Title}
                            </Heading>
                            <Body size="sm" spacing="none">
                                {pageCopy.contributeCard1Body}
                            </Body>
                        </a>
                        <a
                            href={LINKS.githubNewIssue}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-4 bg-tertiary-light rounded-sub-card border-2 border-dark border-r-4 border-b-4 transition hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-none block"
                        >
                            <Heading
                                variant="subsection"
                                as="h3"
                                spacing="tight"
                            >
                                {pageCopy.contributeCard2Title}
                            </Heading>
                            <Body size="sm" spacing="none">
                                {pageCopy.contributeCard2Body}
                            </Body>
                        </a>
                        <a
                            href={SOCIAL_LINKS.discord.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-4 bg-secondary-light rounded-sub-card border-2 border-dark border-r-4 border-b-4 transition hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-none block"
                        >
                            <Heading
                                variant="subsection"
                                as="h3"
                                spacing="tight"
                            >
                                {pageCopy.contributeCard3Title}
                            </Heading>
                            <Body size="sm" spacing="none">
                                {pageCopy.contributeCard3Body}
                            </Body>
                        </a>
                    </div>
                    <Body
                        size="sm"
                        spacing="comfortable"
                        className="text-muted"
                    >
                        {pageCopy.contributeNotePre}
                        <a
                            href={SOCIAL_LINKS.discord.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-bold text-dark hover:underline"
                        >
                            {pageCopy.contributeNoteLink}
                        </a>
                        {pageCopy.contributeNotePost}
                    </Body>
                    <a
                        href={SOCIAL_LINKS.discord.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-headline text-xs font-black hover:underline inline-flex items-center gap-1 text-dark bg-accent-strong px-2 py-0.5"
                    >
                        {pageCopy.learnAboutTiersButton}
                        <ExternalLinkIcon className="w-3 h-3" strokeWidth="4" />
                    </a>
                </div>

                <Divider />

                {/* Section 3 — Jump In */}
                <div className="mb-12">
                    <Heading variant="section" spacing="comfortable">
                        {pageCopy.jumpInTitle}
                    </Heading>
                    <div className="flex flex-col gap-4">
                        {/* Discord — full width */}
                        <SubCard>
                            <Heading
                                variant="subsection"
                                as="h3"
                                spacing="tight"
                            >
                                {pageCopy.discordTitle}
                            </Heading>
                            <div className="bg-white border border-border-subtle rounded-sub-card px-4 py-3 mb-4 w-fit">
                                <Body size="sm" spacing="none">
                                    {pageCopy.discordEmoji}{" "}
                                    {pageCopy.discordDesc1}
                                    <em>{pageCopy.discordDesc1Em}</em>
                                    {pageCopy.discordDesc1End}
                                    <br />
                                    {pageCopy.discordDesc2Pre}
                                    <a
                                        href={LINKS.discordPollenBeta}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="font-bold hover:underline"
                                    >
                                        {pageCopy.discordDesc2Link}
                                    </a>
                                    {pageCopy.discordDesc2Post}
                                </Body>
                            </div>
                            <Button
                                as="a"
                                href={SOCIAL_LINKS.discord.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                variant="primary"
                                size="default"
                                className="bg-secondary-strong text-dark hover:bg-secondary-strong/80 hover:text-dark"
                            >
                                {pageCopy.joinDiscordButton}
                                <ExternalLinkIcon className="w-3 h-3 stroke-charcoal" />
                            </Button>
                        </SubCard>

                        {/* GitHub + Submit App — 2 columns on desktop */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <SubCard>
                                <Heading
                                    variant="subsection"
                                    as="h3"
                                    spacing="tight"
                                >
                                    {pageCopy.githubTitle}
                                </Heading>
                                <div className="bg-white border border-border-subtle rounded-sub-card px-4 py-3 mb-4 w-fit">
                                    <Body size="sm" spacing="none">
                                        {pageCopy.githubEmoji}{" "}
                                        {pageCopy.githubDesc}
                                        <strong>
                                            {pageCopy.githubDescBold}
                                        </strong>
                                        {pageCopy.githubDescEnd}
                                    </Body>
                                </div>
                                <Button
                                    as="a"
                                    href={SOCIAL_LINKS.github.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    variant="primary"
                                    size="default"
                                    className="bg-tertiary-strong text-dark hover:bg-tertiary-strong/80 hover:text-dark"
                                >
                                    {pageCopy.starContributeButton}
                                    <ExternalLinkIcon className="w-3 h-3 stroke-charcoal" />
                                </Button>
                            </SubCard>

                            <SubCard>
                                <Heading
                                    variant="subsection"
                                    as="h3"
                                    spacing="tight"
                                >
                                    {pageCopy.submitAppTitle}
                                </Heading>
                                <div className="bg-white border border-border-subtle rounded-sub-card px-4 py-3 mb-4 w-fit">
                                    <Body size="sm" spacing="none">
                                        {pageCopy.submitEmoji}{" "}
                                        {pageCopy.submitDesc}
                                        <strong>
                                            {pageCopy.submitDescBold}
                                        </strong>
                                    </Body>
                                </div>
                                <Button
                                    as="a"
                                    href={LINKS.githubSubmitApp}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    variant="primary"
                                    size="default"
                                    className="bg-primary-strong text-dark hover:bg-primary-strong/80 hover:text-dark"
                                >
                                    {pageCopy.submitAppButton}
                                    <ExternalLinkIcon className="w-3 h-3 stroke-charcoal" />
                                </Button>
                            </SubCard>
                        </div>
                    </div>
                </div>

                <Divider />

                {/* Section 4 — Voting + Contributors */}
                <div className="mb-12">
                    <Heading variant="section" spacing="comfortable">
                        {pageCopy.votingTitle}
                    </Heading>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        {translatedVotingIssues.map((issue, i) => {
                            const colors = [
                                "border-primary-strong shadow-[1px_1px_0_rgb(var(--primary-strong)_/_0.3)]",
                                "border-secondary-strong shadow-[1px_1px_0_rgb(var(--secondary-strong)_/_0.3)]",
                                "border-tertiary-strong shadow-[1px_1px_0_rgb(var(--tertiary-strong)_/_0.3)]",
                            ];
                            return (
                                <a
                                    key={issue.url}
                                    href={issue.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className={`block bg-white/60 p-4 rounded-sub-card border-r-2 border-b-2 ${colors[i]} transition hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-none active:translate-x-[2px] active:translate-y-[2px] active:shadow-none`}
                                >
                                    <div className="flex flex-col gap-2">
                                        <div className="flex items-center justify-between">
                                            <span className="text-2xl">
                                                {issue.emoji}
                                            </span>
                                            <span className="font-mono text-xs text-subtle">
                                                {issue.votes}{" "}
                                                {pageCopy.votesLabel}
                                            </span>
                                        </div>
                                        <p className="font-headline text-xs font-black text-dark">
                                            {issue.title}
                                        </p>
                                    </div>
                                </a>
                            );
                        })}
                    </div>
                </div>

                <Divider />

                <TopContributors />

                <Divider />

                {/* Community model providers */}
                <div className="mb-12">
                    <Heading variant="section">
                        {pageCopy.providersTitle}
                    </Heading>
                    <Body size="sm" spacing="comfortable">
                        {pageCopy.providersSubtitle}
                    </Body>
                    {providersLoading && providers.length === 0 ? (
                        <Body size="sm" spacing="none" className="text-muted">
                            {pageCopy.providersLoading}
                        </Body>
                    ) : providers.length === 0 ? (
                        <Body size="sm" spacing="none" className="text-muted">
                            {pageCopy.providersEmpty}
                        </Body>
                    ) : (
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                            {providers.map((provider, index) => {
                                const colors = [
                                    "border-primary-strong",
                                    "border-secondary-strong",
                                    "border-tertiary-strong",
                                    "border-accent-strong",
                                ];
                                return (
                                    <a
                                        key={`${provider.name}:${provider.url}`}
                                        href={provider.url}
                                        target="_blank"
                                        rel="noopener noreferrer nofollow ugc"
                                        className={`block rounded-sub-card border-2 border-r-4 border-b-4 bg-white/60 p-4 transition hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-none ${colors[index % colors.length]}`}
                                    >
                                        <div className="mb-2 flex items-start justify-between gap-3">
                                            <Heading
                                                variant="subsection"
                                                as="h3"
                                                spacing="tight"
                                            >
                                                {provider.name}
                                            </Heading>
                                            <ExternalLinkIcon className="mt-1 h-3 w-3 shrink-0" />
                                        </div>
                                        <p className="font-mono text-xs text-muted">
                                            {provider.modelCount}{" "}
                                            {provider.modelCount === 1
                                                ? pageCopy.providerModelLabel
                                                : pageCopy.providerModelsLabel}
                                            {provider.categories.length > 0
                                                ? ` · ${provider.categories.join(" · ")}`
                                                : ""}
                                        </p>
                                    </a>
                                );
                            })}
                        </div>
                    )}
                </div>

                <Divider />

                {/* Latest community model leaderboards */}
                <div className="mb-12">
                    <Heading variant="section">
                        {pageCopy.leaderboardsTitle}
                    </Heading>
                    <Body size="sm" spacing="comfortable">
                        {pageCopy.leaderboardsSubtitle}
                    </Body>
                    {leaderboardsLoading && leaderboards.length === 0 ? (
                        <Body size="sm" spacing="none" className="text-muted">
                            {pageCopy.leaderboardsLoading}
                        </Body>
                    ) : leaderboards.length === 0 ? (
                        <Body size="sm" spacing="none" className="text-muted">
                            {pageCopy.leaderboardsEmpty}
                        </Body>
                    ) : (
                        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                            {leaderboards.map((board) => {
                                const label =
                                    board.kind === "text"
                                        ? pageCopy.textLeaderboardLabel
                                        : pageCopy.imageLeaderboardLabel;
                                return (
                                    <a
                                        key={board.kind}
                                        href={board.url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="overflow-hidden rounded-sub-card border-2 border-r-4 border-b-4 border-dark bg-white/60 transition hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-none"
                                    >
                                        <img
                                            src={board.url}
                                            alt={`${label} community model leaderboard`}
                                            loading="lazy"
                                            className="block h-auto w-full"
                                        />
                                        <div className="flex items-center justify-between gap-3 border-t-2 border-dark px-4 py-3">
                                            <span className="font-headline text-xs font-black uppercase tracking-wider text-dark">
                                                {label}
                                            </span>
                                            <span className="font-mono text-[11px] text-muted">
                                                {
                                                    pageCopy.leaderboardUpdatedLabel
                                                }{" "}
                                                <time
                                                    dateTime={board.createdAt}
                                                >
                                                    {new Intl.DateTimeFormat(
                                                        undefined,
                                                        { dateStyle: "medium" },
                                                    ).format(
                                                        new Date(
                                                            board.createdAt,
                                                        ),
                                                    )}
                                                </time>
                                            </span>
                                        </div>
                                    </a>
                                );
                            })}
                        </div>
                    )}
                </div>

                <Divider />

                {/* Build Diary + Supporters */}
                <div className="mb-12">
                    <Heading variant="section">
                        {pageCopy.buildDiaryTitle}
                    </Heading>
                    <Body size="sm" spacing="comfortable">
                        {pageCopy.buildDiarySubtitle}
                    </Body>
                    <BuildDiary />
                </div>

                <Divider />

                <div>
                    <Heading variant="section" className="mb-8">
                        {pageCopy.supportersTitle}
                    </Heading>
                    <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6 xl:grid-cols-8">
                        {COMMUNITY_PAGE.supportersList.map(
                            (supporter, index) => {
                                const borderColors = [
                                    "border-primary-strong shadow-[2px_2px_0_rgb(var(--primary-strong)_/_0.3)]",
                                    "border-secondary-strong shadow-[2px_2px_0_rgb(var(--secondary-strong)_/_0.3)]",
                                    "border-tertiary-strong shadow-[2px_2px_0_rgb(var(--tertiary-strong)_/_0.3)]",
                                    "border-accent-strong shadow-[2px_2px_0_rgb(var(--accent-strong)_/_0.3)]",
                                ];
                                return (
                                    <a
                                        key={supporter.name}
                                        href={supporter.url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        aria-label={supporter.name}
                                        className={`group flex aspect-square w-full flex-col items-center justify-center gap-2 bg-white/60 rounded-sub-card border-r-2 border-b-2 p-2 text-center ${borderColors[index % borderColors.length]} transition hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-none active:translate-x-[2px] active:translate-y-[2px] active:shadow-none`}
                                    >
                                        <span
                                            aria-hidden="true"
                                            className="block h-10 w-10 bg-dark transition group-hover:scale-105"
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
                                        <span className="font-body text-[9px] font-bold text-dark leading-[1.1]">
                                            {supporter.name}
                                        </span>
                                    </a>
                                );
                            },
                        )}
                    </div>
                </div>
            </PageCard>
        </PageContainer>
    );
}
