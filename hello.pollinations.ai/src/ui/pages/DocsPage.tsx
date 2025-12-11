import { useState } from "react";
import { useTheme } from "../contexts/ThemeContext";
import { CopyIcon } from "../assets/CopyIcon";
import { ExternalLinkIcon } from "../assets/ExternalLinkIcon";
import { Button } from "../components/ui/button";
import { Title, Body } from "../components/ui/typography";
import { Divider } from "../components/ui/divider";
import { PageCard } from "../components/ui/page-card";
import { PageContainer } from "../components/ui/page-container";
import { AuthCard } from "../components/docs/AuthCard";
import { ImageGenCard } from "../components/docs/ImageGenCard";
import { TextGenCard } from "../components/docs/TextGenCard";
import { ModelDiscoveryCard } from "../components/docs/ModelDiscoveryCard";

function DocsPage() {
    const { presetCopy } = useTheme();
    const pageCopy = presetCopy.DOCS_PAGE;
    const [agentPromptCopied, setAgentPromptCopied] = useState(false);

    return (
        <PageContainer>
            <PageCard>
                {/* Title */}
                <Title>{pageCopy.title.text}</Title>

                {/* Intro */}
                <Body>{pageCopy.intro.text}</Body>
                <Body spacing="none" className="mb-8">
                    {pageCopy.apiReference.text}
                </Body>
                <div className="flex flex-wrap gap-3 mb-12">
                    <Button
                        as="a"
                        href="https://enter.pollinations.ai/api/docs"
                        target="_blank"
                        rel="noopener noreferrer"
                        variant="secondary"
                        size="lg"
                    >
                        {pageCopy.fullApiDocsButton.text}
                        <ExternalLinkIcon className="w-4 h-4 text-text-body-main" />
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
                        {pageCopy.agentPromptButton.text}
                        <CopyIcon />
                        {agentPromptCopied && (
                            <span className="absolute -top-5 left-0 font-headline text-xs font-black text-text-brand uppercase tracking-wider">
                                {pageCopy.copiedLabel.text}
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
