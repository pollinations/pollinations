import { createContext, useContext, useState } from "react";
import type { ReactNode } from "react";
import { ClassicTheme } from "../../content/theme/presets/classic";
import {
    processTheme,
    themeToDictionary,
    dictionaryToTheme,
    type ThemeDictionary,
} from "../../content/theme/engine";

const DefaultThemeDefinition = themeToDictionary(ClassicTheme);

interface ThemeContextValue {
    themeDefinition: ThemeDictionary;
    setTheme: (newTheme: ThemeDictionary) => void;
    resetTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

export function ThemeProvider({ children }: { children: ReactNode }) {
    const [themeDefinition, setThemeDefinition] = useState<ThemeDictionary>(
        DefaultThemeDefinition
    );

    const setTheme = (newTheme: ThemeDictionary) => {
        setThemeDefinition(newTheme);
        // Also apply CSS variables
        const theme = dictionaryToTheme(newTheme);
        const { cssVariables } = processTheme(theme);
        const root = document.documentElement;
        Object.entries(cssVariables).forEach(([key, value]) => {
            root.style.setProperty(key, value);
        });
    };

    const resetTheme = () => {
        setTheme(DefaultThemeDefinition);
    };

    return (
        <ThemeContext.Provider
            value={{ themeDefinition, setTheme, resetTheme }}
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
