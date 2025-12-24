import { useState, useEffect, useRef } from "react";
import { Button } from "../ui/button";
import type { Model } from "../../../hooks/useModelList";

interface ImageFeedProps {
    selectedModel: string;
    onFeedPromptChange: (prompt: string) => void;
    imageModels: Model[];
    textModels: Model[];
}

interface FeedItem {
    type: "image" | "text";
    content: string;
    prompt: string;
    model: string;
}

interface ImageQueueItem {
    imageURL: string;
    prompt: string;
    model: string;
    status?: string;
}

interface TextQueueItem {
    type: "text";
    model: string;
    response: string;
    prompt: string;
}

export function ImageFeed({
    selectedModel,
    onFeedPromptChange,
    imageModels,
    textModels,
}: ImageFeedProps) {
    const seenImages = useRef<Set<string>>(new Set());
    const imageQueue = useRef<ImageQueueItem[]>([]);
    const textQueue = useRef<TextQueueItem[]>([]);
    const feedItems = useRef<FeedItem[]>([]);
    const MAX_QUEUE_SIZE = 10;
    const MAX_FEED_ITEMS = 30;
    
    const [currentDisplay, setCurrentDisplay] = useState<FeedItem | null>(null);
    const [viewMode, setViewMode] = useState<"single" | "grid">("single"); 
    const [feedHistory, setFeedHistory] = useState<FeedItem[]>([]);

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
                            (msg: any) => msg?.role === "user"
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

    // Update display and feed history
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
                if (item) {
                    const feedItem: FeedItem = {
                        type: "image",
                        content: item.imageURL,
                        prompt: item.prompt || "No prompt",
                        model: item.model,
                    };
                    setCurrentDisplay(feedItem);
                    
                    // Add to history
                    feedItems.current.push(feedItem);
                    if (feedItems.current.length > MAX_FEED_ITEMS) {
                        feedItems.current.shift();
                    }
                    setFeedHistory([...feedItems.current]);
                }
            } else if (
                selectedModelData.type === "text" &&
                textQueue.current.length > 0
            ) {
                const item = textQueue.current.shift();
                if (item) {
                    const feedItem: FeedItem = {
                        type: "text",
                        content: item.response,
                        prompt: item.prompt,
                        model: item.model,
                    };
                    setCurrentDisplay(feedItem);
                    
                    // Add to history
                    feedItems.current.push(feedItem);
                    if (feedItems.current.length > MAX_FEED_ITEMS) {
                        feedItems.current.shift();
                    }
                    setFeedHistory([...feedItems.current]);
                }
            }
        }, 1000);
        return () => clearInterval(interval);
    }, [selectedModel, imageModels, textModels]);

    // Clear on channel change
    useEffect(() => {
        imageQueue.current = [];
        textQueue.current = [];
        seenImages.current.clear();
        feedItems.current = [];
        setCurrentDisplay(null);
        setFeedHistory([]);
    }, [selectedModel]);

    // View toggle - shared between modes
    const viewToggle = (
        <div className="flex gap-2">
            <Button
                variant="toggle"
                data-active={viewMode === "single"}
                onClick={() => setViewMode("single")}
                className="text-xs px-3 py-1.5"
            >
                Single View
            </Button>
            <Button
                variant="toggle"
                data-active={viewMode === "grid"}
                onClick={() => setViewMode("grid")}
                className="text-xs px-3 py-1.5"
            >
                Grid View
            </Button>
        </div>
    );

    // Single view mode
    if (viewMode === "single") {
        return (
            <div className="w-full flex flex-col gap-4" style={{ maxHeight: "calc(100vh - 280px)" }}>
                {/* View toggle */}
                {viewToggle}

                <div className="flex gap-6" style={{ height: "calc(100vh - 380px)" }}>
                    {/* Main display - 2/3 width */}
                    <div className="flex-[2] relative bg-surface-elevated rounded-sub-card overflow-hidden flex items-center justify-center">
                        {!currentDisplay ? (
                            <div className="flex items-center justify-center h-full text-center py-24 text-text-caption font-body">
                                <div>
                                    <p>Waiting for content...</p>
                                    {selectedModel && (
                                        <p className="text-xs mt-2">
                                            Listening to {selectedModel}
                                        </p>
                                    )}
                                </div>
                            </div>
                        ) : currentDisplay.type === "image" ? (
                            <a
                                href={currentDisplay.content}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="w-full h-full overflow-hidden hover:opacity-90 transition-opacity"
                            >
                                <img
                                    src={currentDisplay.content}
                                    alt={currentDisplay.prompt}
                                    className="w-full h-full object-cover"
                                />
                            </a>
                        ) : (
                            <div className="w-full h-full p-6 overflow-auto scrollbar-hide">
                                <p className="font-body text-text-body-main text-sm leading-relaxed whitespace-pre-wrap">
                                    {currentDisplay.content}
                                </p>
                            </div>
                        )}
                    </div>

                    {/* Sidebar - 1/3 width */}
                    <div className="flex-1 bg-surface-elevated rounded-sub-card p-6 overflow-auto scrollbar-hide border-l-4 border-border-highlight">
                        <div className="space-y-4">
                            <div>
                                <p className="font-headline text-xs uppercase tracking-wider font-black text-text-body-main mb-2">
                                    Prompt
                                </p>
                                <p className="font-body text-sm text-text-body-secondary break-words">
                                    {currentDisplay?.prompt.slice(0,200)+"..." || "No prompt available"}
                                </p>
                            </div>
                            <div>
                                <p className="font-headline text-xs uppercase tracking-wider font-black text-text-body-main mb-2">
                                    Model
                                </p>
                                <p className="font-mono text-xs text-text-body-secondary">
                                    {currentDisplay?.model || "-"}
                                </p>
                            </div>
                            <div>
                                <p className="font-headline text-xs uppercase tracking-wider font-black text-text-body-main mb-2">
                                    Type
                                </p>
                                <p className="font-mono text-xs uppercase text-text-body-secondary">
                                    {currentDisplay?.type || "-"}
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    // Grid view mode - Masonry layout
    return (
        <div className="w-full flex flex-col gap-4">
            {/* View toggle */}
            {viewToggle}

            {/* Masonry grid - scrollable */}
            <div className="overflow-y-auto scrollbar-hide border border-border-subtle rounded-sub-card" style={{ maxHeight: "calc(100vh - 280px)" }}>
                <div className="columns-1 sm:columns-2 lg:columns-3 gap-4 space-y-4">
                    {feedHistory.length === 0 ? (
                        <div className="col-span-full text-center py-12 text-text-caption font-body">
                            <p>Waiting for content...</p>
                            {selectedModel && (
                                <p className="text-xs mt-2">
                                    Listening to {selectedModel}
                                </p>
                            )}
                        </div>
                    ) : (
                        feedHistory.map((item, index) => (
                            <div
                                key={`${item.content}-${index}`}
                                className="break-inside-avoid group relative bg-surface-elevated rounded-sub-card overflow-hidden cursor-pointer hover:shadow-shadow-brand-md transition-all"
                                onClick={() => {
                                    setCurrentDisplay(item);
                                    setViewMode("single");
                                }}
                            >
                                {item.type === "image" ? (
                                    <>
                                        <a
                                            href={item.content}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            onClick={(e) => e.stopPropagation()}
                                            className="w-full block overflow-hidden"
                                        >
                                            <img
                                                src={item.content}
                                                alt={item.prompt}
                                                className="w-full h-auto object-cover group-hover:opacity-70 transition-opacity"
                                            />
                                        </a>
                                        {/* Hover prompt overlay */}
                                        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/0 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-4">
                                            <p className="font-body text-xs text-white line-clamp-3">
                                                {item.prompt}
                                            </p>
                                        </div>
                                    </>
                                ) : (
                                    <div className="p-4 min-h-[150px] flex items-center">
                                        <p className="font-body text-xs text-text-body-secondary line-clamp-6">
                                            {item.content}
                                        </p>
                                    </div>
                                )}
                            </div>
                        ))
                    )}
                </div>
            </div>
        </div>
    );
}