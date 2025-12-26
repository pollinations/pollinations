/**
 * Copy Context
 * Manages per-page copy translation with language detection
 *
 * Flow:
 * 1. Detects current page from URL
 * 2. Extracts flat strings from page copy
 * 3. Translates via LLM (arrays handled by useTranslate in components)
 * 4. Rebuilds copy object with translated strings
 */

import type { ReactNode } from "react";
import { createContext, useContext, useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { processCopy } from "../../copy/translation/process";
import { APPS_PAGE } from "../../copy/content/apps";
import { COMMUNITY_PAGE } from "../../copy/content/community";
import { DOCS_PAGE } from "../../copy/content/docs";
import { HELLO_PAGE } from "../../copy/content/hello";
import { PLAY_PAGE } from "../../copy/content/play";

// Map routes to their copy content
const PAGE_COPY: Record<string, Record<string, unknown>> = {
    "/": HELLO_PAGE,
    "/play": PLAY_PAGE,
    "/create": PLAY_PAGE,
    "/feed": PLAY_PAGE,
    "/docs": DOCS_PAGE,
    "/community": COMMUNITY_PAGE,
    "/apps": APPS_PAGE,
};

interface CopyContextValue {
    language: string;
    languageOverride: "auto" | "en";
    isProcessing: boolean;
    currentPage: string;
    processedCopy: Record<string, unknown> | null;
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

/**
 * Get page key from pathname
 */
function getPageKey(pathname: string): string {
    // Match exact routes or return the base path
    if (PAGE_COPY[pathname]) return pathname;
    // Check for partial matches (e.g., /docs/something -> /docs)
    const basePath = "/" + pathname.split("/")[1];
    return PAGE_COPY[basePath] ? basePath : "/";
}

export function CopyProvider({ children }: { children: ReactNode }) {
    const location = useLocation();
    const [languageOverride, setLanguageOverride] = useState<"auto" | "en">(
        "auto",
    );
    const [isProcessing, setIsProcessing] = useState(false);
    const [processedCopy, setProcessedCopy] = useState<Record<
        string,
        unknown
    > | null>(null);

    // Calculate effective language
    const language = languageOverride === "en" ? "en" : getBrowserLanguage();

    // Get current page key
    const currentPage = getPageKey(location.pathname);

    // Process copy when page or language changes
    useEffect(() => {
        const pageCopy = PAGE_COPY[currentPage];
        if (!pageCopy) {
            return;
        }

        // If English, use original copy directly
        if (language === "en") {
            setProcessedCopy(pageCopy);
            return;
        }

        setIsProcessing(true);
        setProcessedCopy(pageCopy); // Show original while processing

        // Extract flat strings only (arrays handled by useTranslate in components)
        const items = Object.entries(pageCopy)
            .filter(([_, v]) => typeof v === "string")
            .map(([id, text]) => ({ id, text: text as string }));

        if (items.length === 0) {
            setIsProcessing(false);
            return;
        }

        processCopy(items, language)
            .then((translated) => {
                // Rebuild copy with translated strings
                const result = { ...pageCopy };
                for (const { id, text } of translated) {
                    result[id] = text;
                }
                setProcessedCopy(result);
            })
            .catch(console.error)
            .finally(() => setIsProcessing(false));
    }, [currentPage, language]);

    return (
        <CopyContext.Provider
            value={{
                language,
                languageOverride,
                isProcessing,
                currentPage,
                processedCopy,
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
