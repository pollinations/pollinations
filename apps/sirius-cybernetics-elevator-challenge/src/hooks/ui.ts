import { useEffect, useRef } from "react";
import type { Message } from "@/types";

// Scroll management hook - scrolls container only, not whole page
export const useMessageScroll = (messages: Message[]) => {
    const ref = useRef<HTMLDivElement>(null);
    // biome-ignore lint/correctness/useExhaustiveDependencies: messages is intentionally a dependency - scroll should trigger when messages change
    useEffect(() => {
        // Use scrollIntoView with block: 'nearest' to avoid page scroll jumps
        ref.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }, [messages]);
    return ref;
};

// Input focus management hook
export const useInput = (isLoading: boolean) => {
    const ref = useRef<HTMLInputElement>(null);
    useEffect(() => {
        if (!isLoading && ref.current) {
            ref.current.focus();
        }
    }, [isLoading]);
    return { inputRef: ref };
};
