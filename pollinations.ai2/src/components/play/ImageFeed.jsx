import { useState, useEffect, useRef } from "react";
import { useModelList } from "../../hooks/useModelList";

export function ImageFeed({ selectedModel, onFeedPromptChange }) {
    const seenImages = useRef(new Set());
    const imageQueue = useRef([]);
    const textQueue = useRef([]);
    const MAX_QUEUE_SIZE = 10;
    const [currentDisplay, setCurrentDisplay] = useState(null);
    const { imageModels, textModels } = useModelList();

    // Update parent with current feed prompt
    useEffect(() => {
        if (currentDisplay?.prompt) {
            onFeedPromptChange(currentDisplay.prompt);
        }
    }, [currentDisplay, onFeedPromptChange]);

    // Image feed
    useEffect(() => {
        const eventSource = new EventSource(
            "https://image.pollinations.ai/feed"
        );
        eventSource.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                if (data.imageURL && data.status === "end_generating") {
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

    // Clear on channel change
    useEffect(() => {
        imageQueue.current = [];
        textQueue.current = [];
        seenImages.current.clear();
        setCurrentDisplay(null);
    }, [selectedModel]);

    return (
        <div className="w-full">
            {/* Display */}
            <div className="relative min-h-[32rem] max-h-[32rem] flex items-center justify-center overflow-hidden">
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
        </div>
    );
}
