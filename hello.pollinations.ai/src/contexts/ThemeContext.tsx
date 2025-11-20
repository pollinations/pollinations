import { createContext, useContext, useState, useMemo } from "react";
import type { ReactNode } from "react";
import {
    ThemeDefinition as DefaultThemeDefinition,
    Tokens as DefaultTokens,
} from "../config/colors";

// Generate tokens from a theme definition
function generateTokens(themeDef: Record<string, string[]>) {
    // biome-ignore lint/suspicious/noExplicitAny: Dynamic nested object construction
    const tokens: any = {};

    Object.entries(themeDef).forEach(([hexColor, paths]) => {
        paths.forEach((path) => {
            const parts = path.split(".");
            let current = tokens;
            for (let i = 0; i < parts.length; i++) {
                const part = parts[i];
                if (i === parts.length - 1) {
                    current[part] = hexColor;
                } else {
                    current[part] = current[part] || {};
                    current = current[part];
                }
            }
        });
    });

    return tokens;
}

interface ThemeContextValue {
    tokens: typeof DefaultTokens;
    themeDefinition: Record<string, string[]>;
    setTheme: (newTheme: Record<string, string[]>) => void;
    resetTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

export function ThemeProvider({ children }: { children: ReactNode }) {
    const [themeDefinition, setThemeDefinition] = useState<
        Record<string, string[]>
    >(DefaultThemeDefinition);

    // Generate tokens whenever theme changes
    const tokens = useMemo(
        () => generateTokens(themeDefinition),
        [themeDefinition]
    );

    const setTheme = (newTheme: Record<string, string[]>) => {
        setThemeDefinition(newTheme);
    };

    const resetTheme = () => {
        setThemeDefinition(DefaultThemeDefinition);
    };

    return (
        <ThemeContext.Provider
            value={{ tokens, themeDefinition, setTheme, resetTheme }}
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
