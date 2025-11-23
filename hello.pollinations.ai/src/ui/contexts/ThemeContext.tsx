import { createContext, useContext, useState, useCallback } from "react";
import type { ReactNode } from "react";
import { PRESETS } from "../../content/presets";
import {
    processTheme,
    themeToDictionary,
    dictionaryToTheme,
    type ThemeDictionary,
} from "../../content/theme/engine";
import type { ThemeCopy } from "../../content/buildPrompts";

// Select a random preset on module load
const randomPreset = PRESETS[Math.floor(Math.random() * PRESETS.length)];
const DefaultThemeDefinition = themeToDictionary(randomPreset.theme);
const DefaultThemeCopy = randomPreset.copy;

interface ThemeContextValue {
    themeDefinition: ThemeDictionary;
    themePrompt: string | null;
    presetCopy: ThemeCopy | null;
    setTheme: (
        newTheme: ThemeDictionary,
        prompt?: string,
        copy?: ThemeCopy
    ) => void;
    resetTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

export function ThemeProvider({ children }: { children: ReactNode }) {
    const [themeDefinition, setThemeDefinition] = useState<ThemeDictionary>(
        DefaultThemeDefinition
    );
    const [themePrompt, setThemePrompt] = useState<string | null>(
        randomPreset.name
    );
    const [presetCopy, setPresetCopy] = useState<ThemeCopy | null>(
        DefaultThemeCopy || null
    );

    const setTheme = useCallback(
        (newTheme: ThemeDictionary, prompt?: string, copy?: ThemeCopy) => {
            setThemeDefinition(newTheme);
            if (prompt) setThemePrompt(prompt);
            if (copy) setPresetCopy(copy);
            // Also apply CSS variables
            const theme = dictionaryToTheme(newTheme);
            const { cssVariables } = processTheme(theme);
            const root = document.documentElement;
            Object.entries(cssVariables).forEach(([key, value]) => {
                root.style.setProperty(key, value);
            });
        },
        []
    );

    const resetTheme = useCallback(() => {
        setTheme(DefaultThemeDefinition);
        setThemePrompt(null);
        setPresetCopy(null);
    }, [setTheme]);

    return (
        <ThemeContext.Provider
            value={{
                themeDefinition,
                themePrompt,
                presetCopy,
                setTheme,
                resetTheme,
            }}
        >
            {children}
        </ThemeContext.Provider>
    );
}

export function useTheme() {
    const context = useContext(ThemeContext);
    if (!context) {
        throw new Error("useTheme must be used within a ThemeProvider");
    }
    return context;
}
