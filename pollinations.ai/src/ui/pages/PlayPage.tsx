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
    // Fetched from SSE stream at text.polli/feed
    const [textFeedPrompt, setTextFeedPrompt] = useState(
        'You are an expert algorithmic trading engine. Analyze this market data and respond with ONLY a valid JSON object.\n\nData: {"symbol":"ETHUSD","price":"2963.80","ema9":"2962.95","ema21":"2963.87","rsi":"47.14","macd_hist":"0.1837","bb_position":"INSIDE","context":"15m Trend is DOWN"}\n\nRules: BUY if EMA9>EMA21 and RSI 40-60. SELL if EMA9<EMA21 and RSI 40-60. HOLD otherwise.\n\nFormat: {"action":"BUY/SELL/HOLD","confidence":0-100,"reasoning":"brief","riskLevel":"LOW/MEDIUM/HIGH","trend":"UPTREND/DOWNTREND/SIDEWAYS","phase":"IMPULSE/PULLBACK/CONSOLIDATION"}'
    );
    const [textFeedResponse, setTextFeedResponse] = useState(
        '{"action":"SELL","confidence":75,"reasoning":"EMA9<EMA21 and RSI within 40-60 satisfy SELL; 15m trend is DOWN, supporting downside bias; MACD_hist positive suggests a mild pullback within the downtrend.","riskLevel":"MEDIUM","trend":"DOWNTREND","phase":"PULLBACK"}'
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
                    <PlayGenerator
                        selectedModel={selectedModel}
                        prompt={prompt}
                        onPromptChange={setPrompt}
                        imageModels={imageModels}
                        textModels={textModels}
                    />
                ) : feedType === "text" ? (
                    <div className="flex flex-col gap-4">
                        {/* Top: Prompt */}
                        <div className="bg-muted p-4 rounded text-xs">
                            <span className="block mb-2 font-bold text-[#ffc]">Prompt:</span>
                            <div className="whitespace-pre-wrap break-words max-h-48 overflow-y-auto text-[#fff]">
                                {textFeedPrompt.slice(0, 500)}
                                {textFeedPrompt.length > 500 ? '...' : ''}
                            </div>
                        </div>
                        {/* Bottom: Response */}
                        <div className="bg-muted p-4 rounded text-xs">
                            <span className="block mb-2 font-bold text-[#ffc]">Response:</span>
                            <div className="whitespace-pre-wrap break-words max-h-48 overflow-y-auto text-[#fff]">
                                {textFeedResponse.slice(0, 500)}
                                {textFeedResponse.length > 500 ? '...' : ''}
                            </div>
                        </div>
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
