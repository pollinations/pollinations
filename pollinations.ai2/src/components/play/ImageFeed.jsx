import { useState, useEffect, useRef } from "react";
import { useModelList } from "../../hooks/useModelList";

export function ImageFeed() {
    const [selectedModel, setSelectedModel] = useState(null);
    const seenImages = useRef(new Set());
    const imageQueue = useRef([]);
    const textQueue = useRef([]);
    const MAX_QUEUE_SIZE = 10;
    const modelTimestamps = useRef({});
    const [modelRates, setModelRates] = useState({});
    const [currentDisplay, setCurrentDisplay] = useState(null);
    const { imageModels, textModels } = useModelList();

    // Auto-select first active model
    useEffect(() => {
        if (!selectedModel && Object.keys(modelRates).length > 0) {
            const activeModels = [...imageModels, ...textModels]
                .filter((model) => (modelRates[model.id] || 0) > 0)
                .sort(
                    (a, b) => (modelRates[b.id] || 0) - (modelRates[a.id] || 0)
                );
            if (activeModels.length > 0) {
                setSelectedModel(activeModels[0].id);
            }
        }
    }, [modelRates, selectedModel, imageModels, textModels]);

    // Image feed
    useEffect(() => {
        const eventSource = new EventSource(
            "https://image.pollinations.ai/feed"
        );
        eventSource.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                if (data.imageURL && data.status === "end_generating") {
                    const timestamp = Date.now();
                    if (!modelTimestamps.current[data.model]) {
                        modelTimestamps.current[data.model] = [];
                    }
                    modelTimestamps.current[data.model].push(timestamp);

                    if (!selectedModel || data.model === selectedModel) {
                        if (
                            !seenImages.current.has(data.imageURL) &&
                            imageQueue.current.length < MAX_QUEUE_SIZE
                        ) {
                            seenImages.current.add(data.imageURL);
                            imageQueue.current.push(data);
                        }
                    }
                }
            } catch (error) {
                console.error("Image feed error:", error);
            }
        };
        return () => eventSource.close();
    }, [selectedModel]);

    // Text feed
    useEffect(() => {
        const eventSource = new EventSource(
            "https://text.pollinations.ai/feed"
        );
        eventSource.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                if (data.response) {
                    const modelId =
                        data.parameters?.model || data.model || "unknown";
                    const timestamp = Date.now();
                    if (!modelTimestamps.current[modelId]) {
                        modelTimestamps.current[modelId] = [];
                    }
                    modelTimestamps.current[modelId].push(timestamp);

                    if (!selectedModel || modelId === selectedModel) {
                        const userMessage = data.parameters?.messages?.find(
                            (msg) => msg?.role === "user"
                        );
                        const prompt =
                            userMessage?.content || data.prompt || "No prompt";
                        if (textQueue.current.length < MAX_QUEUE_SIZE) {
                            textQueue.current.push({
                                type: "text",
                                model: modelId,
                                response: data.response,
                                prompt: prompt,
                            });
                        }
                    }
                }
            } catch (error) {
                console.error("Text feed error:", error);
            }
        };
        return () => eventSource.close();
    }, [selectedModel]);

    // Update display
    useEffect(() => {
        const interval = setInterval(() => {
            const selectedModelData = [...imageModels, ...textModels].find(
                (m) => m.id === selectedModel
            );
            if (!selectedModelData) return;

            if (
                selectedModelData.type === "image" &&
                imageQueue.current.length > 0
            ) {
                const item = imageQueue.current.shift();
                setCurrentDisplay({
                    type: "image",
                    content: item.imageURL,
                    prompt: item.prompt || "No prompt",
                    model: item.model,
                });
            } else if (
                selectedModelData.type === "text" &&
                textQueue.current.length > 0
            ) {
                const item = textQueue.current.shift();
                setCurrentDisplay({
                    type: "text",
                    content: item.response,
                    prompt: item.prompt,
                    model: item.model,
                });
            }
        }, 1000);
        return () => clearInterval(interval);
    }, [selectedModel, imageModels, textModels]);

    // Calculate rates
    useEffect(() => {
        const interval = setInterval(() => {
            const now = Date.now();
            const newModelRates = {};
            Object.keys(modelTimestamps.current).forEach((modelId) => {
                modelTimestamps.current[modelId] = modelTimestamps.current[
                    modelId
                ].filter((t) => now - t < 10000);
                newModelRates[modelId] = parseFloat(
                    (modelTimestamps.current[modelId].length / 10).toFixed(2)
                );
            });
            setModelRates(newModelRates);
        }, 1000);
        return () => clearInterval(interval);
    }, []);

    // Clear on channel change
    useEffect(() => {
        imageQueue.current = [];
        textQueue.current = [];
        seenImages.current.clear();
        setCurrentDisplay(null);
    }, [selectedModel]);

    const maxRate = Math.max(...Object.values(modelRates), 0.1);

    return (
        <div className="w-full space-y-6">
            {/* Diagonal Bar Graph Channel Selector */}
            <div className="space-y-3">
                <div className="flex items-center gap-3 text-[10px] font-headline uppercase tracking-wider font-black">
                    <div className="flex items-center gap-1">
                        <div className="w-3 h-3 bg-rose border border-offblack" />
                        <span className="text-offblack/50">Image</span>
                    </div>
                    <div className="flex items-center gap-1">
                        <div className="w-3 h-3 bg-lime border border-offblack" />
                        <span className="text-offblack/50">Text</span>
                    </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                    {[...imageModels, ...textModels]
                        .filter((model) => (modelRates[model.id] || 0) > 0)
                        .sort(
                            (a, b) =>
                                (modelRates[b.id] || 0) -
                                (modelRates[a.id] || 0)
                        )
                        .slice(0, 5)
                        .map((model) => {
                            const isImage = model.type === "image";
                            const isActive = selectedModel === model.id;
                            const rate = modelRates[model.id] || 0;
                            const strength = Math.min(
                                (rate / maxRate) * 100,
                                100
                            );

                            return (
                                <button
                                    key={model.id}
                                    type="button"
                                    onClick={() => setSelectedModel(model.id)}
                                    className={`relative h-32 border-2 transition-all overflow-hidden ${
                                        isActive
                                            ? "border-offblack shadow-black-md"
                                            : "border-offblack/30 hover:border-offblack/60"
                                    }`}
                                    title={model.name}
                                >
                                    {/* Diagonal strength bar */}
                                    <div
                                        className={`absolute bottom-0 left-0 right-0 transition-all duration-700 ${
                                            isImage
                                                ? "bg-rose/20"
                                                : "bg-lime/20"
                                        }`}
                                        style={{
                                            height: `${strength}%`,
                                            transform: "skewY(-3deg)",
                                            transformOrigin: "bottom left",
                                        }}
                                    />

                                    {/* Diagonal text */}
                                    <div className="absolute inset-0 flex items-center justify-center p-2">
                                        <div
                                            className="font-headline text-[0.65rem] uppercase tracking-wider font-black text-offblack"
                                            style={{
                                                transform: "rotate(-12deg)",
                                                textShadow: isActive
                                                    ? "2px 2px 0 rgba(255,255,255,0.8)"
                                                    : "none",
                                            }}
                                        >
                                            {model.name}
                                        </div>
                                    </div>

                                    {/* Rate indicator */}
                                    <div
                                        className={`absolute bottom-1 right-1 px-1.5 py-0.5 font-mono text-[0.5rem] font-black ${
                                            isImage
                                                ? "bg-rose text-offwhite"
                                                : "bg-lime text-offblack"
                                        }`}
                                    >
                                        {rate.toFixed(2)}/s
                                    </div>
                                </button>
                            );
                        })}
                </div>
            </div>

            {/* Display Card */}
            <div className="bg-offwhite border-4 border-offblack shadow-black-lg overflow-hidden">
                <div className="relative bg-offwhite min-h-[32rem] flex items-center justify-center">
                    {!currentDisplay ? (
                        <div className="text-center py-24 text-offblack/50 font-body">
                            <p>Waiting for content...</p>
                            {selectedModel && (
                                <p className="text-xs mt-2">
                                    Listening to {selectedModel}
                                </p>
                            )}
                        </div>
                    ) : currentDisplay.type === "image" ? (
                        <img
                            src={currentDisplay.content}
                            alt={currentDisplay.prompt}
                            className="w-full h-full max-h-[32rem] object-contain"
                        />
                    ) : (
                        <div className="w-full p-8 overflow-auto max-h-[32rem] scrollbar-hide">
                            <p className="font-body text-offblack text-lg leading-relaxed whitespace-pre-wrap">
                                {currentDisplay.content}
                            </p>
                        </div>
                    )}
                </div>

                {currentDisplay && (
                    <div className="border-t-4 border-offblack bg-offwhite/80 p-6 h-32 overflow-hidden">
                        <div className="flex items-start gap-3 h-full">
                            <div className="flex-shrink-0">
                                <div
                                    className={`w-1 h-full ${
                                        currentDisplay.type === "image"
                                            ? "bg-rose"
                                            : "bg-lime"
                                    }`}
                                />
                            </div>
                            <div className="flex-1 overflow-hidden flex items-center">
                                <p className="font-body text-offblack text-sm leading-relaxed break-words line-clamp-4">
                                    {currentDisplay.prompt}
                                </p>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
