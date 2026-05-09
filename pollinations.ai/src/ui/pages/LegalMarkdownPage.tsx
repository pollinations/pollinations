import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useDocumentMeta } from "../../hooks/useDocumentMeta";

type LegalMarkdownPageProps = {
    pageTitle: string;
    pageDescription: string;
    markdownPath: string;
    errorLabel: string;
};

function LegalMarkdownPage({
    pageTitle,
    pageDescription,
    markdownPath,
    errorLabel,
}: LegalMarkdownPageProps) {
    useDocumentMeta(pageTitle, pageDescription);
    const [content, setContent] = useState("");

    useEffect(() => {
        fetch(markdownPath)
            .then((response) => response.text())
            .then((text) => setContent(text))
            .catch((error) =>
                console.error(`Error loading ${errorLabel}:`, error),
            );
    }, [errorLabel, markdownPath]);

    return (
        <div className="w-full max-w-4xl mx-auto px-4 py-8 md:py-16">
            <div className="bg-cream border-r-8 border-b-8 border-dark shadow-dark-xl p-8 md:p-16">
                <div className="prose prose-sm md:prose max-w-none">
                    <div className="markdown-content">
                        <ReactMarkdown
                            remarkPlugins={[remarkGfm]}
                            components={{
                                h1: ({ node: _node, ...props }) => (
                                    <h1
                                        {...props}
                                        className="font-headline text-xl md:text-2xl font-black text-dark uppercase tracking-widest mb-8 border-l-8 border-dark pl-4"
                                    />
                                ),
                                h2: ({ node: _node, ...props }) => (
                                    <h2
                                        {...props}
                                        className="font-headline text-base md:text-lg font-black text-dark uppercase tracking-widest mt-12 mb-6 border-l-4 border-dark pl-4"
                                    />
                                ),
                                h3: ({ node: _node, ...props }) => (
                                    <h3
                                        {...props}
                                        className="font-headline text-sm md:text-base font-black text-dark uppercase tracking-wider mt-8 mb-4"
                                    />
                                ),
                                p: ({ node: _node, ...props }) => (
                                    <p
                                        {...props}
                                        className="mb-4 text-muted font-body text-sm leading-relaxed"
                                    />
                                ),
                                a: ({ node: _node, ...props }) => (
                                    <a
                                        {...props}
                                        className="text-dark underline hover:text-dark font-bold transition-colors"
                                        target="_blank"
                                        rel="noopener noreferrer"
                                    />
                                ),
                                strong: ({ node: _node, ...props }) => (
                                    <strong
                                        {...props}
                                        className="font-bold text-dark"
                                    />
                                ),
                                blockquote: ({ node: _node, ...props }) => (
                                    <blockquote
                                        {...props}
                                        className="border-l-4 border-dark pl-4 my-4 text-muted italic"
                                    />
                                ),
                                ul: ({ node: _node, ...props }) => (
                                    <ul
                                        {...props}
                                        className="mb-4 list-disc pl-6"
                                    />
                                ),
                                ol: ({ node: _node, ...props }) => (
                                    <ol
                                        {...props}
                                        className="mb-4 list-decimal pl-6"
                                    />
                                ),
                                li: ({ node: _node, ...props }) => (
                                    <li
                                        {...props}
                                        className="mb-2 text-muted font-body text-sm leading-relaxed"
                                    />
                                ),
                                hr: ({ node: _node, ...props }) => (
                                    <hr
                                        {...props}
                                        className="my-8 border-t-2 border-cream"
                                    />
                                ),
                            }}
                        >
                            {content}
                        </ReactMarkdown>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default LegalMarkdownPage;
