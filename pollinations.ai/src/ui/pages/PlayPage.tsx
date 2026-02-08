import { useMemo, useState } from "react";
import { PLAY_PAGE } from "../../copy/content/play";
import { useAuth } from "../../hooks/useAuth";
import { useModelList } from "../../hooks/useModelList";
import { usePageCopy } from "../../hooks/usePageCopy";
import { ExternalLinkIcon } from "../assets/ExternalLinkIcon";
import { ImageFeed } from "../components/play/ImageFeed";
import { ModelSelector } from "../components/play/ModelSelector";
import { PlayGenerator } from "../components/play/PlayGenerator";
import { Button } from "../components/ui/button";
import { PageCard } from "../components/ui/page-card";
import { PageContainer } from "../components/ui/page-container";
import { Body, Title } from "../components/ui/typography";

function PlayPage() {
    const [view, setView] = useState("play");
    const [selectedModel, setSelectedModel] = useState("flux");
    const [prompt, setPrompt] = useState("");
    const { apiKey, isLoggedIn, login } = useAuth();
    const {
        imageModels,
        textModels,
        audioModels,
        allModels: registryModels,
        allowedImageModelIds,
        allowedTextModelIds,
        allowedAudioModelIds,
    } = useModelList(apiKey);

    // Get translated copy
    const { copy: pageCopy, isTranslating } = usePageCopy(PLAY_PAGE);

    const allModels = useMemo(() => {
        const typeOrder: Record<string, number> = {
            image: 0,
            video: 1,
            text: 2,
            audio: 3,
        };
        const effectiveType = (m: (typeof registryModels)[0]) =>
            m.hasVideoOutput
                ? "video"
                : m.hasAudioOutput || m.type === "audio"
                  ? "audio"
                  : m.type;
        return [...registryModels].sort(
            (a, b) =>
                (typeOrder[effectiveType(a)] ?? 99) -
                (typeOrder[effectiveType(b)] ?? 99),
        );
    }, [registryModels]);

    return (
        <PageContainer>
            <PageCard isTranslating={isTranslating}>
                {/* Title with toggle */}
                <div className="flex items-center gap-4 mb-8">
                    <Title spacing="none">
                        {view === "play"
                            ? pageCopy.createTitle
                            : pageCopy.watchTitle}
                    </Title>
                    <Button
                        variant="secondary"
                        size="sm"
                        onClick={() =>
                            setView(view === "play" ? "feed" : "play")
                        }
                    >
                        {view === "play"
                            ? pageCopy.toggleWatchOthers
                            : pageCopy.toggleBackToPlay}
                    </Button>
                </div>

                {/* Description + Pricing */}
                {view === "play" ? (
                    <div className="mb-6">
                        <Body className="mb-3">
                            {pageCopy.createDescription}
                        </Body>
                        <Button
                            as="a"
                            href="https://enter.pollinations.ai"
                            target="_blank"
                            rel="noopener noreferrer"
                            variant="iconText"
                            className="inline-flex"
                        >
                            <span className="font-headline text-[10px] md:text-xs font-black uppercase tracking-wider text-text-body-main">
                                {pageCopy.pricingLinkText}
                            </span>
                            <ExternalLinkIcon className="w-3 h-3 md:w-4 md:h-4 text-text-brand" />
                        </Button>
                    </div>
                ) : (
                    <Body className="mb-4">{pageCopy.feedDescription}</Body>
                )}

                {/* Login CTA - only show in Create view when not logged in */}
                {view === "play" && !isLoggedIn && (
                    <div className="p-3 mb-6 bg-surface-card rounded-sub-card border-l-4 border-border-highlight">
                        <p className="font-body text-sm text-text-body-secondary">
                            <button
                                type="button"
                                onClick={login}
                                className="text-text-brand font-medium underline cursor-pointer bg-transparent border-none p-0"
                            >
                                {pageCopy.loginCtaLogin}
                            </button>{" "}
                            {pageCopy.loginCtaOr}{" "}
                            <a
                                href="https://enter.pollinations.ai"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-text-brand font-medium underline"
                            >
                                {pageCopy.loginCtaRegister}
                            </a>{" "}
                            {pageCopy.loginCtaSuffix}
                        </p>
                    </div>
                )}

                {view === "play" && (
                    <ModelSelector
                        models={allModels}
                        selectedModel={selectedModel}
                        onSelectModel={setSelectedModel}
                        allowedImageModelIds={allowedImageModelIds}
                        allowedTextModelIds={allowedTextModelIds}
                        allowedAudioModelIds={allowedAudioModelIds}
                    />
                )}

                {view === "play" ? (
                    <div className="flex flex-col gap-4">
                        <div className="flex flex-col gap-2">
                            <textarea
                                value={prompt}
                                onChange={(e) => setPrompt(e.target.value)}
                                placeholder={pageCopy.imagePlaceholder}
                                className="min-h-[100px] p-3 border border-border-main rounded bg-transparent font-bold text-text-body-main focus:outline-none focus:ring-2 focus:ring-border-brand resize-none"
                            />
                        </div>
                        <PlayGenerator
                            selectedModel={selectedModel}
                            prompt={prompt}
                            onPromptChange={setPrompt}
                            imageModels={imageModels}
                            textModels={textModels}
                            audioModels={audioModels}
                            apiKey={apiKey || ""}
                        />
                    </div>
                ) : (
                    <ImageFeed onFeedPromptChange={() => {}} />
                )}
            </PageCard>
        </PageContainer>
    );
}

export default PlayPage;
