import { useEffect } from "react";

/**
 * Sets document title and meta description for the current page.
 * Resets to defaults on unmount.
 */
export function useDocumentMeta(title: string, description?: string) {
    useEffect(() => {
        const prev = document.title;
        document.title = `${title} — pollinations.ai`;

        let metaDesc: HTMLMetaElement | null = null;
        let prevContent: string | null = null;
        if (description) {
            metaDesc = document.querySelector('meta[name="description"]');
            if (metaDesc) {
                prevContent = metaDesc.getAttribute("content");
                metaDesc.setAttribute("content", description);
            }
        }

        return () => {
            document.title = prev;
            if (metaDesc && prevContent !== null) {
                metaDesc.setAttribute("content", prevContent);
            }
        };
    }, [title, description]);
}
