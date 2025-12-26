import { useEffect, useState } from "react";
import { processCopy } from "../../copy";
import { COMMUNITY_PAGE } from "../../copy/content/community";
import { LINKS, SOCIAL_LINKS } from "../../copy/content/socialLinks";
import { ExternalLinkIcon } from "../assets/ExternalLinkIcon";
import { ImageGenerator } from "../components/ImageGenerator";
import { NewsSection } from "../components/NewsSection";
import { TopContributors } from "../components/TopContributors";
import { Button } from "../components/ui/button";
import { Divider } from "../components/ui/divider";
import { PageCard } from "../components/ui/page-card";
import { PageContainer } from "../components/ui/page-container";
import { SubCard } from "../components/ui/sub-card";
import { Body, Heading, Title } from "../components/ui/typography";
import { useCopy } from "../contexts/CopyContext";

interface VotingIssue {
    emoji: string;
    title: string;
    url: string;
    votes: number;
}

interface Supporter {
    name: string;
    url: string;
    description: string;
}

export default function CommunityPage() {
    const { processedCopy, language, variationSeed } = useCopy();
    const pageCopy = (
        processedCopy?.newsFilePath ? processedCopy : COMMUNITY_PAGE
    ) as typeof COMMUNITY_PAGE;

    const [translatedSupporters, setTranslatedSupporters] = useState<
        Supporter[]
    >(COMMUNITY_PAGE.supportersList);
    const [translatedVotingIssues, setTranslatedVotingIssues] = useState<
        VotingIssue[]
    >(COMMUNITY_PAGE.votingIssues as VotingIssue[]);

    // Translate voting issue titles when language changes
    useEffect(() => {
        if (language === "en") {
            setTranslatedVotingIssues(
                COMMUNITY_PAGE.votingIssues as VotingIssue[],
            );
            return;
        }

        const items = (COMMUNITY_PAGE.votingIssues as VotingIssue[]).map(
            (issue, i) => ({
                id: `issue-${i}`,
                text: issue.title,
                mode: "translate" as const,
            }),
        );

        processCopy(items, language, variationSeed)
            .then((processed) => {
                const translated = (
                    COMMUNITY_PAGE.votingIssues as VotingIssue[]
                ).map((issue, i) => ({
                    ...issue,
                    title: processed[i]?.text || issue.title,
                }));
                setTranslatedVotingIssues(translated);
            })
            .catch(console.error);
    }, [language, variationSeed]);

    // Translate supporter descriptions when language changes
    useEffect(() => {
        if (language === "en") {
            setTranslatedSupporters(COMMUNITY_PAGE.supportersList);
            return;
        }

        const items = COMMUNITY_PAGE.supportersList.map((s, i) => ({
            id: `supporter-${i}`,
            text: s.description,
            mode: "translate" as const,
        }));

        processCopy(items, language, variationSeed)
            .then((processed) => {
                const translated = COMMUNITY_PAGE.supportersList.map(
                    (s, i) => ({
                        ...s,
                        description: processed[i]?.text || s.description,
                    }),
                );
                setTranslatedSupporters(translated);
            })
            .catch(console.error);
    }, [language, variationSeed]);

    return (
        <PageContainer>
            <PageCard>
                <Title>{pageCopy.title.text}</Title>
                <Body spacing="none" className="mb-8">
                    {pageCopy.subtitle.text}
                </Body>

                {/* Discord & GitHub Cards - Bold brutalist blocks */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-12">
                    {/* Discord Card */}
                    <SubCard>
                        <Heading variant="lime" as="h2">
                            {pageCopy.discordTitle.text}
                        </Heading>
                        <div className="font-body text-sm text-text-body-secondary mb-6">
                            {pageCopy.discordSubtitle.text}
                        </div>
                        <div className="flex flex-col sm:flex-row gap-2">
                            <Button
                                as="a"
                                href={SOCIAL_LINKS.discord.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                variant="primary"
                                size="default"
                            >
                                {pageCopy.joinDiscordButton.text}
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
                                {pageCopy.pollenBetaButton.text}
                                <ExternalLinkIcon className="w-3 h-3 text-text-body-main" />
                            </Button>
                        </div>
                    </SubCard>

                    {/* GitHub Card */}
                    <SubCard>
                        <Heading variant="rose" as="h2">
                            {pageCopy.githubTitle.text}
                        </Heading>
                        <div className="font-body text-sm text-text-body-secondary mb-6">
                            {pageCopy.githubSubtitle.text}
                        </div>
                        <div className="flex flex-wrap gap-2">
                            <Button
                                as="a"
                                href={SOCIAL_LINKS.github.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                variant="primary"
                                size="default"
                            >
                                {pageCopy.starContributeButton.text}
                                <ExternalLinkIcon className="w-3 h-3 stroke-text-highlight" />
                            </Button>
                            <Button
                                as="a"
                                href={LINKS.githubSubmitApp}
                                target="_blank"
                                rel="noopener noreferrer"
                                variant="secondary"
                                size="default"
                            >
                                {pageCopy.submitAppButton.text}
                                <ExternalLinkIcon className="w-3 h-3 text-text-body-main" />
                            </Button>
                        </div>
                    </SubCard>
                </div>

                {/* Divider */}
                <Divider />

                {/* Voting Section */}
                <div className="mb-12">
                    <Heading variant="section">
                        {pageCopy.votingTitle?.text || "Have Your Say"}
                    </Heading>
                    <Body size="sm" spacing="comfortable">
                        {pageCopy.votingSubtitle?.text ||
                            "We build what the community wants. Vote on what matters to you:"}
                    </Body>
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
                                            👍 {issue.votes}
                                        </span>
                                    </div>
                                    <p className="font-headline text-sm font-black text-text-body-main">
                                        {issue.title}
                                    </p>
                                </div>
                            </a>
                        ))}
                    </div>
                </div>

                {/* Divider */}
                <Divider />

                {/* Top Contributors Component */}
                <TopContributors />

                {/* News Section */}
                <NewsSection limit={15} title={pageCopy.newsTitle?.text} />

                {/* Supporters Section */}
                <div>
                    <Heading variant="section">
                        {pageCopy.supportersTitle.text}
                    </Heading>
                    <Body size="sm" spacing="comfortable">
                        {pageCopy.supportersSubtitle.text}
                    </Body>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                        {translatedSupporters.map((supporter) => (
                            <a
                                key={supporter.name}
                                href={supporter.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="group flex flex-col items-center text-center hover:opacity-70 transition-opacity"
                            >
                                <div className="w-16 h-16 mb-2 overflow-hidden">
                                    <ImageGenerator
                                        key={`${supporter.name}-logo`}
                                        prompt={`${COMMUNITY_PAGE.supporterLogoPrompt} ${supporter.name}. ${supporter.description}`}
                                        width={200}
                                        height={200}
                                        seed={COMMUNITY_PAGE.supporterLogoSeed}
                                        model={
                                            COMMUNITY_PAGE.supporterLogoModel
                                        }
                                        alt={supporter.name}
                                        className="w-full h-full object-contain"
                                    />
                                </div>
                                <p className="font-headline text-xs font-black text-text-body-main mb-1 leading-tight">
                                    {supporter.name}
                                </p>
                                <p className="font-body text-[10px] text-text-body-tertiary leading-tight line-clamp-2">
                                    {supporter.description}
                                </p>
                            </a>
                        ))}
                    </div>
                </div>
            </PageCard>
        </PageContainer>
    );
}
