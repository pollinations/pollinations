import { cn } from "@pollinations/ui";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

/** Compact markdown for cards/snippets — small bullets, inline bold/code/links. */
export function Markdown({
    children,
    className,
}: {
    children: string;
    className?: string;
}) {
    return (
        <div className={cn("font-body leading-relaxed", className)}>
            <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                    ul: ({ children }) => (
                        <ul className="flex list-disc flex-col gap-1 pl-5 marker:text-theme-text-muted">
                            {children}
                        </ul>
                    ),
                    p: ({ children }) => (
                        <p className="mb-2 last:mb-0">{children}</p>
                    ),
                    strong: ({ children }) => (
                        <strong className="font-semibold text-theme-text-strong">
                            {children}
                        </strong>
                    ),
                    code: ({ children }) => (
                        <code className="rounded bg-theme-bg-subtle px-1 py-0.5 font-mono text-xs">
                            {children}
                        </code>
                    ),
                    a: ({ href, children }) => (
                        <a
                            href={href}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-semibold text-theme-text-strong underline"
                        >
                            {children}
                        </a>
                    ),
                }}
            >
                {children}
            </ReactMarkdown>
        </div>
    );
}
