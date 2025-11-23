import { createContext, useContext, type ReactNode } from "react";
import { useTheme } from "./ThemeContext";

interface PageCopyContextValue {
    getPageCopy: <T>(pageName: string) => T;
}

const PageCopyContext = createContext<PageCopyContextValue | undefined>(
    undefined
);

export function PageCopyProvider({ children }: { children: ReactNode }) {
    const { presetCopy } = useTheme();

    const getPageCopy = <T,>(pageName: string): T => {
        // All presets must have complete copy - no fallback
        if (!presetCopy) {
            throw new Error("Preset copy is required but not found");
        }

        const pageCopyData = presetCopy[pageName as keyof typeof presetCopy];
        if (!pageCopyData) {
            throw new Error(
                `Page copy for ${pageName} is required but not found in preset`
            );
        }

        return pageCopyData as T;
    };

    return (
        <PageCopyContext.Provider value={{ getPageCopy }}>
            {children}
        </PageCopyContext.Provider>
    );
}

export function usePageCopy<T>(pageName: string): T {
    const context = useContext(PageCopyContext);
    if (!context) {
        throw new Error("usePageCopy must be used within a PageCopyProvider");
    }

    return context.getPageCopy<T>(pageName);
}
