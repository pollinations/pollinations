import { Prose } from "@pollinations/ui/markdown";
import { useEffect, useState } from "react";

type LegalPageProps = {
    /** Path under public/legal, e.g. "/legal/PRIVACY_POLICY.md" */
    markdownPath: string;
    /** Used in the failure message, e.g. "privacy policy" */
    errorLabel: string;
};

/**
 * Rendering is @pollinations/ui's Prose — the same document treatment enter
 * uses, rather than a second set of heading and list styles maintained here.
 */
export function LegalPage({ markdownPath, errorLabel }: LegalPageProps) {
    const [markdown, setMarkdown] = useState<string | null>(null);
    const [failed, setFailed] = useState(false);

    useEffect(() => {
        let cancelled = false;
        setMarkdown(null);
        setFailed(false);

        fetch(markdownPath)
            .then((response) => {
                if (!response.ok) throw new Error(String(response.status));
                return response.text();
            })
            .then((text) => {
                if (!cancelled) setMarkdown(text);
            })
            .catch(() => {
                if (!cancelled) setFailed(true);
            });

        return () => {
            cancelled = true;
        };
    }, [markdownPath]);

    if (failed) {
        return (
            <p className="text-theme-text-base">
                The {errorLabel} could not be loaded. Please try again.
            </p>
        );
    }
    if (markdown === null) {
        return <p className="text-theme-text-muted">Loading…</p>;
    }
    return <Prose className="max-w-3xl">{markdown}</Prose>;
}
