import { useEffect } from "react";

/**
 * Sets document title, meta description, and canonical URL for the current page.
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

        // Update canonical to current page path (no query params)
        const canonical = document.querySelector<HTMLLinkElement>(
            'link[rel="canonical"]',
        );
        const prevHref = canonical?.getAttribute("href") ?? null;
        if (canonical) {
            canonical.setAttribute(
                "href",
                `https://enter.pollinations.ai${window.location.pathname}`,
            );
        }

        return () => {
            document.title = prev;
            if (metaDesc && prevContent !== null) {
                metaDesc.setAttribute("content", prevContent);
            }
            if (canonical && prevHref !== null) {
                canonical.setAttribute("href", prevHref);
            }
        };
    }, [title, description]);
}
