import { useMemo, useState } from "react";
import { PLAY_PAGE } from "../../copy/content/play";
import { useAuth } from "../../hooks/useAuth";
import { useModelList } from "../../hooks/useModelList";
import { usePageCopy } from "../../hooks/usePageCopy";
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
    const { apiKey, isLoggedIn, login, logout } = useAuth();
    const {
        imageModels,
        textModels,
        allowedImageModelIds,
        allowedTextModelIds,
    } = useModelList(apiKey);

    // Get translated copy
    const { copy: pageCopy, isTranslating } = usePageCopy(PLAY_PAGE);

    const allModels = useMemo(
        () => [
            ...imageModels.map((m) => ({ ...m, type: "image" as const })),
            ...textModels.map((m) => ({ ...m, type: "text" as const })),
        ],
        [imageModels, textModels],
    );

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

                {/* Description */}
                <Body className="mb-4">
                    {view === "play"
                        ? pageCopy.createDescription
                        : pageCopy.feedDescription}
                </Body>

                {/* Login CTA - only show in Create view */}
                {view === "play" &&
                    (!isLoggedIn ? (
                        <div className="flex items-center gap-4 p-4 mb-8 bg-surface-card rounded-sub-card border-l-4 border-border-highlight">
                            <div className="flex-1">
                                <p className="font-body text-sm text-text-body-secondary">
                                    {pageCopy.loginCtaText}{" "}
                                    <span className="text-text-brand font-medium">
                                        {pageCopy.loginCtaLink}
                                    </span>
                                </p>
                            </div>
                            <Button
                                type="button"
                                onClick={login}
                                variant="primary"
                                size="sm"
                            >
                                {pageCopy.loginButton}
                            </Button>
                        </div>
                    ) : (
                        <div className="flex items-center gap-6 p-5 mb-8 bg-surface-card rounded-sub-card border-l-4 border-border-brand">
                            <div className="flex-1 flex items-center gap-4 flex-wrap">
                                <p className="font-headline text-sm font-black text-text-body-main">
                                    {pageCopy.loggedInCtaText}
                                </p>
                                <span className="font-mono text-xs bg-input-background text-text-brand px-3 py-1.5 rounded border border-border-main">
                                    🔑 {apiKey.slice(0, 14)}...
                                </span>
                            </div>
                            <Button
                                type="button"
                                onClick={logout}
                                variant="secondary"
                                size="sm"
                            >
                                {pageCopy.logoutButton}
                            </Button>
                        </div>
                    ))}

                {view === "play" && (
                    <ModelSelector
                        models={allModels}
                        selectedModel={selectedModel}
                        onSelectModel={setSelectedModel}
                        allowedImageModelIds={allowedImageModelIds}
                        allowedTextModelIds={allowedTextModelIds}
                    />
                )}

                {view === "play" ? (
                    <div className="flex flex-col gap-4">
                        <div className="flex flex-col gap-2">
                            <textarea
                                value={prompt}
                                onChange={(e) => setPrompt(e.target.value)}
                                placeholder={pageCopy.imagePlaceholder}
                                className="min-h-[100px] p-3 border border-border rounded bg-transparent font-bold text-[#fff] focus:outline-none focus:ring-2 focus:ring-primary resize-none"
                            />
                        </div>
                        <PlayGenerator
                            selectedModel={selectedModel}
                            prompt={prompt}
                            onPromptChange={setPrompt}
                            imageModels={imageModels}
                            textModels={textModels}
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
