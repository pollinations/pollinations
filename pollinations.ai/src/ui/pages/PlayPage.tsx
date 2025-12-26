import { useMemo, useState } from "react";
import { getText } from "../../copy";
import { PLAY_PAGE } from "../../copy/content/play";
import { useAuth } from "../../hooks/useAuth";
import { useModelList } from "../../hooks/useModelList";
import { ImageFeed } from "../components/play/ImageFeed";
import { ModelSelector } from "../components/play/ModelSelector";
import { PlayGenerator } from "../components/play/PlayGenerator";
import { Button } from "../components/ui/button";
import { PageCard } from "../components/ui/page-card";
import { PageContainer } from "../components/ui/page-container";
import { Body, Title } from "../components/ui/typography";
import { useCopy } from "../contexts/CopyContext";

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
    const { processedCopy } = useCopy();

    // Use processed copy if available, fall back to static
    const pageCopy = (
        processedCopy?.createTitle ? processedCopy : PLAY_PAGE
    ) as typeof PLAY_PAGE;

    // Memoize combined models array
    const allModels = useMemo(
        () => [
            ...imageModels.map((m) => ({ ...m, type: "image" as const })),
            ...textModels.map((m) => ({ ...m, type: "text" as const })),
        ],
        [imageModels, textModels],
    );

    // Display prompt based on view
    const displayPrompt = view === "play" ? prompt : currentFeedPrompt;

    return (
        <PageContainer>
            <PageCard>
                {/* Title with toggle and login */}
                <div className="flex items-center justify-between mb-8">
                    <div className="flex items-center gap-4">
                        <Title spacing="none">
                            {view === "play"
                                ? getText(pageCopy.createTitle)
                                : getText(pageCopy.watchTitle)}
                        </Title>
                        <button
                            type="button"
                            onClick={() =>
                                setView(view === "play" ? "feed" : "play")
                            }
                            className="font-body text-sm text-text-body-tertiary hover:text-text-body-main transition-colors"
                        >
                            {view === "play"
                                ? getText(pageCopy.toggleWatchOthers)
                                : getText(pageCopy.toggleBackToPlay)}
                        </button>
                    </div>
                    {/* Login/Logout Button */}
                    <div className="flex items-center gap-2">
                        {isLoggedIn && (
                            <span className="font-mono text-xs text-text-body-tertiary bg-input-background px-2 py-1 rounded">
                                {apiKey.slice(0, 12)}...
                            </span>
                        )}
                        <Button
                            type="button"
                            onClick={isLoggedIn ? logout : login}
                            variant="secondary"
                            size="sm"
                        >
                            {isLoggedIn
                                ? getText(pageCopy.logoutButton)
                                : getText(pageCopy.loginButton)}
                        </Button>
                    </div>
                </div>

                {/* Description */}
                <Body className="mb-8">
                    {view === "play"
                        ? getText(pageCopy.createDescription)
                        : getText(pageCopy.feedDescription)}
                </Body>

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
                        {getText(pageCopy.promptLabel)}
                    </label>
                    {view === "play" ? (
                        <textarea
                            id="prompt-input"
                            value={prompt}
                            onChange={(e) => setPrompt(e.target.value)}
                            placeholder={getText(PLAY_PAGE.imagePlaceholder)}
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
