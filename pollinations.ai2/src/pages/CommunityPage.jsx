import { TextGenerator } from "../components/TextGenerator";
import { ImageGenerator } from "../components/ImageGenerator";
import { Content } from "../components/Content";
import { SOCIAL_LINKS } from "../config/socialLinksList";
import {
    COMMUNITY_TITLE,
    COMMUNITY_SUBTITLE,
    COMMUNITY_DISCORD_SUBTITLE,
    COMMUNITY_GITHUB_SUBTITLE,
    SUPPORTER_TITLE,
    SUPPORTER_SUBTITLE,
    SUPPORTERS,
    getSupporterLogoPrompt,
} from "../config/content";

function CommunityPage() {
    return (
        <div className="w-full px-4">
            <div className="max-w-4xl mx-auto space-y-6">
                {/* Contribute Card */}
                <div className="bg-offwhite/90 border-r-4 border-b-4 border-rose shadow-[6px_6px_0px_0px_rgba(255,105,180,1)] p-6 md:p-8">
                    <h1 className="font-title text-4xl md:text-5xl font-black text-offblack mb-4">
                        {COMMUNITY_TITLE}
                    </h1>
                    <TextGenerator
                        prompt={COMMUNITY_SUBTITLE}
                        className="font-body text-base text-offblack/80 leading-relaxed mb-6"
                    />

                    {/* Discord & GitHub Cards - Bold brutalist blocks */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {/* Discord Card */}
                        <div className="bg-blue-500 p-5 hover:bg-blue-600 transition-colors">
                            <h2 className="font-headline text-xl font-black text-offwhite mb-3 uppercase tracking-wider">
                                💬 Discord
                            </h2>
                            <TextGenerator
                                prompt={COMMUNITY_DISCORD_SUBTITLE}
                                className="font-body text-sm text-offwhite/90 mb-4"
                            />
                            <a
                                href={SOCIAL_LINKS.discord.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-block px-4 py-2 bg-offwhite font-headline uppercase text-xs font-black text-blue-600 hover:bg-offwhite/90 transition-all"
                            >
                                Join Discord →
                            </a>
                        </div>

                        {/* GitHub Card */}
                        <div className="bg-offblack p-5 hover:bg-offblack/90 transition-colors">
                            <h2 className="font-headline text-xl font-black text-offwhite mb-3 uppercase tracking-wider">
                                🐙 GitHub
                            </h2>
                            <TextGenerator
                                prompt={COMMUNITY_GITHUB_SUBTITLE}
                                className="font-body text-sm text-offwhite/80 mb-4"
                            />
                            <a
                                href={SOCIAL_LINKS.github.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-block px-4 py-2 bg-offwhite font-headline uppercase text-xs font-black text-offblack hover:bg-offwhite/90 transition-all"
                            >
                                Contribute →
                            </a>
                        </div>
                    </div>
                </div>

                {/* Supporters Section */}
                <div className="bg-offwhite/90 border-r-4 border-b-4 border-offblack/30 shadow-[4px_4px_0px_0px_rgba(17,5,24,0.3)] p-6 md:p-8">
                    <h2 className="font-headline text-2xl font-black text-offblack mb-3 uppercase tracking-wider">
                        {SUPPORTER_TITLE}
                    </h2>
                    <Content
                        value={SUPPORTER_SUBTITLE}
                        as="p"
                        className="font-body text-sm text-offblack/70 mb-6"
                    />
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
                                        seed={supporter.name
                                            .split("")
                                            .reduce(
                                                (acc, char) =>
                                                    acc + char.charCodeAt(0),
                                                0
                                            )}
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
    );
}

export default CommunityPage;
