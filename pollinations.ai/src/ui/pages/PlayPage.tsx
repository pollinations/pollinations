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

/**
 * PlayPage - Main playground page
 * Allows switching between Create (generation) and Watch (feed) views
 * Model selection is at the top level, independent of view state
 */
function PlayPage() {
    const [view, setView] = useState("play"); // "play" or "feed"
    const [selectedModel, setSelectedModel] = useState("flux"); // Shared model state
    const [prompt, setPrompt] = useState(""); // Shared prompt state
    const [currentFeedPrompt, setCurrentFeedPrompt] = useState(""); // Prompt from feed

    // Auth state - dynamic API key based on login status
    const { apiKey, isLoggedIn, login, logout } = useAuth();
    const {
        imageModels,
        textModels,
        allowedImageModelIds,
        allowedTextModelIds,
    } = useModelList(apiKey);

    // Get translated copy
    const { copy: pageCopy, isTranslating } = usePageCopy(PLAY_PAGE);

    // Memoize combined models array
    const allModels = useMemo(
        () => [
            ...imageModels.map((m) => ({ ...m, type: "image" as const })),
            ...textModels.map((m) => ({ ...m, type: "text" as const })),
        ],
        [imageModels, textModels]
    );

    // Display prompt based on view
    const displayPrompt = view === "play" ? prompt : currentFeedPrompt;

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
                    <button
                        type="button"
                        onClick={() =>
                            setView(view === "play" ? "feed" : "play")
                        }
                        className="font-body text-sm text-text-body-tertiary hover:text-text-body-main transition-colors"
                    >
                        {view === "play"
                            ? pageCopy.toggleWatchOthers
                            : pageCopy.toggleBackToPlay}
                    </button>
                </div>

                {/* Description */}
                <Body className="mb-4">
                    {view === "play"
                        ? pageCopy.createDescription
                        : pageCopy.feedDescription}
                </Body>

                {/* Login CTA */}
                {!isLoggedIn ? (
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
                )}

                {/* Model Selector - Independent of view state */}
                <ModelSelector
                    models={allModels}
                    selectedModel={selectedModel}
                    onSelectModel={setSelectedModel}
                    allowedImageModelIds={allowedImageModelIds}
                    allowedTextModelIds={allowedTextModelIds}
                />

                {/* Prompt - Independent of view state */}
                <div className="mb-6">
                    <label
                        htmlFor="prompt-input"
                        className="block font-headline text-text-body-main mb-2 uppercase text-xs tracking-wider font-black"
                    >
                        {pageCopy.promptLabel}
                    </label>
                    {view === "play" ? (
                        <textarea
                            id="prompt-input"
                            value={prompt}
                            onChange={(e) => setPrompt(e.target.value)}
                            placeholder={PLAY_PAGE.imagePlaceholder}
                            className="w-full h-[7.5rem] p-4 bg-input-background text-text-body-main font-body resize-none focus:outline-none focus:bg-input-background hover:bg-input-background transition-colors scrollbar-hide placeholder:text-text-body-tertiary"
                        />
                    ) : (
                        <div className="w-full h-[7.5rem] p-4 bg-surface-elevated text-text-body-main font-body overflow-y-auto break-words scrollbar-hide">
                            {displayPrompt || "Waiting for content..."}
                        </div>
                    )}
                </div>

                {/* Content: Play Interface or Feed */}
                {view === "play" ? (
                    <PlayGenerator
                        selectedModel={selectedModel}
                        prompt={prompt}
                        onPromptChange={setPrompt}
                        imageModels={imageModels}
                        textModels={textModels}
                        apiKey={apiKey}
                    />
                ) : (
                    <ImageFeed
                        selectedModel={selectedModel}
                        onFeedPromptChange={setCurrentFeedPrompt}
                        imageModels={imageModels}
                        textModels={textModels}
                    />
                )}
            </PageCard>
        </PageContainer>
    );
}

export default PlayPage;
