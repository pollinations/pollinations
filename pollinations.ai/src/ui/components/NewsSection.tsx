import ReactMarkdown from "react-markdown";
import { COPY_CONSTANTS } from "../../copy/constants";
import { useNews } from "../../hooks/useNews";
import { useTranslate } from "../../hooks/useTranslate";
import { Heading } from "./ui/typography";

interface NewsSectionProps {
    /** Maximum number of items to show (default: all) */
    limit?: number;
    /** Use compact styling (default: false) */
    compact?: boolean;
    /** Custom title (default: from page copy) */
    title?: string;
}

/**
 * Reusable news section component
 * Can be used in full mode (Community page) or compact mode (Hello page)
 */
export function NewsSection({
    limit,
    compact = false,
    title = "What's New",
}: NewsSectionProps) {
    const { news, loading } = useNews(COPY_CONSTANTS.newsFilePath);

    const { translated: translatedNews } = useTranslate(news, "content");

    if (loading || news.length === 0) return null;

    const displayNews = limit ? translatedNews.slice(0, limit) : translatedNews;

    return (
        <div className={compact ? "mb-8" : "mb-12"}>
            <Heading variant="section" spacing={compact ? "tight" : "default"}>
                {title}
            </Heading>
            <div className={compact ? "space-y-2" : "space-y-3"}>
                {displayNews.map((item) => {
                    // Remove date from content for display
                    const contentWithoutDate = item.content.replace(
                        /\*\*\d{4}-\d{2}-\d{2}\*\*:?\s*/,
                        "",
                    );

                    return (
                        <div
                            key={item.id}
                            className={`bg-input-background border-l-2 border-border-highlight ${
                                compact ? "p-2" : "p-3"
                            }`}
                        >
                            <div
                                className={`font-body text-text-body-secondary leading-relaxed ${
                                    compact ? "text-xs" : "text-sm"
                                }`}
                            >
                                {item.date && (
                                    <span
                                        className={`inline-block bg-button-primary-bg text-text-on-color px-2 py-0.5 font-mono font-black mr-2 ${
                                            compact ? "text-[10px]" : "text-xs"
                                        }`}
                                    >
                                        {item.date}
                                    </span>
                                )}
                                <ReactMarkdown
                                    components={{
                                        a: ({ node, ...props }) => (
                                            <a
                                                {...props}
                                                className="text-text-brand hover:underline font-bold"
                                                target="_blank"
                                                rel="noopener noreferrer"
                                            />
                                        ),
                                        code: ({
                                            node,
                                            className,
                                            children,
                                            ...props
                                        }: // biome-ignore lint/suspicious/noExplicitAny: ReactMarkdown props
                                        any) => {
                                            const match = /language-(\w+)/.exec(
                                                className || "",
                                            );
                                            const isInline =
                                                !match &&
                                                !String(children).includes(
                                                    "\n",
                                                );
                                            return isInline ? (
                                                <code
                                                    {...props}
                                                    className="bg-input-background px-1 py-0.5 font-mono text-xs"
                                                >
                                                    {children}
                                                </code>
                                            ) : (
                                                <code
                                                    {...props}
                                                    className={className}
                                                >
                                                    {children}
                                                </code>
                                            );
                                        },
                                        p: ({ node, ...props }) => (
                                            <span
                                                {...props}
                                                className="inline"
                                            />
                                        ),
                                    }}
                                >
                                    {contentWithoutDate}
                                </ReactMarkdown>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
