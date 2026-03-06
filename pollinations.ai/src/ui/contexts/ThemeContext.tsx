import type { ReactNode } from "react";
import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useState,
} from "react";
import { DEFAULT_PRESET } from "../../theme/presets";
import {
    dictionaryToTheme,
    processTheme,
    type ThemeDictionary,
    themeToDictionary,
} from "../../theme/style/theme-processor";

const DefaultThemeDefinition = themeToDictionary(DEFAULT_PRESET.theme);

interface ThemeContextValue {
    themeDefinition: ThemeDictionary;
    setTheme: (newTheme: ThemeDictionary) => void;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

export function ThemeProvider({ children }: { children: ReactNode }) {
    const [themeDefinition, setThemeDefinition] = useState<ThemeDictionary>(
        DefaultThemeDefinition,
    );

    // Apply theme CSS variables
    const applyTheme = useCallback((definition: ThemeDictionary) => {
        const theme = dictionaryToTheme(definition);
        const { cssVariables } = processTheme(theme);
        const root = document.documentElement;
        for (const [key, value] of Object.entries(cssVariables)) {
            root.style.setProperty(key, value);
        }
    }, []);

    // Apply initial theme on mount
    useEffect(() => {
        applyTheme(DefaultThemeDefinition);
    }, [applyTheme]);

    const setTheme = useCallback(
        (newTheme: ThemeDictionary) => {
            setThemeDefinition(newTheme);
            applyTheme(newTheme);
        },
        [applyTheme],
    );

    return (
        <ThemeContext.Provider
            value={{
                themeDefinition,
                setTheme,
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
