import { useState, useEffect, useRef } from "react";

interface ImageFeedProps {
    onFeedPromptChange: (prompt: string) => void;
}

interface FeedItem {
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

export function ImageFeed({ onFeedPromptChange }: ImageFeedProps) {
    const seenImages = useRef<Set<string>>(new Set());
    const imageQueue = useRef<ImageQueueItem[]>([]);
    const MAX_QUEUE_SIZE = 10;

    const [currentDisplay, setCurrentDisplay] = useState<FeedItem | null>(null);

    // Update parent with current feed prompt
    useEffect(() => {
        if (currentDisplay?.prompt) {
            onFeedPromptChange(currentDisplay.prompt);
        }
    }, [currentDisplay, onFeedPromptChange]);

    // Image feed - listen to all models
    useEffect(() => {
        const eventSource = new EventSource(
            "https://image.pollinations.ai/feed",
        );
        eventSource.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                if (data.imageURL && data.status === "end_generating") {
                    if (
                        !seenImages.current.has(data.imageURL) &&
                        imageQueue.current.length < MAX_QUEUE_SIZE
                    ) {
                        seenImages.current.add(data.imageURL);
                        imageQueue.current.push(data);
                    }
                }
            } catch (error) {
                console.error("Image feed error:", error);
            }
        };
        return () => eventSource.close();
    }, []);

    // Update display
    useEffect(() => {
        const interval = setInterval(() => {
            if (imageQueue.current.length > 0) {
                const item = imageQueue.current.shift();
                if (item) {
                    setCurrentDisplay({
                        content: item.imageURL,
                        prompt: item.prompt || "No prompt",
                        model: item.model,
                    });
                }
            }
        }, 1000);
        return () => clearInterval(interval);
    }, []);

    return (
        <div
            className="w-full flex flex-col gap-4"
            style={{ maxHeight: "calc(100vh - 280px)" }}
        >
            <div
                className="flex gap-6"
                style={{ height: "calc(100vh - 320px)" }}
            >
                {/* Main display - 2/3 width */}
                <div className="flex-[2] relative bg-surface-elevated rounded-sub-card overflow-hidden flex items-center justify-center">
                    {!currentDisplay ? (
                        <div className="flex items-center justify-center h-full text-center py-24 text-text-caption font-body">
                            <p>Waiting for images...</p>
                        </div>
                    ) : (
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
                                {currentDisplay?.prompt ||
                                    "No prompt available"}
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
                    </div>
                </div>
            </div>
        </div>
    );
}
