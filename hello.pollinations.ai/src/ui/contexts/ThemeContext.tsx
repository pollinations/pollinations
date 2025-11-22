import { createContext, useContext, useState } from "react";
import type { ReactNode } from "react";
import { DefaultTheme } from "../../content/theme/defaultTheme";
import {
    processTheme,
    themeToDictionary,
    dictionaryToTheme,
} from "../../content/theme/themeUtils";
import { TokenId } from "../../content/theme/tokens";

// ThemeDefinition is now Hex -> IDs
type ThemeDefinition = Record<string, TokenId[]>;

const DefaultThemeDefinition = themeToDictionary(DefaultTheme);

interface ThemeContextValue {
    themeDefinition: ThemeDefinition;
    setTheme: (newTheme: ThemeDefinition) => void;
    resetTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

export function ThemeProvider({ children }: { children: ReactNode }) {
    const [themeDefinition, setThemeDefinition] = useState<ThemeDefinition>(
        DefaultThemeDefinition
    );

    const setTheme = (newTheme: ThemeDefinition) => {
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
