import { TextGenerator } from "../components/TextGenerator";
import { ImageGenerator } from "../components/ImageGenerator";
import { SOCIAL_LINKS } from "../config/socialLinksList";
import { Button } from "../components/ui/button";
import { ExternalLinkIcon } from "../icons/ExternalLinkIcon";
import { Title, Heading, Body } from "../components/ui/typography";
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
        <div className="w-full px-4 pb-12">
            <div className="max-w-4xl mx-auto">
                {/* One Big Card containing everything */}
                <div className="bg-offwhite/90 border-r-4 border-b-4 border-rose shadow-rose-lg p-6 md:p-8">
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
                        <div className="bg-offblack/5 p-6">
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
                                <ExternalLinkIcon stroke="#ecf874" />
                            </Button>
                        </div>

                        {/* GitHub Card */}
                        <div className="bg-offblack/5 p-6">
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
                                <ExternalLinkIcon stroke="#ecf874" />
                            </Button>
                        </div>
                    </div>

                    {/* Divider */}
                    <div className="my-12 border-t-2 border-offblack/10" />

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
                </div>
            </div>
        </div>
    );
}

export default CommunityPage;
