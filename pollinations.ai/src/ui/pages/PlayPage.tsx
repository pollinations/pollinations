import { useState, useMemo } from "react";
import { Title, Body } from "../components/ui/typography";
import { PageCard } from "../components/ui/page-card";
import { PageContainer } from "../components/ui/page-container";
import { Button } from "../components/ui/button";
import { ImageFeed } from "../components/play/ImageFeed";
import { PlayGenerator } from "../components/play/PlayGenerator";
import { ModelSelector } from "../components/play/ModelSelector";
import { useModelList } from "../../hooks/useModelList";
import { useTheme } from "../contexts/ThemeContext";

/**
 * PlayPage - Main playground page
 * Allows switching between Create (generation) and Watch (feed) views
 * Model selection is at the top level, independent of view state
 */
function PlayPage() {
    const [view, setView] = useState("play"); // "play" or "feed"
    const [selectedModel, setSelectedModel] = useState("flux"); // Shared model state
    const [prompt, setPrompt] = useState(""); // Shared prompt state
    const [currentFeedPrompt, setCurrentFeedPrompt] = useState(""); // Feed prompt state
    const { imageModels, textModels } = useModelList();

    // Get page copy from preset
    const { presetCopy } = useTheme();
    const pageCopy = presetCopy.PLAY_PAGE;

    // Memoize combined models array
    const allModels = useMemo(
        () => [
            ...imageModels.map((m) => ({ ...m, type: "image" as const })),
            ...textModels.map((m) => ({ ...m, type: "text" as const })),
        ],
        [imageModels, textModels]
    );



    return (
        <PageContainer>
            <PageCard>
                {/* Title with toggle button */}
                <div className="flex items-center justify-between gap-4 mb-8">
                    <Title spacing="none">
                        {view === "play"
                            ? pageCopy.createTitle.text
                            : pageCopy.watchTitle.text}
                    </Title>
                    <Button
                        variant="secondary"
                        size="sm"
                        onClick={() =>
                            setView(view === "play" ? "feed" : "play")
                        }
                    >
                        {view === "play"
                            ? pageCopy.toggleWatchOthers.text
                            : pageCopy.toggleBackToPlay.text}
                    </Button>
                </div>

                {/* Description */}
                <Body className="mb-8">
                    {view === "play"
                        ? pageCopy.createDescription.text
                        : pageCopy.feedDescription.text}
                </Body>


                {view === "play" && (
                    <ModelSelector
                        models={allModels}
                        selectedModel={selectedModel}
                        onSelectModel={setSelectedModel}
                    />
                )}


                {/* Content: Play Interface or Feed */}
                {view === "play" ? (
                    <PlayGenerator
                        selectedModel={selectedModel}
                        prompt={prompt}
                        onPromptChange={setPrompt}
                        imageModels={imageModels}
                        textModels={textModels}
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
