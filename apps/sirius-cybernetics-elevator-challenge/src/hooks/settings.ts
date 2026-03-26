import { useCallback, useEffect, useState } from "react";
import type { AnimationMode, AppSettings } from "@/types";

const STORAGE_KEY = "sirius-elevator-settings";

const DEFAULT_SETTINGS: AppSettings = {
    animationMode: "lottie",
};

export const useSettings = () => {
    const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
    const [isLoaded, setIsLoaded] = useState(false);

    // Load settings from localStorage on mount
    useEffect(() => {
        try {
            const stored = localStorage.getItem(STORAGE_KEY);
            if (stored) {
                const parsed = JSON.parse(stored) as Partial<AppSettings>;
                setSettings({ ...DEFAULT_SETTINGS, ...parsed });
            }
        } catch (error) {
            console.error("Failed to load settings:", error);
        }
        setIsLoaded(true);
    }, []);

    // Save settings to localStorage whenever they change
    useEffect(() => {
        if (isLoaded) {
            try {
                localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
            } catch (error) {
                console.error("Failed to save settings:", error);
            }
        }
    }, [settings, isLoaded]);

    const setAnimationMode = useCallback((mode: AnimationMode) => {
        setSettings((prev) => ({ ...prev, animationMode: mode }));
    }, []);

    return {
        settings,
        isLoaded,
        setAnimationMode,
        animationMode: settings.animationMode,
    };
};

export default useSettings;
