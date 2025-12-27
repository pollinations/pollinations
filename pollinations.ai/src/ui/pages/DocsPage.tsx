import { useEffect, useState } from "react";
import { DOCS_PAGE } from "../../copy/content/docs";
import { usePageCopy } from "../../hooks/usePageCopy";
import { CopyIcon } from "../assets/CopyIcon";
import { ExternalLinkIcon } from "../assets/ExternalLinkIcon";
import { AuthCard } from "../components/docs/AuthCard";
import { ImageGenCard } from "../components/docs/ImageGenCard";
import { ModelDiscoveryCard } from "../components/docs/ModelDiscoveryCard";
import { TextGenCard } from "../components/docs/TextGenCard";
import { Button } from "../components/ui/button";
import { Divider } from "../components/ui/divider";
import { PageCard } from "../components/ui/page-card";
import { PageContainer } from "../components/ui/page-container";
import { Body, Title } from "../components/ui/typography";

function DocsPage() {
    const { copy: pageCopy, isTranslating } = usePageCopy(DOCS_PAGE);
    const [agentPromptCopied, setAgentPromptCopied] = useState(false);
    const [agentPrompt, setAgentPrompt] = useState("");

    useEffect(() => {
        fetch(
            "https://raw.githubusercontent.com/pollinations/pollinations/production/APIDOCS.md",
        )
            .then((res) => res.text())
            .then(setAgentPrompt)
            .catch(console.error);
    }, []);

    return (
        <PageContainer>
            <PageCard isTranslating={isTranslating}>
                {/* Title */}
                <Title>{pageCopy.title}</Title>

                {/* Intro */}
                <Body>{pageCopy.intro}</Body>
                <Body spacing="none" className="mb-8">
                    {pageCopy.apiReference}
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
                        {pageCopy.fullApiDocsButton}
                        <ExternalLinkIcon className="w-4 h-4 text-text-body-main" />
                    </Button>
                    <Button
                        variant="primary"
                        size="lg"
                        className="relative"
                        onClick={() => {
                            navigator.clipboard.writeText(agentPrompt);
                            setAgentPromptCopied(true);
                            setTimeout(() => setAgentPromptCopied(false), 2000);
                        }}
                    >
                        {pageCopy.agentPromptButton}
                        <CopyIcon />
                        {agentPromptCopied && (
                            <span className="absolute -top-5 left-0 font-headline text-xs font-black text-text-brand uppercase tracking-wider">
                                {pageCopy.copiedLabel}
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
