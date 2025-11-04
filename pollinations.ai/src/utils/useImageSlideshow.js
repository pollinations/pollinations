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
    const [error, setError] = useState(null);
    const abortControllerRef = useRef(null);

    // Effect to reset editedImage when the source image from the slideshow changes
    useEffect(() => {
        // When the parent 'image' (from slideshow) changes, reset the internal edited state.
        // This ensures that when the feed advances, the editor doesn't hold onto old edits.
        setEditedImage(null);
        setError(null);
    }, [image]); // Depend on the image prop from the parent (slideshow)

    const updateImage = useCallback(
        async (newImage) => {
            stop(true);
            setIsLoading(true);
            setError(null);

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
                setError(null);
            } catch (error) {
                if (error.name === "AbortError") {
                    console.log("Image loading cancelled");
                } else {
                    console.error("Error loading image:", error);
                    setError(error.message);
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
        error,
    };
}

const loadImage = async (newImage) => {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.src = newImage.imageURL;
        
        img.onload = () => {
            resolve({
                ...newImage,
                loaded: true,
            });
        };
        
        img.onerror = async () => {
            // Image failed to load, fetch to get error details
            try {
                const response = await fetch(newImage.imageURL);
                const text = await response.text();
                
                // Try to parse as JSON for error message
                try {
                    const json = JSON.parse(text);
                    reject(new Error(json.error || json.message || "Failed to load image"));
                } catch {
                    reject(new Error(text || "Failed to load image"));
                }
            } catch {
                reject(new Error("Failed to load image"));
            }
        };
    });
};
