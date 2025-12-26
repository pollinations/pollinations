/**
 * Copy Context
 * Provides language state for translation hooks
 */

import type { ReactNode } from "react";
import { createContext, useContext, useState } from "react";

interface CopyContextValue {
    language: string;
    languageOverride: "auto" | "en";
    setLanguageOverride: (lang: "auto" | "en") => void;
}

const CopyContext = createContext<CopyContextValue | undefined>(undefined);

/**
 * Get browser language code (e.g., "en", "zh", "es")
 */
function getBrowserLanguage(): string {
    const lang = navigator.language.split("-")[0];
    return lang || "en";
}

export function CopyProvider({ children }: { children: ReactNode }) {
    const [languageOverride, setLanguageOverride] = useState<"auto" | "en">(
        "auto",
    );

    // Calculate effective language
    const language = languageOverride === "en" ? "en" : getBrowserLanguage();

    return (
        <CopyContext.Provider
            value={{
                language,
                languageOverride,
                setLanguageOverride,
            }}
        >
            {children}
        </CopyContext.Provider>
    );
}

export function useCopy() {
    const context = useContext(CopyContext);
    if (!context) {
        throw new Error("useCopy must be used within a CopyProvider");
    }
    return context;
}
