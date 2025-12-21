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
    const [displayedImages, setDisplayedImages] = useState<FeedItem[]>([]);
    const [allImages, setAllImages] = useState<FeedItem[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [selectedImage, setSelectedImage] = useState<FeedItem | null>(null);
    const eventSourceRef = useRef<EventSource | null>(null);
    const seenImagesRef = useRef<Set<string>>(new Set());
    const loadMoreTriggerRef = useRef<HTMLDivElement>(null);
    const imagesPerLoad = 12;

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
                        const newImage = {
                            imageURL: data.imageURL,
                            prompt: data.prompt || "No prompt",
                            model: data.model || "unknown",
                            width: data.width,
                            height: data.height,
                            seed: data.seed,
                            timestamp: Date.now(),
                        };
                        setAllImages((prev) => [...prev, newImage]);
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
    }, [isLoading]);

    useEffect(() => {
        if (allImages.length > 0 && displayedImages.length === 0) {
            setDisplayedImages(allImages.slice(0, imagesPerLoad));
        }
    }, [allImages]);

    useEffect(() => {
        const observer = new IntersectionObserver(
            ([entry]) => {
                if (entry.isIntersecting && displayedImages.length < allImages.length) {
                    setDisplayedImages((prev) => [
                        ...prev,
                        ...allImages.slice(prev.length, prev.length + imagesPerLoad),
                    ]);
                }
            },
            { threshold: 0.2 }
        );

        if (loadMoreTriggerRef.current) {
            observer.observe(loadMoreTriggerRef.current);
        }

        return () => {
            if (loadMoreTriggerRef.current) {
                observer.unobserve(loadMoreTriggerRef.current);
            }
        };
    }, [displayedImages.length, allImages.length]);

    return (
        <PageContainer>
            <style>{`
                            .feed-grid::-webkit-scrollbar {
                                width: 8px;
                            }
                            .feed-grid::-webkit-scrollbar-track {
                                background: var(--color-surface-secondary);
                                border-radius: 10px;
                            }
                            .feed-grid::-webkit-scrollbar-thumb {
                                background: var(--color-border-brand);
                                border-radius: 10px;
                            }
                            .feed-grid::-webkit-scrollbar-thumb:hover {
                                background: var(--color-border-brand);
                                opacity: 0.8;
                            }
                            .modal-backdrop {
                                animation: fadeIn 0.2s ease-in-out;
                            }
                            .modal-content {
                                animation: slideUp 0.3s ease-out;
                            }
                            @keyframes fadeIn {
                                from { opacity: 0; }
                                to { opacity: 1; }
                            }
                            @keyframes slideUp {
                                from { transform: translateY(20px); opacity: 0; }
                                to { transform: translateY(0); opacity: 1; }
                            }
                        `}</style>
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

                {!isLoading && displayedImages.length === 0 && (
                    <div className="text-center py-24 text-text-caption">
                        <p>Waiting for images...</p>
                    </div>
                )}

                {displayedImages.length > 0 && (
                    <>
                        <div className="feed-grid grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2 max-h-[calc(100vh-340px)] overflow-y-auto pr-4 scrollbar-thin scrollbar-thumb-border-brand scrollbar-track-surface-secondary rounded-lg"
                            style={{
                                scrollbarWidth: 'thin',
                                scrollbarColor: 'var(--color-border-brand) var(--color-surface-secondary)',
                            }}>
                            {displayedImages.map((item, index) => {
                                const positionInBatch = index % imagesPerLoad;
                                const aspectRatio = item.width / item.height;
                                return (
                                <div
                                    key={`${item.imageURL}-${item.timestamp}`}
                                    className="group relative overflow-hidden rounded-lg bg-surface-secondary cursor-pointer hover:shadow-lg transition-shadow duration-300 animate-in fade-in slide-in-from-bottom-4"
                                    style={{
                                        animationDelay: `${positionInBatch * 30}ms`,
                                        animationFillMode: 'both',
                                        aspectRatio: `${aspectRatio}`,
                                    }}
                                    onClick={() => setSelectedImage(item)}
                                >
                                    <img
                                        src={item.imageURL}
                                        alt={item.prompt}
                                        loading="lazy"
                                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
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
                                );
                            })}

                            {displayedImages.length < allImages.length && (
                                <div
                                    ref={loadMoreTriggerRef}
                                    className="flex items-center justify-center py-12 mt-8"
                                >
                                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-border-brand"></div>
                                </div>
                            )}
                        </div>
                    </>
                )}
            </PageCard>

            {selectedImage && (
                <div
                    className="modal-backdrop fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4"
                    onClick={() => setSelectedImage(null)}
                >
                    <div
                        className="modal-content bg-gray-950 rounded-xl max-w-4xl w-full max-h-[95vh] overflow-hidden flex flex-col relative shadow-2xl"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <button
                            onClick={() => setSelectedImage(null)}
                            className="absolute top-4 right-4 z-10 bg-white/20 hover:bg-white/30 rounded-full p-2 transition-colors backdrop-blur-sm"
                        >
                            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>

                        <div className="relative bg-black flex items-center justify-center flex-1 overflow-hidden">
                            <img
                                src={selectedImage.imageURL}
                                alt={selectedImage.prompt}
                                className="w-full h-full object-contain"
                            />
                        </div>

                        <div className="p-6 space-y-4 bg-gray-950 border-t border-white/10 overflow-y-auto max-h-56">
                            <div>
                                <h3 className="text-xs font-semibold text-gray-400 mb-2 uppercase tracking-wide">Prompt</h3>
                                <p className="text-white text-sm leading-relaxed">{selectedImage.prompt}</p>
                            </div>

                            <div className="grid grid-cols-4 gap-3">
                                <div>
                                    <h4 className="text-xs font-semibold text-gray-400 mb-1 uppercase tracking-wide">Model</h4>
                                    <p className="text-white text-sm">{selectedImage.model}</p>
                                </div>
                                <div>
                                    <h4 className="text-xs font-semibold text-gray-400 mb-1 uppercase tracking-wide">Seed</h4>
                                    <p className="text-white text-sm">#{selectedImage.seed}</p>
                                </div>
                                <div>
                                    <h4 className="text-xs font-semibold text-gray-400 mb-1 uppercase tracking-wide">Resolution</h4>
                                    <p className="text-white text-sm">{selectedImage.width}×{selectedImage.height}</p>
                                </div>
                                <div>
                                    <h4 className="text-xs font-semibold text-gray-400 mb-1 uppercase tracking-wide">Aspect Ratio</h4>
                                    <p className="text-white text-sm">{(selectedImage.width / selectedImage.height).toFixed(2)}</p>
                                </div>
                            </div>

                            <div className="flex gap-3 pt-2">
                                <button
                                    onClick={() => window.open(selectedImage.imageURL, '_blank')}
                                    className="flex-1 px-4 py-2.5 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-500 hover:to-blue-600 text-white rounded-lg transition-all duration-200 text-sm font-semibold shadow-lg hover:shadow-blue-600/50"
                                >
                                    Open Full Size
                                </button>
                                <button
                                    onClick={() => {
                                        const link = document.createElement('a');
                                        link.href = selectedImage.imageURL;
                                        link.download = `pollinations-${selectedImage.seed}.png`;
                                        document.body.appendChild(link);
                                        link.click();
                                        document.body.removeChild(link);
                                    }}
                                    className="flex-1 px-4 py-2.5 bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-500 hover:to-emerald-600 text-white rounded-lg transition-all duration-200 text-sm font-semibold shadow-lg hover:shadow-emerald-600/50"
                                >
                                    Download
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </PageContainer>
    );
}

export default Feed;