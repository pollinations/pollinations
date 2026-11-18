import { ContentHeader } from "@pollinations/ui";
import { Prose } from "@pollinations/ui/markdown";
import { useLocation } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAsync } from "../../data/useAsync";

const previousHeadingIds = new Map([
    ["6-pollen-fees-taxes--billing", "6-balance-fees-taxes--billing"],
    [
        "refunds--cancellations-digital-api-services--pollen",
        "refunds--cancellations-digital-api-services--credit",
    ],
    ["1-pollen-is-digital-api-credit", "1-your-balance-is-digital-api-credit"],
]);

type LegalPageProps = {
    /** Path under public/legal, e.g. "/legal/PRIVACY_POLICY.md" */
    markdownPath: string;
    /** Used in the failure message, e.g. "privacy policy" */
    errorLabel: string;
};

/**
 * Rendering is @pollinations/ui's Prose — the same document treatment enter
 * uses, rather than a second set of heading and list styles maintained here.
 * The file's leading "# Title" becomes the page title, so legal pages get the
 * same full-size header as every other route. On phones the top padding keeps
 * it clear of the floating menu pill; loading and failure use the same box,
 * so nothing shifts when the text arrives.
 */
export function LegalPage({ markdownPath, errorLabel }: LegalPageProps) {
    const hash = useLocation({ select: (location) => location.hash });
    const { data: markdown, failed } = useAsync<string | null>(async () => {
        const response = await fetch(markdownPath);
        if (!response.ok) throw new Error(String(response.status));
        return response.text();
    }, null);
    const [, title, body] =
        markdown?.match(/^#[ \t]+(.+)\r?\n([\s\S]*)$/) ?? [];

    // The router can try to scroll before the Markdown headings exist.
    useEffect(() => {
        if (markdown && hash) {
            const id = previousHeadingIds.get(hash) ?? hash;
            document.getElementById(id)?.scrollIntoView();
        }
    }, [markdown, hash]);

    return (
        <article className="flex max-w-3xl flex-col gap-6 max-sm:pt-12">
            {failed ? (
                <p className="text-theme-text-base">
                    The {errorLabel} could not be loaded. Please try again.
                </p>
            ) : markdown === null ? (
                <p className="text-theme-text-muted">Loading…</p>
            ) : (
                <>
                    {title ? (
                        <ContentHeader
                            eyebrow={null}
                            title={title}
                            variant="page"
                        />
                    ) : null}
                    <Prose>{title ? body : markdown}</Prose>
                </>
            )}
        </article>
    );
}
