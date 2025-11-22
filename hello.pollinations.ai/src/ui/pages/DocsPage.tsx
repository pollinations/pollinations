import { useState } from "react";
import { TextGenerator } from "../components/TextGenerator";
import { DOCS_PAGE } from "../../content";
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
    const [agentPromptCopied, setAgentPromptCopied] = useState(false);

    return (
        <PageContainer>
            <PageCard>
                {/* Title */}
                <Title>
                    <TextGenerator content={DOCS_PAGE.title} />
                </Title>

                {/* Intro */}
                <Body>
                    <TextGenerator content={DOCS_PAGE.intro} />
                </Body>
                <Body spacing="none" className="mb-8">
                    <TextGenerator content={DOCS_PAGE.apiReference} />
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
                        <TextGenerator content={DOCS_PAGE.fullApiDocsButton} />
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
                        <TextGenerator content={DOCS_PAGE.agentPromptButton} />
                        <CopyIcon />
                        {agentPromptCopied && (
                            <span className="absolute -top-5 left-0 font-headline text-xs font-black text-text-brand uppercase tracking-wider">
                                <TextGenerator
                                    content={DOCS_PAGE.copiedLabel}
                                />
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
