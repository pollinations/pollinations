import { useCallback } from "react";
import {
    isColorToken,
    isFontToken,
    isOpacityToken,
    isRadiusToken,
} from "../utils/token-helpers";

type BucketState<T> = Record<string, { tokens: string[] } & T>;

export function useDragAndDrop<T>(
    setState: React.Dispatch<React.SetStateAction<BucketState<T>>>,
    tokenFilter: (token: string) => boolean,
) {
    const handleDrop = useCallback(
        (e: React.DragEvent, targetBucketId: string) => {
            e.preventDefault();
            const token = e.dataTransfer.getData("text/plain");

            if (!token || !tokenFilter(token)) {
                return;
            }

            setState((prev) => {
                const newState = { ...prev };

                // Remove token from all buckets
                Object.keys(newState).forEach((bucketId) => {
                    newState[bucketId] = {
                        ...newState[bucketId],
                        tokens: newState[bucketId].tokens.filter(
                            (t) => t !== token,
                        ),
                    };
                });

                // Add to target bucket
                if (!newState[targetBucketId].tokens.includes(token)) {
                    newState[targetBucketId] = {
                        ...newState[targetBucketId],
                        tokens: [...newState[targetBucketId].tokens, token],
                    };
                }

                return newState;
            });
        },
        [setState, tokenFilter],
    );

    const handleDragOver = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
    }, []);

    return { handleDrop, handleDragOver };
}

// Specific token filters
export const colorTokenFilter = (token: string) => isColorToken(token);
export const radiusTokenFilter = (token: string) => isRadiusToken(token);
export const fontTokenFilter = (token: string) => isFontToken(token);
export const opacityTokenFilter = (token: string) => isOpacityToken(token);
