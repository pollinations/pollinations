import { createContext, useContext, type ReactNode } from "react";
import { useTheme } from "./ThemeContext";

interface PageCopyContextValue {
    getPageCopy: <T>(pageName: string, originalPage: T) => T;
}

const PageCopyContext = createContext<PageCopyContextValue | undefined>(
    undefined
);

export function PageCopyProvider({ children }: { children: ReactNode }) {
    const { presetCopy } = useTheme();

    const getPageCopy = <T,>(pageName: string, originalPage: T): T => {
        // Priority 1: Use preset copy if available
        if (presetCopy?.[pageName as keyof typeof presetCopy]) {
            return presetCopy[pageName as keyof typeof presetCopy] as T;
        }
        
        // Priority 2: Fallback to original
        return originalPage;
    };

    return (
        <PageCopyContext.Provider value={{ getPageCopy }}>
            {children}
        </PageCopyContext.Provider>
    );
}

export function usePageCopy<T>(pageName: string, originalPage: T): T {
    const context = useContext(PageCopyContext);
    if (!context) {
        throw new Error("usePageCopy must be used within a PageCopyProvider");
    }

    return context.getPageCopy(pageName, originalPage);
}
