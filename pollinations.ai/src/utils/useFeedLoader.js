import { useEffect, useState } from "react";
import { SSE_FEED_URL, IMAGE_GENERATION_INCREMENT, LAUNCH_DATE_TIMESTAMP, IMAGE_GENERATION_RATE, INITIAL_IMAGE_COUNT } from "../config/appConfig";

export function useFeedLoader(onNewImage, setLastImage, mode) {
    const [imagesGenerated, setImagesGenerated] = useState(
        estimateGeneratedImages(),
    );

    useEffect(() => {
        let eventSource = null;

        const getEventSource = () => {
            const source = new EventSource(
                SSE_FEED_URL,
            );
            source.onmessage = (evt) => {
                const data = JSON.parse(evt.data);
                // Increment by 5 instead of 1 as per issue #1793
                setImagesGenerated((no) => no + IMAGE_GENERATION_INCREMENT);

                // Dispatch custom event for counter increment
                window.dispatchEvent(
                    new CustomEvent("image-received", {
                        detail: { image: data },
                    }),
                );

                // lastServerLoad = data["concurrentRequests"];
                if (data["status"] === "end_generating") setLastImage(data);

                if (data["imageURL"]) {
                    onNewImage(data);
                }
            };
            source.onerror = async () => {
                await new Promise((r) => setTimeout(r, 1000));
                // Ensure we only try to reconnect if the mode is still 'image'
                if (eventSource) {
                    eventSource.close();
                }
                if (mode === "image") {
                    eventSource = getEventSource(); // Attempt to reconnect
                }
            };
            return source;
        };

        if (mode === "image") {
            eventSource = getEventSource();
        }

        // Cleanup function: Close the connection if it exists when mode changes or component unmounts
        return () => {
            if (eventSource) {
                eventSource.close();
                eventSource = null; // Clear the reference
            }
        };
    }, [mode, onNewImage, setLastImage]); // Add mode to dependency array

    return { imagesGenerated };
}

function estimateGeneratedImages() {
    const launchDate = LAUNCH_DATE_TIMESTAMP;
    const now = Date.now();
    const differenceInSeconds = (now - launchDate) / 1000;
    // Multiply rate by 5 as per issue #1793 (from 23.78 to 118.9)
    const imagesGeneratedSinceLaunch = Math.round(differenceInSeconds * IMAGE_GENERATION_RATE); // ~500,000 images per hour

    const imagesGeneratedCalculated = INITIAL_IMAGE_COUNT + imagesGeneratedSinceLaunch;
    return imagesGeneratedCalculated;
}
