import { useEffect, useRef } from "react";
import type { Message } from "@/types";

// Scroll management hook
export const useMessageScroll = (_messages: Message[]) => {
    const ref = useRef<HTMLDivElement>(null);
    useEffect(() => {
        ref.current?.scrollIntoView({ behavior: "smooth" });
    }, []);
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
