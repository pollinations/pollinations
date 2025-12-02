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
import { useNews } from "../../hooks/useNews";
import ReactMarkdown from "react-markdown";

export default function CommunityPage() {
    const { presetCopy } = useTheme();
    const pageCopy = presetCopy.COMMUNITY_PAGE;
    const { news, loading: newsLoading } = useNews(COMMUNITY_PAGE.newsFilePath);

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

                {/* News Section */}
                {!newsLoading && news.length > 0 && (
                    <>
                        <Heading variant="section">
                            {pageCopy.newsTitle.text}
                        </Heading>
                        <div className="mb-12 space-y-3">
                            {news.map((item) => {
                                // Remove date from content for display
                                const contentWithoutDate = item.content.replace(
                                    /\*\*\d{4}-\d{2}-\d{2}\*\*:?\s*/,
                                    ""
                                );

                                return (
                                    <div
                                        key={item.id}
                                        className="bg-input-background p-3 border-l-2 border-border-highlight"
                                    >
                                        {item.date && (
                                            <span className="inline-block bg-button-primary-bg text-text-on-color px-2 py-0.5 font-mono text-xs font-black mb-2">
                                                {item.date}
                                            </span>
                                        )}
                                        <div className="font-body text-sm text-text-body-secondary leading-relaxed">
                                            <ReactMarkdown
                                                components={{
                                                    a: ({ node, ...props }) => (
                                                        <a
                                                            {...props}
                                                            className="text-text-brand hover:underline font-bold"
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                        />
                                                    ),
                                                    code: ({
                                                        node,
                                                        className,
                                                        children,
                                                        ...props
                                                    }: any) => {
                                                        const match =
                                                            /language-(\w+)/.exec(
                                                                className || ""
                                                            );
                                                        const isInline =
                                                            !match &&
                                                            !String(
                                                                children
                                                            ).includes("\n");
                                                        return isInline ? (
                                                            <code
                                                                {...props}
                                                                className="bg-input-background px-1 py-0.5 font-mono text-xs"
                                                            >
                                                                {children}
                                                            </code>
                                                        ) : (
                                                            <code
                                                                {...props}
                                                                className={
                                                                    className
                                                                }
                                                            >
                                                                {children}
                                                            </code>
                                                        );
                                                    },
                                                    p: ({ node, ...props }) => (
                                                        <p
                                                            {...props}
                                                            className="mb-0"
                                                        />
                                                    ),
                                                }}
                                            >
                                                {contentWithoutDate}
                                            </ReactMarkdown>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                        {/* Divider */}
                        <Divider />
                    </>
                )}

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
