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
import {
    COMMUNITY_TITLE,
    COMMUNITY_SUBTITLE,
    COMMUNITY_DISCORD_SUBTITLE,
    COMMUNITY_GITHUB_SUBTITLE,
    SUPPORTER_TITLE,
    SUPPORTER_SUBTITLE,
    getSupporterLogoPrompt,
} from "../config/content";
import { SUPPORTERS } from "../config/supporters";

function CommunityPage() {
    return (
        <PageContainer>
            <PageCard>
                <Title spacing="tight">{COMMUNITY_TITLE}</Title>
                <TextGenerator
                    prompt={COMMUNITY_SUBTITLE.prompt}
                    seed={COMMUNITY_SUBTITLE.seed}
                    as="div"
                    className="font-body text-base text-offblack/80 leading-relaxed mb-6"
                />

                {/* Discord & GitHub Cards - Bold brutalist blocks */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-12">
                    {/* Discord Card */}
                    <SubCard>
                        <Heading variant="lime" as="h2">
                            Discord
                        </Heading>
                        <TextGenerator
                            prompt={COMMUNITY_DISCORD_SUBTITLE.prompt}
                            seed={COMMUNITY_DISCORD_SUBTITLE.seed}
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
                            Join Discord
                            <ExternalLinkIcon stroke={Colors.lime} />
                        </Button>
                    </SubCard>

                    {/* GitHub Card */}
                    <SubCard>
                        <Heading variant="rose" as="h2">
                            GitHub
                        </Heading>
                        <TextGenerator
                            prompt={COMMUNITY_GITHUB_SUBTITLE.prompt}
                            seed={COMMUNITY_GITHUB_SUBTITLE.seed}
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
                            Contribute
                            <ExternalLinkIcon stroke={Colors.lime} />
                        </Button>
                    </SubCard>
                </div>

                {/* Divider */}
                <Divider />

                {/* Supporters Section */}
                <div>
                    <Heading variant="section">{SUPPORTER_TITLE}</Heading>
                    <Body size="sm" spacing="comfortable">
                        {SUPPORTER_SUBTITLE}
                    </Body>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                        {SUPPORTERS.map((supporter) => (
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
                                        prompt={getSupporterLogoPrompt(
                                            supporter.name,
                                            supporter.description
                                        )}
                                        width={200}
                                        height={200}
                                        seed={1}
                                        model="nanobanana"
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
