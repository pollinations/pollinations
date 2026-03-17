import { COPY_CONSTANTS } from "../../copy/constants";
import { COMMUNITY_PAGE } from "../../copy/content/community";
import { LINKS, SOCIAL_LINKS } from "../../copy/content/socialLinks";
import { useDocumentMeta } from "../../hooks/useDocumentMeta";
import { usePageCopy } from "../../hooks/usePageCopy";
import { useTranslate } from "../../hooks/useTranslate";
import { ExternalLinkIcon } from "../assets/ExternalLinkIcon";
import { BuildDiary } from "../components/BuildDiary";
import { ImageGenerator } from "../components/ImageGenerator";
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
    useDocumentMeta(pageCopy.pageTitle, pageCopy.pageDescription);

    const { translated: translatedVotingIssues } = useTranslate(
        COMMUNITY_PAGE.votingIssues as VotingIssue[],
        "title",
    );

    const { translated: translatedSupporters } = useTranslate(
        COMMUNITY_PAGE.supportersList,
        "description",
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

                {/* Section 2 — Contributing Earns Pollen */}
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
                            href={LINKS.enterTiersFaq}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-bold text-dark hover:underline"
                        >
                            {pageCopy.contributeNoteLink}
                        </a>
                        {pageCopy.contributeNotePost}
                    </Body>
                    <a
                        href={LINKS.enterTiersFaq}
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
                                        className="font-headline text-xs font-black text-dark bg-accent-strong px-2 py-0.5 hover:underline"
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
                    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-8">
                        {translatedSupporters.map((supporter, index) => {
                            const originalSupporter =
                                COMMUNITY_PAGE.supportersList[index];
                            const borderColors = [
                                "border-primary-strong shadow-[2px_2px_0_rgb(var(--primary-strong)_/_0.3)]",
                                "border-secondary-strong shadow-[2px_2px_0_rgb(var(--secondary-strong)_/_0.3)]",
                                "border-tertiary-strong shadow-[2px_2px_0_rgb(var(--tertiary-strong)_/_0.3)]",
                                "border-accent-strong shadow-[2px_2px_0_rgb(var(--accent-strong)_/_0.3)]",
                            ];
                            return (
                                <div
                                    key={supporter.name}
                                    className="flex flex-col items-center text-center"
                                >
                                    <a
                                        href={supporter.url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className={`block w-16 h-16 overflow-hidden bg-white/60 rounded-sub-card border-r-2 border-b-2 ${borderColors[index % borderColors.length]} transition hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-none active:translate-x-[2px] active:translate-y-[2px] active:shadow-none mb-2`}
                                    >
                                        <ImageGenerator
                                            key={`${supporter.name}-logo`}
                                            prompt={`${COPY_CONSTANTS.supporterLogoPrompt} ${originalSupporter.name}. ${originalSupporter.description}`}
                                            width={200}
                                            height={200}
                                            seed={
                                                COPY_CONSTANTS.supporterLogoSeed
                                            }
                                            model={
                                                COPY_CONSTANTS.supporterLogoModel
                                            }
                                            alt={supporter.name}
                                            className="w-full h-full object-cover"
                                        />
                                    </a>
                                    <p className="font-body text-[10px] font-bold text-dark leading-tight">
                                        {supporter.name}
                                    </p>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </PageCard>
        </PageContainer>
    );
}
