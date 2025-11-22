import { useState, useMemo } from "react";
import { Title, Body } from "../components/ui/typography";
import { PageCard } from "../components/ui/page-card";
import { PageContainer } from "../components/ui/page-container";
import { TextGenerator } from "../components/TextGenerator";
import { PLAY_PAGE } from "../../content";
import { ImageFeed } from "../components/play/ImageFeed";
import { PlayGenerator } from "../components/play/PlayGenerator";
import { ModelSelector } from "../components/play/ModelSelector";
import { useModelList } from "../../hooks/useModelList";

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
    const { imageModels, textModels } = useModelList();

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
            <PageCard>
                {/* Title with toggle */}
                <div className="flex items-center gap-4 mb-8">
                    <Title spacing="none">
                        <TextGenerator
                            content={
                                view === "play"
                                    ? PLAY_PAGE.createTitle
                                    : PLAY_PAGE.watchTitle
                            }
                        />
                    </Title>
                    <button
                        type="button"
                        onClick={() =>
                            setView(view === "play" ? "feed" : "play")
                        }
                        className="font-body text-sm text-text-body-tertiary hover:text-text-body-main transition-colors"
                    >
                        <TextGenerator
                            content={
                                view === "play"
                                    ? PLAY_PAGE.toggleWatchOthers
                                    : PLAY_PAGE.toggleBackToPlay
                            }
                        />
                    </button>
                </div>

                {/* Description */}
                <Body className="mb-8">
                    <TextGenerator
                        content={
                            view === "play"
                                ? PLAY_PAGE.createDescription
                                : PLAY_PAGE.feedDescription
                        }
                    />
                </Body>

                {/* Model Selector - Independent of view state */}
                <ModelSelector
                    models={allModels}
                    selectedModel={selectedModel}
                    onSelectModel={setSelectedModel}
                />

                {/* Prompt - Independent of view state */}
                <div className="mb-6">
                    <label className="block font-headline text-text-body-main mb-2 uppercase text-xs tracking-wider font-black">
                        <TextGenerator content={PLAY_PAGE.promptLabel} />
                    </label>
                    {view === "play" ? (
                        <textarea
                            value={prompt}
                            onChange={(e) => setPrompt(e.target.value)}
                            placeholder={PLAY_PAGE.imagePlaceholder.text}
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
                    />
                ) : (
                    <ImageFeed
                        selectedModel={selectedModel}
                        onFeedPromptChange={setCurrentFeedPrompt}
                    />
                )}
            </PageCard>
        </PageContainer>
    );
}

export default PlayPage;
