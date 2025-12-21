import { useState, useEffect, useRef } from "react";
import { Title, Body } from "../components/ui/typography";
import { PageCard } from "../components/ui/page-card";
import { PageContainer } from "../components/ui/page-container";

interface FeedItem {
    imageURL: string;
    prompt: string;
    model: string;
    width: number;
    height: number;
    seed: number;
    timestamp: number;
}

function Feed() {
    const [images, setImages] = useState<FeedItem[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const eventSourceRef = useRef<EventSource | null>(null);
    const seenImagesRef = useRef<Set<string>>(new Set());

    useEffect(() => {
        eventSourceRef.current = new EventSource(
            "https://image.pollinations.ai/feed"
        );

        eventSourceRef.current.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                if (data.imageURL && data.status === "end_generating") {
                    if (!seenImagesRef.current.has(data.imageURL)) {
                        seenImagesRef.current.add(data.imageURL);
                        setImages((prev) => [
                            {
                                imageURL: data.imageURL,
                                prompt: data.prompt || "No prompt",
                                model: data.model || "unknown",
                                width: data.width,
                                height: data.height,
                                seed: data.seed,
                                timestamp: Date.now(),
                            },
                            ...prev.slice(0, 49),
                        ]);
                        if (isLoading) setIsLoading(false);
                    }
                }
            } catch (error) {
                console.error("Feed error:", error);
            }
        };

        eventSourceRef.current.onerror = () => {
            eventSourceRef.current?.close();
            setTimeout(() => {
                window.location.reload();
            }, 5000);
        };

        return () => {
            eventSourceRef.current?.close();
        };
    }, []);

    return (
        <PageContainer>
            <PageCard>
                <Title spacing="none">Live Feed</Title>
                <Body className="mb-8">
                    Real-time image generation from the community
                </Body>

                {isLoading && (
                    <div className="flex items-center justify-center py-24">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-border-brand"></div>
                    </div>
                )}

                {!isLoading && images.length === 0 && (
                    <div className="text-center py-24 text-text-caption">
                        <p>Waiting for images...</p>
                    </div>
                )}

                {images.length > 0 && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                        {images.map((item) => (
                            <div
                                key={`${item.imageURL}-${item.timestamp}`}
                                className="group relative overflow-hidden rounded-lg bg-surface-secondary cursor-pointer hover:shadow-lg transition-shadow duration-300"
                            >
                                <img
                                    src={item.imageURL}
                                    alt={item.prompt}
                                    loading="lazy"
                                    className="w-full aspect-square object-cover group-hover:scale-105 transition-transform duration-300"
                                />
                                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col justify-end p-4">
                                    <p className="text-white text-sm font-body line-clamp-3 mb-2">
                                        {item.prompt}
                                    </p>
                                    <div className="flex justify-between text-xs text-gray-300">
                                        <span>{item.model}</span>
                                        <span>#{item.seed}</span>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </PageCard>
        </PageContainer>
    );
}

export default Feed;