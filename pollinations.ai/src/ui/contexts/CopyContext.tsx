/**
 * Copy Context
 * Manages per-page copy processing with language detection and variation
 *
 * Flow:
 * 1. Detects current page from URL
 * 2. Processes only that page's copy via LLM
 * 3. Shows progress on translate button
 * 4. Resets when page changes
 */

import type { ReactNode } from "react";
import { createContext, useContext, useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { applyTranslations, extractCopyItems, processCopy } from "../../copy";
import { APPS_PAGE } from "../../copy/content/apps";
import { COMMUNITY_PAGE } from "../../copy/content/community";
import { DOCS_PAGE } from "../../copy/content/docs";
// Import page-specific copy
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
    variationSeed: number;
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

    // Fixed seed for caching - variation can be re-added later
    const variationSeed = 1;

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

        // Deep clone the page's copy
        const copyClone = JSON.parse(JSON.stringify(pageCopy));
        const { items, pointers } = extractCopyItems(copyClone);

        if (items.length === 0) {
            setIsProcessing(false);
            return;
        }

        processCopy(items, language, variationSeed)
            .then((processed) => {
                applyTranslations(processed, pointers);
                setProcessedCopy(copyClone);
            })
            .catch(console.error)
            .finally(() => setIsProcessing(false));
    }, [currentPage, language]);

    return (
        <CopyContext.Provider
            value={{
                language,
                languageOverride,
                variationSeed,
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
