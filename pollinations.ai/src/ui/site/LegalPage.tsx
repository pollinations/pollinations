import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import rehypeSlug from "rehype-slug";
import remarkGfm from "remark-gfm";

type LegalPageProps = {
    /** Path under public/legal, e.g. "/legal/PRIVACY_POLICY.md" */
    markdownPath: string;
    /** Used in the failure message, e.g. "privacy policy" */
    errorLabel: string;
};

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

    return (
        <div>
            {failed ? (
                <p className="text-theme-text-base">
                    The {errorLabel} could not be loaded. Please try again.
                </p>
            ) : markdown === null ? (
                <p className="text-theme-text-muted">Loading…</p>
            ) : (
                <div className="max-w-3xl [&_a]:text-theme-text-soft [&_a]:underline [&_h1]:mb-6 [&_h1]:font-heading [&_h1]:text-4xl [&_h1]:text-theme-text-strong [&_h2]:mt-10 [&_h2]:mb-3 [&_h2]:font-subheading [&_h2]:text-2xl [&_h2]:text-theme-text-strong [&_h3]:mt-6 [&_h3]:mb-2 [&_h3]:font-semibold [&_h3]:text-theme-text-strong [&_li]:mb-1 [&_p]:mb-4 [&_p]:leading-relaxed [&_p]:text-theme-text-base [&_ul]:mb-4 [&_ul]:list-disc [&_ul]:pl-6">
                    <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        rehypePlugins={[rehypeSlug]}
                    >
                        {markdown}
                    </ReactMarkdown>
                </div>
            )}
        </div>
    );
}
