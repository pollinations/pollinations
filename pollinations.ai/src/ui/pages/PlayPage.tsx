import { useState, useMemo, useEffect } from "react";
import { Title, Body } from "../components/ui/typography";
import { PageCard } from "../components/ui/page-card";
import { PageContainer } from "../components/ui/page-container";
import { Button } from "../components/ui/button";
import { ImageFeed } from "../components/play/ImageFeed";
import { PlayGenerator } from "../components/play/PlayGenerator";
import { ModelSelector } from "../components/play/ModelSelector";
import { useModelList } from "../../hooks/useModelList";
import { useTheme } from "../contexts/ThemeContext";
import { ImageIcon } from "../assets/ImageIcon";
import { TextIcon } from "../assets/TextIcon";

/**
 * PlayPage - Main playground page
 * Allows switching between Create (generation) and Watch (feed) views
 * Model selection is at the top level, independent of view state
 */
function PlayPage() {
    const [view, setView] = useState("play"); // "play" or "feed"
    const [feedType, setFeedType] = useState<"image" | "text">("image"); // Feed type toggle
    const [selectedModel, setSelectedModel] = useState("flux"); // Shared model state
    const [prompt, setPrompt] = useState(""); // Shared prompt state
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



    // --- Text Feed State ---
    // Fetched from SSE stream at https://text.pollinations.ai/feed
    const [textFeedPrompt, setTextFeedPrompt] = useState("");
    const [textFeedResponse, setTextFeedResponse] = useState("");
    const [feedLoading, setFeedLoading] = useState(false);
    const [feedError, setFeedError] = useState<string | null>(null);

    // SSE connection for text feed
    useEffect(() => {
        if (view !== "feed" || feedType !== "text") {
            return;
        }

        setFeedLoading(true);
        setFeedError(null);

        const eventSource = new EventSource(
            "https://text.pollinations.ai/feed"
        );

        eventSource.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);

                // Extract prompt from parameters.messages[0].content
                const prompt = data.parameters?.messages?.[0]?.content || "";
                setTextFeedPrompt(prompt);

                // Extract response - it's a JSON string that needs parsing
                const responseStr = data.response;
                setTextFeedResponse(responseStr);

                setFeedLoading(false);
            } catch (err) {
                console.error("Error parsing SSE data:", err);
                setFeedError("Failed to parse feed data");
            }
        };

        eventSource.onerror = () => {
            setFeedError("Connection error. Retrying...");
            eventSource.close();
        };

        return () => {
            eventSource.close();
        };
    }, [view, feedType]);

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

                {view === "feed" && (
                    <div className="flex gap-2 mb-6">
                        <Button
                            variant="toggle"
                            data-active={feedType === "image"}
                            onClick={() => setFeedType("image")}
                            title="Image Feed"
                            className="p-2"
                        >
                            <ImageIcon className="w-5 h-5" />
                        </Button>
                        <Button
                            variant="toggle"
                            data-active={feedType === "text"}
                            onClick={() => setFeedType("text")}
                            title="Text Feed"
                            className="p-2"
                        >
                            <TextIcon className="w-5 h-5" />
                        </Button>
                    </div>
                )}

                {/* Content: Play Interface or Feed */}
                {view === "play" ? (
                    <div className="flex flex-col gap-4">
                        {/* Prompt Input with Placeholder */}
                        <div className="flex flex-col gap-2">
                            <textarea
                                value={prompt}
                                onChange={(e) => setPrompt(e.target.value)}
                                placeholder={
                                    selectedModel.startsWith("flux") ||
                                    selectedModel.startsWith("dall") ||
                                    selectedModel.startsWith("midjourney")
                                        ? pageCopy.imagePlaceholder.text
                                        : pageCopy.textPlaceholder.text
                                }
                                className="min-h-[100px] p-3 border border-border rounded bg-transparent font-bold text-[#fff] focus:outline-none focus:ring-2 focus:ring-primary resize-none"
                            />
                        </div>
                        <PlayGenerator
                            selectedModel={selectedModel}
                            prompt={prompt}
                            onPromptChange={setPrompt}
                            imageModels={imageModels}
                            textModels={textModels}
                        />
                    </div>
                ) : feedType === "text" ? (
                    <div className="flex flex-col gap-4">
                        {feedLoading && (
                            <div className="text-center text-sm text-muted-foreground py-4">
                                Connecting to feed...
                            </div>
                        )}
                        {feedError && (
                            <div className="text-center text-sm text-red-500 py-4">
                                {feedError}
                            </div>
                        )}
                        {!feedLoading && textFeedPrompt && (
                            <>
                                {/* Top: Prompt */}
                                <div className="bg-muted p-4 rounded text-xs max-h-[100px]">
                                    <span className="block mb-2 font-bold text-[#ffc]">
                                        Prompt:
                                    </span>
                                    <div className="whitespace-pre-wrap break-words max-h-48 overflow-y-auto text-[#fff]">
                                        {textFeedPrompt.slice(0, 100)}
                                        {textFeedPrompt.length > 100 ? "..." : ""}
                                    </div>
                                </div>
                                {/* Bottom: Response */}
                                <div className="bg-muted p-4 rounded text-xs max-h-[100px]">
                                    <span className="block mb-2 font-bold text-[#ffc]">
                                        Response:
                                    </span>
                                    <div className="whitespace-pre-wrap break-words max-h-48 overflow-y-auto text-[#fff]">
                                        {textFeedResponse.slice(0, 100)}
                                        {textFeedResponse.length > 100 ? "..." : ""}
                                    </div>
                                </div>
                            </>
                        )}
                    </div>
                ) : (
                    <ImageFeed
                        selectedModel={selectedModel}
                        onFeedPromptChange={() => {}}
                        imageModels={imageModels}
                        textModels={textModels}
                        feedType={feedType}
                    />
                )}
            </PageCard>
        </PageContainer>
    );
}

export default PlayPage;
