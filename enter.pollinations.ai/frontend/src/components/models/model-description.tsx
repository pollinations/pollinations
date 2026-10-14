import { InlineLink } from "@pollinations/ui";
import { type FC, useId, useLayoutEffect, useRef, useState } from "react";

/** Two-line model description with a "Show more" toggle when it is clamped. */
export const ModelDescription: FC<{ text: string }> = ({ text }) => {
    const id = useId();
    const ref = useRef<HTMLParagraphElement>(null);
    const [expanded, setExpanded] = useState(false);
    const [clamped, setClamped] = useState(false);

    useLayoutEffect(() => {
        const node = ref.current;
        if (!node || expanded) return;
        const measure = () =>
            setClamped(node.scrollHeight > node.clientHeight + 1);
        measure();
        const observer = new ResizeObserver(measure);
        observer.observe(node);
        return () => observer.disconnect();
    }, [expanded]);

    return (
        <div className="flex min-w-0 flex-col items-start gap-1">
            <p
                ref={ref}
                id={id}
                className={`${expanded ? "" : "line-clamp-2 "}text-xs leading-snug text-theme-text-muted`}
            >
                {text}
            </p>
            <InlineLink
                as="button"
                type="button"
                size="footer"
                tone="quiet"
                hidden={!clamped && !expanded}
                aria-expanded={expanded}
                aria-controls={id}
                onClick={() => setExpanded((open) => !open)}
            >
                {expanded ? "Show less" : "Show more"}
            </InlineLink>
        </div>
    );
};
