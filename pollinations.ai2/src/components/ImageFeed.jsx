import { useState, useEffect, useRef } from "react";

export function ImageFeed() {
    const [displayImages, setDisplayImages] = useState([]); // Currently displayed images
    const [sliderValue, setSliderValue] = useState(6); // Slider position (1-10) - UI only
    const [imageRate, setImageRate] = useState(0); // Images per second
    const [textRate, setTextRate] = useState(0); // Texts per second
    const seenImages = useRef(new Set());
    const imageQueue = useRef([]); // Queue of ready images
    const MAX_QUEUE_SIZE = 10; // Queue limit
    const imageTimestamps = useRef([]); // Track when images arrive
    const textTimestamps = useRef([]); // Track text generation

    // Global totals (static for now, could be fetched from API)
    const TOTAL_IMAGES = 1200000000; // 1.2 billion
    const TOTAL_TEXTS = 850000000; // 850 million

    // Connect to feed and fill queue
    useEffect(() => {
        const eventSource = new EventSource(
            "https://image.pollinations.ai/feed"
        );

        eventSource.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);

                if (data.imageURL && data.status === "end_generating") {
                    // Skip duplicates
                    if (seenImages.current.has(data.imageURL)) {
                        return;
                    }

                    // Track timestamp for rate calculation
                    imageTimestamps.current.push(Date.now());

                    // Only add if queue not full
                    if (imageQueue.current.length < MAX_QUEUE_SIZE) {
                        seenImages.current.add(data.imageURL);
                        imageQueue.current.push(data);
                    }
                    // If queue is full, refuse entry (image is lost)
                }
            } catch (error) {
                console.error("Feed parse error:", error);
            }
        };

        eventSource.onerror = () => {
            console.log("Feed connection error, will retry...");
        };

        return () => eventSource.close();
    }, []);

    // Calculate rates per second from timestamps
    useEffect(() => {
        const interval = setInterval(() => {
            const now = Date.now();
            const timeWindow = 10000; // 10 second window for smoother average

            // Filter to timestamps within last 10 seconds
            imageTimestamps.current = imageTimestamps.current.filter(
                (t) => now - t < timeWindow
            );
            textTimestamps.current = textTimestamps.current.filter(
                (t) => now - t < timeWindow
            );

            // Calculate rate per second
            const imgRate = (imageTimestamps.current.length / 10).toFixed(1);
            const txtRate = (textTimestamps.current.length / 10).toFixed(1);

            setImageRate(parseFloat(imgRate));
            setTextRate(parseFloat(txtRate));
        }, 1000); // Update every second

        return () => clearInterval(interval);
    }, []);

    // Simulate text generation timestamps (since we don't have real text feed)
    useEffect(() => {
        const interval = setInterval(() => {
            // Add 1-3 timestamps to simulate text generation
            const count = Math.floor(Math.random() * 3) + 1;
            for (let i = 0; i < count; i++) {
                textTimestamps.current.push(Date.now());
            }
        }, 2000);

        return () => clearInterval(interval);
    }, []);

    // Pull from queue ONLY when animation completes (every 24s)
    useEffect(() => {
        const interval = setInterval(() => {
            if (imageQueue.current.length > 0) {
                // Take up to 6 new images at once
                const newImages = [];
                for (let i = 0; i < 6 && imageQueue.current.length > 0; i++) {
                    newImages.push(imageQueue.current.shift());
                }

                if (newImages.length > 0) {
                    setDisplayImages((prev) => {
                        // Replace old images with new batch
                        const combined = [...prev, ...newImages];
                        return combined.slice(-6);
                    });
                }
            }
        }, 24000); // Every 24 seconds - when animation completes full loop

        return () => clearInterval(interval);
    }, []);

    // Show last 6 images, duplicated for seamless infinite scroll
    const carouselImages = displayImages.slice(-6);
    const infiniteImages =
        carouselImages.length >= 3
            ? [...carouselImages, ...carouselImages] // Duplicate for seamless loop
            : carouselImages;

    // Center image is always middle of first set (index 2 or 3)
    const centerIndex = Math.floor(carouselImages.length / 2);
    const centerImage = carouselImages[centerIndex];

    return (
        <div className="w-full space-y-6">
            {/* Smooth Gliding Carousel */}
            <div className="relative overflow-hidden h-[28rem]">
                {/* Stats - Top Right */}
                <div className="absolute top-4 right-4 z-10 flex gap-3">
                    {/* Image Stats */}
                    <div className="bg-offwhite/95 border-2 border-rose shadow-[3px_3px_0px_0px_rgba(255,105,180,1)] px-3 py-2">
                        <div className="font-headline text-[10px] uppercase tracking-wider text-offblack/60 font-black">
                            Images
                        </div>
                        <div className="flex items-baseline gap-2">
                            <div className="font-mono text-xl font-black text-rose leading-none">
                                {imageRate}/s
                            </div>
                            <div className="font-mono text-xs text-offblack/40 leading-none">
                                {(TOTAL_IMAGES / 1000000000).toFixed(1)}B
                            </div>
                        </div>
                    </div>

                    {/* Text Stats */}
                    <div className="bg-offwhite/95 border-2 border-lime shadow-[3px_3px_0px_0px_rgba(236,248,116,1)] px-3 py-2">
                        <div className="font-headline text-[10px] uppercase tracking-wider text-offblack/60 font-black">
                            Texts
                        </div>
                        <div className="flex items-baseline gap-2">
                            <div className="font-mono text-xl font-black text-offblack leading-none">
                                {textRate}/s
                            </div>
                            <div className="font-mono text-xs text-offblack/40 leading-none">
                                {(TOTAL_TEXTS / 1000000).toFixed(0)}M
                            </div>
                        </div>
                    </div>
                </div>
                {displayImages.length === 0 ? (
                    <div className="text-center py-24 text-offblack/50 font-body">
                        <p>Waiting for stream...</p>
                        <p className="text-xs mt-2">
                            Queue: {imageQueue.current.length}/{MAX_QUEUE_SIZE}
                        </p>
                    </div>
                ) : (
                    <div className="flex h-full items-center animate-glide-smooth">
                        {infiniteImages.map((image, index) => (
                            <div
                                key={`${image.imageURL}-${index}`}
                                className="flex-shrink-0 h-full px-3"
                                style={{ width: "32vw" }} // Smaller - so you can see ~3 images (one full, two partial)
                            >
                                <img
                                    src={image.imageURL}
                                    alt={image.prompt || "Generated image"}
                                    className={`w-full h-full object-cover ${
                                        index === centerIndex // First set's center image
                                            ? "border-4 border-rose shadow-[6px_6px_0px_0px_rgba(255,105,180,1)]"
                                            : ""
                                    }`}
                                />
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Center Image Info */}
            {centerImage && (
                <div className="text-center space-y-2 px-4 max-w-4xl mx-auto">
                    <p className="font-body text-offblack text-base leading-relaxed break-words overflow-wrap-anywhere line-clamp-5">
                        {centerImage.prompt || "No prompt provided"}
                    </p>
                    <p className="font-mono text-offblack/50 text-xs tracking-wider">
                        Model: {centerImage.model || "Unknown"}
                    </p>
                </div>
            )}

            {/* Speed Control - Hidden for now but keeping for later
            <div className="max-w-md mx-auto space-y-2">
                <div className="flex items-center justify-between">
                    <span className="font-headline text-xs uppercase tracking-wider font-black text-offblack/70">
                        Speed
                    </span>
                    <span className="font-body text-xs text-offblack/50">
                        4s per image
                    </span>
                </div>
                <input
                    type="range"
                    min="1"
                    max="10"
                    value={sliderValue}
                    onChange={(e) => setSliderValue(Number(e.target.value))}
                    className="w-full h-2 bg-offblack/10 appearance-none cursor-pointer"
                    style={{
                        background: `linear-gradient(to right, #ecf874 0%, #ecf874 ${
                            ((sliderValue - 1) / 9) * 100
                        }%, rgba(17,5,24,0.1) ${
                            ((sliderValue - 1) / 9) * 100
                        }%, rgba(17,5,24,0.1) 100%)`,
                    }}
                />
                <div className="flex justify-between text-xs font-body text-offblack/40">
                    <span>Slow</span>
                    <span>Fast</span>
                </div>
            </div>
            */}
        </div>
    );
}
