import { useState } from "react";
import { TextGenerator } from "../components/TextGenerator";
import { DOCS_INTRO, DOCS_API_REFERENCE } from "../config/content";
import { CopyIcon } from "../icons/CopyIcon";
import { ExternalLinkIcon } from "../icons/ExternalLinkIcon";
import { Button } from "../components/ui/button";
import { Title } from "../components/ui/typography";
import { Divider } from "../components/ui/divider";
import { PageCard } from "../components/ui/page-card";
import { PageContainer } from "../components/ui/page-container";
import { AuthCard } from "../components/docs/AuthCard";
import { ImageGenCard } from "../components/docs/ImageGenCard";
import { TextGenCard } from "../components/docs/TextGenCard";
import { ModelDiscoveryCard } from "../components/docs/ModelDiscoveryCard";
import { Colors } from "../config/colors";

function DocsPage() {
    const [agentPromptCopied, setAgentPromptCopied] = useState(false);

    return (
        <PageContainer>
            <PageCard>
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
                    <Button
                        as="a"
                        href="https://enter.pollinations.ai/api/docs"
                        target="_blank"
                        rel="noopener noreferrer"
                        variant="secondary"
                        size="lg"
                    >
                        Full API Docs
                        <ExternalLinkIcon stroke={Colors.black} />
                    </Button>
                    <Button
                        variant="primary"
                        size="lg"
                        className="relative"
                        onClick={() => {
                            const agentPrompt = `You can generate images using Pollinations API:\n\nGET https://image.pollinations.ai/prompt/{prompt}?model=flux&width=1024&height=1024`;
                            navigator.clipboard.writeText(agentPrompt);
                            setAgentPromptCopied(true);
                            setTimeout(() => setAgentPromptCopied(false), 2000);
                        }}
                    >
                        Agent Prompt
                        <CopyIcon />
                        {agentPromptCopied && (
                            <span className="absolute -top-5 left-0 font-headline text-xs font-black text-rose uppercase tracking-wider">
                                Copied!
                            </span>
                        )}
                    </Button>
                </div>

                {/* Divider */}
                <Divider />

                {/* Image Generation */}
                <ImageGenCard />

                {/* Divider */}
                <Divider />

                {/* Text Generation */}
                <TextGenCard />

                {/* Divider */}
                <Divider />

                {/* Model Discovery */}
                <ModelDiscoveryCard />

                {/* Divider */}
                <Divider />

                {/* Authentication */}
                <AuthCard />
            </PageCard>
        </PageContainer>
    );
}

export default DocsPage;
