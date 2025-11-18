import { useState } from "react";
import { TextGenerator } from "../components/TextGenerator";
import { DOCS_INTRO, DOCS_API_REFERENCE } from "../config/content";
import { CopyIcon } from "../icons/CopyIcon";
import { Title } from "../components/ui/typography";
import { AuthCard } from "../components/docs/AuthCard";
import { ImageGenCard } from "../components/docs/ImageGenCard";
import { TextGenCard } from "../components/docs/TextGenCard";
import { ModelDiscoveryCard } from "../components/docs/ModelDiscoveryCard";

function DocsPage() {
    const [agentPromptCopied, setAgentPromptCopied] = useState(false);

    return (
        <div className="w-full px-4 pb-12">
            <div className="max-w-4xl mx-auto">
                {/* One Big Card containing everything */}
                <div className="bg-offwhite/90 border-r-4 border-b-4 border-rose shadow-rose-lg p-6 md:p-8">
                    {/* Title */}
                    <Title spacing="comfortable">Integrate</Title>

                    {/* Intro */}
                    <TextGenerator
                        text={DOCS_INTRO.prompt}
                        seed={DOCS_INTRO.seed}
                        as="div"
                        className="font-body text-offblack/70 text-base leading-relaxed mb-4"
                    />
                    <TextGenerator
                        text={DOCS_API_REFERENCE.prompt}
                        seed={DOCS_API_REFERENCE.seed}
                        as="div"
                        className="font-body text-offblack/70 text-base leading-relaxed mb-6"
                    />
                    <div className="flex flex-wrap gap-3 mb-12">
                        <a
                            href="https://enter.pollinations.ai/api/docs"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-2 px-6 py-4 bg-lime/90 border-r-4 border-b-4 border-offblack shadow-black-md font-headline uppercase text-sm font-black hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-black-sm transition-all"
                        >
                            Full API Docs
                            <svg
                                className="w-3.5 h-3.5 stroke-offblack"
                                fill="none"
                                strokeWidth="2.5"
                                viewBox="0 0 12 12"
                            >
                                <path
                                    d="M1 11L11 1M11 1H4M11 1v7"
                                    strokeLinecap="square"
                                />
                            </svg>
                        </a>
                        <button
                            type="button"
                            onClick={() => {
                                // TODO: Replace with actual AGENTS.md content
                                const agentPrompt = `# Pollinations.AI Agent Prompt\n\nThis is a placeholder for the agent prompt content from AGENTS.md.\n\nThe full content will be added here soon.`;
                                navigator.clipboard.writeText(agentPrompt);
                                setAgentPromptCopied(true);
                                setTimeout(
                                    () => setAgentPromptCopied(false),
                                    2000
                                );
                            }}
                            className="inline-flex items-center gap-2 px-6 py-4 bg-offblack border-r-4 border-b-4 border-lime shadow-lime-md font-headline uppercase text-sm font-black text-offwhite hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-lime-sm transition-all cursor-pointer relative"
                        >
                            Agent Prompt
                            <svg
                                className="w-4 h-4 stroke-offwhite"
                                fill="none"
                                strokeWidth="2"
                                viewBox="0 0 16 16"
                            >
                                <rect
                                    x="5"
                                    y="5"
                                    width="9"
                                    height="9"
                                    strokeLinecap="square"
                                />
                                <path
                                    d="M11 5V3H3v8h2"
                                    strokeLinecap="square"
                                />
                            </svg>
                            {agentPromptCopied && (
                                <span className="absolute -top-5 left-0 font-headline text-xs font-black text-rose uppercase tracking-wider">
                                    Copied!
                                </span>
                            )}
                        </button>
                    </div>

                    {/* Divider */}
                    <div className="my-12 border-t-2 border-offblack/10" />

                    {/* Image Generation */}
                    <ImageGenCard />

                    {/* Divider */}
                    <div className="my-12 border-t-2 border-offblack/10" />

                    {/* Text Generation */}
                    <TextGenCard />

                    {/* Divider */}
                    <div className="my-12 border-t-2 border-offblack/10" />

                    {/* Model Discovery */}
                    <ModelDiscoveryCard />

                    {/* Divider */}
                    <div className="my-12 border-t-2 border-offblack/10" />

                    {/* Authentication */}
                    <AuthCard />
                </div>
            </div>
        </div>
    );
}

export default DocsPage;
