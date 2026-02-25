import { COPY_CONSTANTS } from "../../copy/constants";
import { COMMUNITY_PAGE } from "../../copy/content/community";
import { LINKS, SOCIAL_LINKS } from "../../copy/content/socialLinks";
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
                    <Body spacing="comfortable">{pageCopy.subtitle}</Body>
                </div>
                <p className="font-body text-base text-text-body-tertiary mb-4">
                    <span className="font-headline text-lg font-black text-text-body-secondary">
                        {pageCopy.heroStat1}
                    </span>{" "}
                    {pageCopy.heroStat1Label}
                    <span className="mx-2 text-border-subtle">·</span>
                    <span className="font-headline text-lg font-black text-text-body-secondary">
                        {pageCopy.heroStat2}
                    </span>{" "}
                    {pageCopy.heroStat2Label}
                    <span className="mx-2 text-border-subtle">·</span>
                    <span className="font-headline text-lg font-black text-text-body-secondary">
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
                        <SubCard size="compact">
                            <Heading variant="lime" as="h3" spacing="tight">
                                {pageCopy.contributeCard1Title}
                            </Heading>
                            <Body size="sm" spacing="none">
                                {pageCopy.contributeCard1Body}
                            </Body>
                        </SubCard>
                        <SubCard size="compact">
                            <Heading variant="lime" as="h3" spacing="tight">
                                {pageCopy.contributeCard2Title}
                            </Heading>
                            <Body size="sm" spacing="none">
                                {pageCopy.contributeCard2Body}
                            </Body>
                        </SubCard>
                        <SubCard size="compact">
                            <Heading variant="lime" as="h3" spacing="tight">
                                {pageCopy.contributeCard3Title}
                            </Heading>
                            <Body size="sm" spacing="none">
                                {pageCopy.contributeCard3Body}
                            </Body>
                        </SubCard>
                    </div>
                    <Body
                        size="sm"
                        spacing="comfortable"
                        className="text-text-body-secondary"
                    >
                        {pageCopy.contributeNote}
                    </Body>
                    <Button
                        as="a"
                        href={LINKS.enterTiersFaq}
                        target="_blank"
                        rel="noopener noreferrer"
                        variant="secondary"
                        size="default"
                    >
                        {pageCopy.learnAboutTiersButton}
                    </Button>
                </div>

                <Divider />

                {/* Section 3 — Jump In */}
                <div className="mb-12">
                    <Heading variant="section" spacing="comfortable">
                        {pageCopy.jumpInTitle}
                    </Heading>
                    <div className="space-y-4">
                        {/* Discord */}
                        <SubCard>
                            <Heading variant="lime" as="h3" spacing="tight">
                                {pageCopy.discordTitle}
                            </Heading>
                            <Body size="sm" spacing="comfortable">
                                {pageCopy.discordSubtitle}
                            </Body>
                            <div className="flex flex-wrap gap-2">
                                <Button
                                    as="a"
                                    href={SOCIAL_LINKS.discord.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    variant="primary"
                                    size="default"
                                >
                                    {pageCopy.joinDiscordButton}
                                    <ExternalLinkIcon className="w-3 h-3 stroke-text-highlight" />
                                </Button>
                                <Button
                                    as="a"
                                    href={LINKS.discordPollenBeta}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    variant="secondary"
                                    size="default"
                                >
                                    {pageCopy.pollenBetaButton}
                                    <ExternalLinkIcon className="w-3 h-3 text-text-body-main" />
                                </Button>
                            </div>
                        </SubCard>

                        {/* GitHub */}
                        <SubCard>
                            <Heading variant="rose" as="h3" spacing="tight">
                                {pageCopy.githubTitle}
                            </Heading>
                            <Body size="sm" spacing="comfortable">
                                {pageCopy.githubSubtitle}
                            </Body>
                            <Button
                                as="a"
                                href={SOCIAL_LINKS.github.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                variant="primary"
                                size="default"
                            >
                                {pageCopy.starContributeButton}
                                <ExternalLinkIcon className="w-3 h-3 stroke-text-highlight" />
                            </Button>
                        </SubCard>

                        {/* Submit App */}
                        <SubCard>
                            <Heading variant="rose" as="h3" spacing="tight">
                                {pageCopy.submitAppTitle}
                            </Heading>
                            <Body size="sm" spacing="comfortable">
                                {pageCopy.submitAppSubtitle}
                            </Body>
                            <Button
                                as="a"
                                href={LINKS.githubSubmitApp}
                                target="_blank"
                                rel="noopener noreferrer"
                                variant="secondary"
                                size="default"
                            >
                                {pageCopy.submitAppButton}
                                <ExternalLinkIcon className="w-3 h-3 text-text-body-main" />
                            </Button>
                        </SubCard>
                    </div>
                </div>

                <Divider />

                {/* Section 4 — Voting + Contributors */}
                <div className="mb-12">
                    <Heading variant="section" spacing="comfortable">
                        {pageCopy.votingTitle}
                    </Heading>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        {translatedVotingIssues.map((issue) => (
                            <a
                                key={issue.url}
                                href={issue.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="block bg-input-background p-4 rounded-sub-card border-l-4 border-border-brand hover:border-border-highlight transition-colors"
                            >
                                <div className="flex flex-col gap-2">
                                    <div className="flex items-center justify-between">
                                        <span className="text-2xl">
                                            {issue.emoji}
                                        </span>
                                        <span className="font-mono text-xs text-text-caption">
                                            {issue.votes} votes
                                        </span>
                                    </div>
                                    <p className="font-headline text-base font-black text-text-body-main">
                                        {issue.title}
                                    </p>
                                </div>
                            </a>
                        ))}
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
                            return (
                                <a
                                    key={supporter.name}
                                    href={supporter.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="group flex flex-col items-center text-center hover:opacity-70 transition-opacity"
                                    title={supporter.name}
                                >
                                    <div className="w-16 h-16 mb-2 overflow-hidden">
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
                                            className="w-full h-full object-contain"
                                        />
                                    </div>
                                    <p className="font-body text-xs font-bold text-text-body-main leading-tight">
                                        {supporter.name}
                                    </p>
                                </a>
                            );
                        })}
                    </div>
                </div>
            </PageCard>
        </PageContainer>
    );
}
