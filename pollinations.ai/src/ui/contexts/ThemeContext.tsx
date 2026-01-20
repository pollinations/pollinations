import type { ReactNode } from "react";
import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useState,
} from "react";
import { PRESETS } from "../../theme/presets";
import {
    dictionaryToTheme,
    processTheme,
    type ThemeDictionary,
    themeToDictionary,
} from "../../theme/style/theme-processor";

// Randomly select a preset for initial theme (visual only - no copy)
const initialPreset = PRESETS[Math.floor(Math.random() * PRESETS.length)];

const DefaultThemeDefinition = themeToDictionary(initialPreset.theme);
const DefaultBackgroundHtml = initialPreset.backgroundHtml || null;

interface ThemeContextValue {
    themeDefinition: ThemeDictionary;
    themePrompt: string | null;
    backgroundHtml: string | null;
    setTheme: (
        newTheme: ThemeDictionary,
        prompt?: string,
        backgroundHtml?: string,
    ) => void;
    resetTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

export function ThemeProvider({ children }: { children: ReactNode }) {
    const [themeDefinition, setThemeDefinition] = useState<ThemeDictionary>(
        DefaultThemeDefinition,
    );
    const [themePrompt, setThemePrompt] = useState<string | null>(
        initialPreset.id,
    );
    const [backgroundHtml, setBackgroundHtml] = useState<string | null>(
        DefaultBackgroundHtml,
    );

    // Apply initial theme CSS variables on mount
    useEffect(() => {
        const theme = dictionaryToTheme(DefaultThemeDefinition);
        const { cssVariables } = processTheme(theme);
        const root = document.documentElement;
        Object.entries(cssVariables).forEach(([key, value]) => {
            root.style.setProperty(key, value);
        });
    }, []);

    const setTheme = useCallback(
        (
            newTheme: ThemeDictionary,
            prompt?: string,
            newBackgroundHtml?: string,
        ) => {
            setThemeDefinition(newTheme);
            if (prompt) setThemePrompt(prompt);
            if (newBackgroundHtml !== undefined) {
                setBackgroundHtml(newBackgroundHtml);
            }

            // Also apply CSS variables
            const theme = dictionaryToTheme(newTheme);
            const { cssVariables } = processTheme(theme);
            const root = document.documentElement;
            Object.entries(cssVariables).forEach(([key, value]) => {
                root.style.setProperty(key, value);
            });
        },
        [],
    );

    const resetTheme = useCallback(() => {
        setTheme(DefaultThemeDefinition, initialPreset.id, "");
    }, [setTheme]);

    return (
        <ThemeContext.Provider
            value={{
                themeDefinition,
                themePrompt,
                backgroundHtml,
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
