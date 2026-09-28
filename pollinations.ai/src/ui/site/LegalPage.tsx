import { Prose } from "@pollinations/ui/markdown";
import { useAsync } from "../../data/useAsync";

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
    const { data: markdown, failed } = useAsync<string | null>(async () => {
        const response = await fetch(markdownPath);
        if (!response.ok) throw new Error(String(response.status));
        return response.text();
    }, null);

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
