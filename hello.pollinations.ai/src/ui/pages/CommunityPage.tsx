import { useTheme } from "../contexts/ThemeContext";
import { COMMUNITY_PAGE } from "../../theme";
import { ImageGenerator } from "../components/ImageGenerator";
import { SOCIAL_LINKS } from "../../theme/copy/socialLinks";
import { Button } from "../components/ui/button";
import { ExternalLinkIcon } from "../assets/ExternalLinkIcon";
import { Title, Heading, Body } from "../components/ui/typography";
import { Divider } from "../components/ui/divider";
import { PageCard } from "../components/ui/page-card";
import { PageContainer } from "../components/ui/page-container";
import { SubCard } from "../components/ui/sub-card";
import { NewsSection } from "../components/NewsSection";
import { TopContributors } from "../components/TopContributors";

interface VotingIssue {
    emoji: string;
    title: string;
    url: string;
    votes: number;
}

export default function CommunityPage() {
    const { presetCopy } = useTheme();
    const pageCopy = presetCopy.COMMUNITY_PAGE;

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
                        <Button
                            as="a"
                            href={SOCIAL_LINKS.discord.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            variant="primary"
                            size="lg"
                        >
                            {pageCopy.joinDiscordButton.text}
                            <ExternalLinkIcon className="w-4 h-4 stroke-text-highlight" />
                        </Button>
                    </SubCard>

                    {/* GitHub Card */}
                    <SubCard>
                        <Heading variant="rose" as="h2">
                            {pageCopy.githubTitle.text}
                        </Heading>
                        <div className="font-body text-sm text-text-body-secondary mb-6">
                            {pageCopy.githubSubtitle.text}
                        </div>
                        <Button
                            as="a"
                            href={SOCIAL_LINKS.github.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            variant="primary"
                            size="lg"
                        >
                            {pageCopy.contributeButton.text}
                            <ExternalLinkIcon className="w-4 h-4 stroke-text-highlight" />
                        </Button>
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
                    <div className="space-y-3">
                        {(COMMUNITY_PAGE.votingIssues as VotingIssue[])?.map(
                            (issue) => (
                                <a
                                    key={issue.url}
                                    href={issue.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="block bg-input-background p-4 border-l-2 border-border-brand hover:border-border-highlight transition-colors"
                                >
                                    <div className="flex items-center gap-3">
                                        <span className="text-2xl">
                                            {issue.emoji}
                                        </span>
                                        <div className="flex-1">
                                            <p className="font-headline text-sm font-black text-text-body-main">
                                                {issue.title}
                                            </p>
                                        </div>
                                        <div className="flex items-center gap-1 text-text-caption">
                                            <span className="font-mono text-xs">
                                                👍 {issue.votes}
                                            </span>
                                        </div>
                                    </div>
                                </a>
                            )
                        )}
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
                        {COMMUNITY_PAGE.supportersList.map((supporter) => (
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
