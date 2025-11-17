import { useState, useEffect } from "react";

export function ImageFeed() {
    const [feedImages, setFeedImages] = useState([]);

    useEffect(() => {
        // Connect to Server-Sent Events feed
        const eventSource = new EventSource(
            "https://image.pollinations.ai/feed"
        );

        eventSource.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);

                // Only add images that have completed generating
                if (data.imageURL && data.status === "end_generating") {
                    setFeedImages((prev) => {
                        // Keep only last 30 images
                        const newImages = [data, ...prev].slice(0, 30);
                        return newImages;
                    });
                }
            } catch (error) {
                console.error("Feed parse error:", error);
            }
        };

        eventSource.onerror = () => {
            console.log("Feed connection error, will retry...");
            // EventSource automatically reconnects
        };

        // Cleanup on unmount
        return () => {
            eventSource.close();
        };
    }, []);

    return (
        <div className="w-full">
            {feedImages.length === 0 ? (
                <div className="text-center py-12 text-offblack/50 font-body">
                    Waiting for images...
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {feedImages.map((image, index) => (
                        <FeedCard
                            key={`${image.imageURL}-${index}`}
                            image={image}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}

function FeedCard({ image }) {
    return (
        <div className="bg-offwhite/90 border-r-4 border-b-4 border-rose shadow-[4px_4px_0px_0px_rgba(255,105,180,1)] hover:shadow-[6px_6px_0px_0px_rgba(255,105,180,1)] transition-all overflow-hidden">
            {/* Image */}
            <div className="aspect-square overflow-hidden">
                <img
                    src={image.imageURL}
                    alt={image.prompt || "Generated image"}
                    className="w-full h-full object-cover"
                    loading="lazy"
                />
            </div>

            {/* Info */}
            <div className="p-4 space-y-2">
                {/* Prompt */}
                <p className="font-body text-offblack text-sm line-clamp-3">
                    {image.prompt || "No prompt provided"}
                </p>

                {/* Model */}
                <p className="font-headline text-offblack/40 text-xs uppercase tracking-wider">
                    Model: {image.model || "Unknown"}
                </p>
            </div>
        </div>
    );
}
