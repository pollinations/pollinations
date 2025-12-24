// @ts-check
/** @type {React.FC} */
import {
    createContext,
    useContext,
    useState,
    useCallback,
    useEffect,
} from "react";
import type { ReactNode } from "react";
import { PRESETS } from "../../theme/presets";
import {
    processTheme,
    themeToDictionary,
    dictionaryToTheme,
    type ThemeDictionary,
} from "../../theme/style/theme-processor";
import type { ThemeCopy } from "../../theme/buildPrompts";

// All presets must have copy defined - randomly select one
const initialPreset = PRESETS[Math.floor(Math.random() * PRESETS.length)];

if (!initialPreset.copy) {
    throw new Error(
        `Preset "${initialPreset.id}" is missing copy. All presets must have copy defined.`
    );
}

const DefaultThemeDefinition = themeToDictionary(initialPreset.theme);
const DefaultThemeCopy = initialPreset.copy;
const DefaultBackgroundHtml = initialPreset.backgroundHtml || null;

interface ThemeContextValue {
    themeDefinition: ThemeDictionary;
    themePrompt: string | null;
    presetCopy: ThemeCopy;
    backgroundHtml: string | null;
    setTheme: (
        newTheme: ThemeDictionary,
        prompt?: string,
        copy?: ThemeCopy,
        backgroundHtml?: string
    ) => void;
    resetTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

export function ThemeProvider({ children }: { children: ReactNode }) {
    const [themeDefinition, setThemeDefinition] = useState<ThemeDictionary>(
        DefaultThemeDefinition
    );
    const [themePrompt, setThemePrompt] = useState<string | null>(
        initialPreset.id
    );
    const [presetCopy, setPresetCopy] = useState<ThemeCopy>(DefaultThemeCopy);
    const [backgroundHtml, setBackgroundHtml] = useState<string | null>(
        DefaultBackgroundHtml
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
            copy?: ThemeCopy,
            newBackgroundHtml?: string
        ) => {
            setThemeDefinition(newTheme);
            if (prompt) setThemePrompt(prompt);
            if (copy) {
                setPresetCopy(copy);
            }
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
        []
    );

    const resetTheme = useCallback(() => {
        setTheme(
            DefaultThemeDefinition,
            initialPreset.id,
            DefaultThemeCopy,
            ""
        );
    }, [setTheme]);

    return (
        <ThemeContext.Provider
            value={{
                themeDefinition,
                themePrompt,
                presetCopy,
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
