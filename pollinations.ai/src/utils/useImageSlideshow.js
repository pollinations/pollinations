import { useEffect, useState, useCallback, useRef } from "react";
import { useInterval } from "usehooks-ts";
import debug from "debug";
import { useMediaQuery } from "@mui/material";
import debounce from "lodash.debounce";

const log = debug("useImageSlideshow");

const useDebouncedMediaQuery = (query, delay = 200) => {
    const [matches, setMatches] = useState(false);

    const handler = debounce((event) => {
        setMatches(event.matches);
    }, delay);

    useEffect(() => {
        const media = window.matchMedia(query);
        media.addEventListener("change", handler);
        setMatches(media.matches);

        return () => {
            media.removeEventListener("change", handler);
            handler.cancel();
        };
    }, [query, handler]);

    return matches;
};

export function useImageSlideshow() {
    const [image, setImage] = useState({});
    const [loadingImages, setLoadingImages] = useState([]);
    const [isStopped, stop] = useState(false);

    const nextImage = useCallback(async () => {
        if (loadingImages.length > 0) {
            const [img, ...reducedLoadingImages] = loadingImages;
            setImage(img);
            try {
                const loadedImage = await loadImage(img);
                setImage(loadedImage);
            } catch (error) {
                console.error("Failed to load image", error);
            }
            setLoadingImages(reducedLoadingImages);
        }
    }, [loadingImages]);

    const urlParams = new URLSearchParams(window.location.search);
    const nsfwParam = urlParams.get("nsfw");
    const interval = nsfwParam === "true" ? 100 : 3000;

    useInterval(() => {
        if (!isStopped) nextImage();
    }, interval);

    useEffect(() => {
        nextImage();
    }, []);

    const onNewImage = useCallback((newImage) => {
        setLoadingImages((images) => [...images, newImage]);
    }, []);

    return { image, onNewImage, stop, isStopped };
}

export function useImageEditor({ stop, image }) {
    const [isLoading, setIsLoading] = useState(false);
    const [editedImage, setEditedImage] = useState(null);
    const abortControllerRef = useRef(null);

    // Effect to reset editedImage when the source image from the slideshow changes
    useEffect(() => {
        // When the parent 'image' (from slideshow) changes, reset the internal edited state.
        // This ensures that when the feed advances, the editor doesn't hold onto old edits.
        setEditedImage(null);
    }, [image]); // Depend on the image prop from the parent (slideshow)

    const updateImage = useCallback(
        async (newImage) => {
            stop(true);
            setIsLoading(true);

            // Create new AbortController for this request
            abortControllerRef.current = new AbortController();

            try {
                console.log("Updating image with newImage:", newImage);
                console.log(
                    "Prompt being used for image update:",
                    newImage.prompt,
                );
                const loadedImage = await loadImage(newImage);
                setEditedImage(loadedImage);
            } catch (error) {
                if (error.name === "AbortError") {
                    console.log("Image loading cancelled");
                } else {
                    console.error("Error loading image:", error);
                }
            } finally {
                setIsLoading(false);
            }
        },
        [stop],
    );

    const cancelLoading = useCallback(() => {
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
            setIsLoading(false);
        }
    }, []);

    // Instead, explicitly return the editedImage if it exists, otherwise the input image
    const returnedImage = editedImage || image;

    // Return editedImage if it exists, otherwise the original image prop
    // The key name remains 'image' for compatibility with parent component
    return {
        updateImage,
        cancelLoading,
        image: returnedImage,
        isLoading,
        setIsLoading,
    };
}

const loadImage = async (newImage, retryCount = 0) => {
    const MAX_RETRIES = 3;

    try {
        const response = await fetch(newImage.imageURL);

        // Check if response is an error
        if (!response.ok) {
            // Try to parse error as JSON
            const contentType = response.headers.get("content-type");
            if (contentType && contentType.includes("application/json")) {
                const errorData = await response.json();

                // Check for rate limit (429) and retry if we have retries left
                if (response.status === 429 && retryCount < MAX_RETRIES) {
                    const retryAfter = errorData.retryAfterSeconds || 5;
                    // Cap retry wait to 30 seconds max
                    const waitTime = Math.min(retryAfter, 30) * 1000;
                    console.log(
                        `Rate limited, retrying in ${waitTime / 1000}s (attempt ${retryCount + 1}/${MAX_RETRIES})`,
                    );
                    await new Promise((resolve) =>
                        setTimeout(resolve, waitTime),
                    );
                    return loadImage(newImage, retryCount + 1);
                }

                const error = new Error(
                    errorData.error?.message ||
                        errorData.error ||
                        `HTTP ${response.status}`,
                );
                error.apiMessage =
                    errorData.error?.message || errorData.message;
                error.errorCode = errorData.error?.code || errorData.code;
                throw error;
            } else {
                // Non-JSON 429 response - retry anyway
                if (response.status === 429 && retryCount < MAX_RETRIES) {
                    const waitTime = 5000; // Default 5 seconds
                    console.log(
                        `Rate limited, retrying in ${waitTime / 1000}s (attempt ${retryCount + 1}/${MAX_RETRIES})`,
                    );
                    await new Promise((resolve) =>
                        setTimeout(resolve, waitTime),
                    );
                    return loadImage(newImage, retryCount + 1);
                }

                const errorText = await response.text();
                throw new Error(errorText || `HTTP ${response.status}`);
            }
        }

        // Check if response is JSON (error) or image
        const contentType = response.headers.get("content-type");
        if (contentType && contentType.includes("application/json")) {
            const data = await response.json();
            if (data.error) {
                const error = new Error(data.error?.message || data.error);
                error.apiMessage = data.error?.message || data.message;
                error.errorCode = data.error?.code || data.code;
                throw error;
            }
        }

        // If we got here, it's a valid image
        // Create blob URL to avoid double-fetch when rendering <img>
        const blob = await response.blob();
        const blobUrl = URL.createObjectURL(blob);

        return new Promise((resolve, reject) => {
            const img = new Image();
            img.src = blobUrl;
            img.onload = () => {
                // Return the blob URL as imageURL to prevent another network request
                resolve({
                    ...newImage,
                    imageURL: blobUrl,
                    originalURL: newImage.imageURL,
                    loaded: true,
                });
            };
            img.onerror = (error) => {
                URL.revokeObjectURL(blobUrl);
                reject(error);
            };
        });
    } catch (error) {
        // Return the image with error info so it can be displayed
        return {
            ...newImage,
            loaded: true,
            error: error.message,
            message: error.apiMessage,
            errorCode: error.errorCode,
        };
    }
};
