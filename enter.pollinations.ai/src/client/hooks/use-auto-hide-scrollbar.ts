import { useEffect, useRef } from "react";

export function useAutoHideScrollbar<T extends HTMLElement>(
    enabled = true,
    hideDelayMs = 2000,
) {
    const ref = useRef<T | null>(null);

    useEffect(() => {
        if (!enabled) return;

        const element = ref.current;
        if (!element) return;

        let hideTimer: number | null = null;

        const clearHideTimer = () => {
            if (hideTimer !== null) {
                window.clearTimeout(hideTimer);
                hideTimer = null;
            }
        };

        const showScrollbar = () => {
            element.dataset.scrollbarActive = "true";
            clearHideTimer();
        };

        const hideScrollbar = () => {
            element.dataset.scrollbarActive = "false";
            clearHideTimer();
        };

        const scheduleHide = () => {
            clearHideTimer();
            hideTimer = window.setTimeout(() => {
                hideScrollbar();
            }, hideDelayMs);
        };

        const handleInteraction = () => {
            showScrollbar();
            scheduleHide();
        };

        hideScrollbar();

        element.addEventListener("scroll", handleInteraction, {
            passive: true,
        });
        element.addEventListener("wheel", handleInteraction, {
            passive: true,
        });
        element.addEventListener("touchstart", handleInteraction, {
            passive: true,
        });
        element.addEventListener("pointerdown", handleInteraction);
        element.addEventListener("keydown", handleInteraction);
        element.addEventListener("focusin", handleInteraction);
        element.addEventListener("focusout", scheduleHide);

        return () => {
            clearHideTimer();
            element.removeEventListener("scroll", handleInteraction);
            element.removeEventListener("wheel", handleInteraction);
            element.removeEventListener("touchstart", handleInteraction);
            element.removeEventListener("pointerdown", handleInteraction);
            element.removeEventListener("keydown", handleInteraction);
            element.removeEventListener("focusin", handleInteraction);
            element.removeEventListener("focusout", scheduleHide);
        };
    }, [enabled, hideDelayMs]);

    return ref;
}
