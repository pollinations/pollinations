import type { ComponentProps } from "react";
import { lazy, Suspense, useEffect, useState } from "react";
import { InlineLink } from "./inline-link";

const ReactMarkdown = lazy(() => import("react-markdown"));

type MarkdownProps = ComponentProps<typeof ReactMarkdown>;

export function LazyMarkdown(props: MarkdownProps) {
    return (
        <Suspense fallback={<span>{props.children}</span>}>
            <ReactMarkdown
                {...props}
                components={{
                    ...props.components,
                    a: ({ node, ...link }) => <InlineLink {...link} />,
                }}
            />
        </Suspense>
    );
}

/** LazyMarkdown with remark-gfm included — avoids importing remark-gfm at the call site */
export function LazyMarkdownGfm(props: Omit<MarkdownProps, "remarkPlugins">) {
    const [gfm, setGfm] = useState<MarkdownProps["remarkPlugins"]>();

    useEffect(() => {
        import("remark-gfm").then((m) => setGfm([m.default]));
    }, []);

    return <LazyMarkdown {...props} remarkPlugins={gfm} />;
}
