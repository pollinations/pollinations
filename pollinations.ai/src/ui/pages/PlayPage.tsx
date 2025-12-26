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

interface ModelHealth {
    model: string;
    event_type: string;
    provider: string;
    total_requests: number;
    status_2xx: number;
    total_errors: number;
    latency_p50_ms: number;
    latency_p95_ms: number;
    avg_latency_ms: number;
    last_request_at: string;
}

/**
 * PlayPage - Main playground page
 * Allows switching between Create (generation) and Watch (feed) views
 * Model selection is at the top level, independent of view state
 */
function PlayPage() {
    const [view, setView] = useState("play");
    const [feedType, setFeedType] = useState<"image" | "text">("image");
    const [selectedModel, setSelectedModel] = useState("flux");
    const [prompt, setPrompt] = useState("");
    const { imageModels, textModels } = useModelList();
    const { presetCopy } = useTheme();
    const pageCopy = presetCopy.PLAY_PAGE;

    const allModels = useMemo(
        () => [
            ...imageModels.map((m) => ({ ...m, type: "image" as const })),
            ...textModels.map((m) => ({ ...m, type: "text" as const })),
        ],
        [imageModels, textModels]
    );

    const [imageRequestsPerMin, setImageRequestsPerMin] = useState(0);
    const [textRequestsPerMin, setTextRequestsPerMin] = useState(0);
    const [textFeedPrompt, setTextFeedPrompt] = useState("");
    const [textFeedResponse, setTextFeedResponse] = useState("");
    const [feedLoading, setFeedLoading] = useState(false);
    const [feedError, setFeedError] = useState<string | null>(null);

    useEffect(() => {
        const fetchModelStats = async () => {
            try {
                const response = await fetch(
                    "https://api.europe-west2.gcp.tinybird.co/v0/pipes/model_health.json?token=p.eyJ1IjogImFjYTYzZjc5LThjNTYtNDhlNC05NWJjLWEyYmFjMTY0NmJkMyIsICJpZCI6ICJmZTRjODM1Ni1iOTYwLTQ0ZTYtODE1Mi1kY2UwYjc0YzExNjQiLCAiaG9zdCI6ICJnY3AtZXVyb3BlLXdlc3QyIn0.Wc49vYoVYI_xd4JSsH_Fe8mJk7Oc9hx0IIldwc1a44g"
                );
                const data = await response.json();

                if (data.data && Array.isArray(data.data)) {
                    const imageModelsData = data.data.filter(
                        (m: ModelHealth) => m.event_type === "generate.image"
                    );
                    const textModelsData = data.data.filter(
                        (m: ModelHealth) => m.event_type === "generate.text"
                    );

                    const totalImageRequests = imageModelsData.reduce(
                        (sum: number, m: ModelHealth) => sum + m.total_requests,
                        0
                    );
                    const totalTextRequests = textModelsData.reduce(
                        (sum: number, m: ModelHealth) => sum + m.total_requests,
                        0
                    );

                    setImageRequestsPerMin(Math.round(totalImageRequests / 5));
                    setTextRequestsPerMin(Math.round(totalTextRequests / 5));
                }
            } catch (err) {
                console.error("Error fetching model stats:", err);
            }
        };

        fetchModelStats();
        const interval = setInterval(fetchModelStats, 3000);

        return () => clearInterval(interval);
    }, []);

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

                const prompt = data.parameters?.messages?.[0]?.content || "";
                setTextFeedPrompt(prompt);

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

                <Body className="mb-8">
                    {view === "play"
                        ? pageCopy.createDescription.text
                        : pageCopy.feedDescription.text}
                </Body>

                {view === "play" && (
                    <div className="flex gap-3 mb-6">
                        <div className="flex-1 bg-gradient-to-br from-purple-500/20 to-blue-500/20 border border-purple-500/30 p-4 rounded backdrop-blur-sm hover:border-purple-500/50 transition-all duration-300">
                            <div className="flex items-center gap-3">
                                <ImageIcon className="w-6 h-6 text-purple-400 flex-shrink-0" />
                                <div className="flex-1">
                                    <div className="text-2xl font-bold text-purple-300 tabular-nums">
                                        {imageRequestsPerMin.toLocaleString()}
                                    </div>
                                    <div className="text-xs text-purple-400/70">
                                        req/min
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div className="flex-1 bg-gradient-to-br from-purple-500/20 to-blue-500/20 border border-purple-500/30 p-4 rounded backdrop-blur-sm hover:border-purple-500/50 transition-all duration-300">
                            <div className="flex items-center gap-3">
                                <TextIcon className="w-6 h-6 text-purple-400 flex-shrink-0" />
                                <div className="flex-1">
                                    <div className="text-2xl font-bold text-purple-300 tabular-nums">
                                        {textRequestsPerMin.toLocaleString()}
                                    </div>
                                    <div className="text-xs text-purple-400/70">
                                        req/min
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

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

                {view === "play" ? (
                    <div className="flex flex-col gap-4">
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
                                <div className="bg-muted p-4 rounded text-xs max-h-[100px]">
                                    <span className="block mb-2 font-bold text-[#ffc]">
                                        Prompt:
                                    </span>
                                    <div className="whitespace-pre-wrap break-words max-h-48 overflow-y-auto text-[#fff]">
                                        {textFeedPrompt.slice(0, 100)}
                                        {textFeedPrompt.length > 100 ? "..." : ""}
                                    </div>
                                </div>
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
