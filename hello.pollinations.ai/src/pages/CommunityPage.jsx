import { TextGenerator } from "../components/TextGenerator";
import { ImageGenerator } from "../components/ImageGenerator";
import { SOCIAL_LINKS } from "../config/socialLinksList";
import { Button } from "../components/ui/button";
import { ExternalLinkIcon } from "../icons/ExternalLinkIcon";
import { Title, Heading, Body } from "../components/ui/typography";
import { Divider } from "../components/ui/divider";
import { PageCard } from "../components/ui/page-card";
import { PageContainer } from "../components/ui/page-container";
import { SubCard } from "../components/ui/sub-card";
import { Colors } from "../config/colors";
import { COMMUNITY_PAGE } from "../config/content";
import { useNews } from "../hooks/useNews";
import ReactMarkdown from "react-markdown";

function CommunityPage() {
    const { news, loading: newsLoading } = useNews(COMMUNITY_PAGE.newsFilePath);

    return (
        <PageContainer>
            <PageCard>
                <Title spacing="tight">
                    <TextGenerator content={COMMUNITY_PAGE.title} />
                </Title>
                <TextGenerator
                    content={COMMUNITY_PAGE.subtitle}
                    as="div"
                    className="font-body text-base text-offblack/80 leading-relaxed mb-6"
                />

                {/* Discord & GitHub Cards - Bold brutalist blocks */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-12">
                    {/* Discord Card */}
                    <SubCard>
                        <Heading variant="lime" as="h2">
                            <TextGenerator
                                content={COMMUNITY_PAGE.discordTitle}
                            />
                        </Heading>
                        <TextGenerator
                            content={COMMUNITY_PAGE.discordSubtitle}
                            as="div"
                            className="font-body text-sm text-offblack/70 mb-6"
                        />
                        <Button
                            as="a"
                            href={SOCIAL_LINKS.discord.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            variant="primary"
                            size="lg"
                        >
                            <TextGenerator
                                content={COMMUNITY_PAGE.joinDiscordButton}
                            />
                            <ExternalLinkIcon stroke={Colors.lime} />
                        </Button>
                    </SubCard>

                    {/* GitHub Card */}
                    <SubCard>
                        <Heading variant="rose" as="h2">
                            <TextGenerator
                                content={COMMUNITY_PAGE.githubTitle}
                            />
                        </Heading>
                        <TextGenerator
                            content={COMMUNITY_PAGE.githubSubtitle}
                            as="div"
                            className="font-body text-sm text-offblack/70 mb-6"
                        />
                        <Button
                            as="a"
                            href={SOCIAL_LINKS.github.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            variant="primary"
                            size="lg"
                        >
                            <TextGenerator
                                content={COMMUNITY_PAGE.contributeButton}
                            />
                            <ExternalLinkIcon stroke={Colors.lime} />
                        </Button>
                    </SubCard>
                </div>

                {/* Divider */}
                <Divider />

                {/* News Section */}
                {!newsLoading && news.length > 0 && (
                    <>
                        <Heading variant="section">
                            <TextGenerator content={COMMUNITY_PAGE.newsTitle} />
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
                                        className="bg-offblack/5 p-3 border-l-2 border-lime"
                                    >
                                        {item.date && (
                                            <span className="inline-block bg-offblack/90 text-lime px-2 py-0.5 font-mono text-xs font-black mb-2">
                                                {item.date}
                                            </span>
                                        )}
                                        <div className="font-body text-sm text-offblack/80 leading-relaxed">
                                            <ReactMarkdown
                                                components={{
                                                    a: ({ node, ...props }) => (
                                                        <a
                                                            {...props}
                                                            className="text-rose hover:underline font-bold"
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                        />
                                                    ),
                                                    code: ({
                                                        node,
                                                        inline,
                                                        ...props
                                                    }) =>
                                                        inline ? (
                                                            <code
                                                                {...props}
                                                                className="bg-offblack/10 px-1 py-0.5 font-mono text-xs"
                                                            />
                                                        ) : (
                                                            <code {...props} />
                                                        ),
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
                        <TextGenerator
                            content={COMMUNITY_PAGE.supportersTitle}
                        />
                    </Heading>
                    <Body size="sm" spacing="comfortable">
                        <TextGenerator
                            content={COMMUNITY_PAGE.supportersSubtitle}
                        />
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
                                <p className="font-headline text-xs font-black text-offblack mb-1 leading-tight">
                                    {supporter.name}
                                </p>
                                <p className="font-body text-[10px] text-offblack/50 leading-tight line-clamp-2">
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

export default CommunityPage;
