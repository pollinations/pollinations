import { COMMUNITY_PAGE } from "../../copy/content/community";
import { LINKS, SOCIAL_LINKS } from "../../copy/content/socialLinks";
import { useDocumentMeta } from "../../hooks/useDocumentMeta";
import { usePageCopy } from "../../hooks/usePageCopy";
import { useTranslate } from "../../hooks/useTranslate";
import { ExternalLinkIcon } from "../assets/ExternalLinkIcon";
import { BuildDiary } from "../components/BuildDiary";
import { TopContributors } from "../components/TopContributors";
import { Divider } from "../components/ui/divider";
import { InlineLink } from "../components/ui/inline-link";
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
                    <InlineLink href={SOCIAL_LINKS.discord.url}>
                        <span className="font-headline text-xs font-black text-muted">
                            {pageCopy.heroStat1}
                        </span>{" "}
                        {pageCopy.heroStat1Label}
                    </InlineLink>
                    <span className="mx-2 text-border-subtle">·</span>
                    <InlineLink href={SOCIAL_LINKS.github.url}>
                        <span className="font-headline text-xs font-black text-muted">
                            {pageCopy.heroStat2}
                        </span>{" "}
                        {pageCopy.heroStat2Label}
                    </InlineLink>
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
                            className="polli-link-surface relative pr-6 p-4 bg-primary-light rounded-sub-card border-2 border-dark border-r-4 border-b-4 transition hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-none block"
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
                            <ExternalLinkIcon
                                className="absolute right-2 top-2 h-3.5 w-3.5 opacity-60"
                                aria-hidden="true"
                            />
                        </a>
                        <a
                            href={LINKS.githubNewIssue}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="polli-link-surface relative pr-6 p-4 bg-tertiary-light rounded-sub-card border-2 border-dark border-r-4 border-b-4 transition hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-none block"
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
                            <ExternalLinkIcon
                                className="absolute right-2 top-2 h-3.5 w-3.5 opacity-60"
                                aria-hidden="true"
                            />
                        </a>
                        <a
                            href={SOCIAL_LINKS.discord.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="polli-link-surface relative pr-6 p-4 bg-secondary-light rounded-sub-card border-2 border-dark border-r-4 border-b-4 transition hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-none block"
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
                            <ExternalLinkIcon
                                className="absolute right-2 top-2 h-3.5 w-3.5 opacity-60"
                                aria-hidden="true"
                            />
                        </a>
                    </div>
                    <Body
                        size="sm"
                        spacing="comfortable"
                        className="text-muted"
                    >
                        {pageCopy.contributeNotePre}
                        <InlineLink href={SOCIAL_LINKS.discord.url}>
                            {pageCopy.contributeNoteLink}
                        </InlineLink>
                        {pageCopy.contributeNotePost}
                    </Body>
                    <InlineLink href={SOCIAL_LINKS.discord.url}>
                        {pageCopy.learnAboutTiersButton}
                    </InlineLink>
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
                                    <InlineLink href={LINKS.discordPollenBeta}>
                                        {pageCopy.discordDesc2Link}
                                    </InlineLink>
                                    {pageCopy.discordDesc2Post}
                                </Body>
                            </div>
                            <InlineLink
                                as="a"
                                href={SOCIAL_LINKS.discord.url}
                                size="sm"
                                className="inline-flex items-center gap-1.5"
                            >
                                {pageCopy.joinDiscordButton}
                            </InlineLink>
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
                                <InlineLink
                                    as="a"
                                    href={SOCIAL_LINKS.github.url}
                                    size="sm"
                                    className="inline-flex items-center gap-1.5"
                                >
                                    {pageCopy.starContributeButton}
                                </InlineLink>
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
                                <InlineLink
                                    as="a"
                                    href={LINKS.githubSubmitApp}
                                    size="sm"
                                    className="inline-flex items-center gap-1.5"
                                >
                                    {pageCopy.submitAppButton}
                                </InlineLink>
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
                                    className={`polli-link-surface relative pr-6 block bg-white/60 p-4 rounded-sub-card border-r-2 border-b-2 ${colors[i]} transition hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-none active:translate-x-[2px] active:translate-y-[2px] active:shadow-none`}
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
                                    <ExternalLinkIcon
                                        className="absolute right-2 top-2 h-3.5 w-3.5 opacity-60"
                                        aria-hidden="true"
                                    />
                                </a>
                            );
                        })}
                    </div>
                </div>

                <Divider />

                <TopContributors />

                {/* Section 5 — Build Diary + Supporters */}
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
                                        className={`polli-link-surface relative pr-6 group flex aspect-square w-full flex-col items-center justify-center gap-2 bg-white/60 rounded-sub-card border-r-2 border-b-2 p-2 text-center ${borderColors[index % borderColors.length]} transition hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-none active:translate-x-[2px] active:translate-y-[2px] active:shadow-none`}
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
                                        <ExternalLinkIcon
                                            className="absolute right-2 top-2 h-3.5 w-3.5 opacity-60"
                                            aria-hidden="true"
                                        />
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
