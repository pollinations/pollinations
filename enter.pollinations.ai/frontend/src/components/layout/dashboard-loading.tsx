import {
    Alert,
    Button,
    OutageNotice,
    RefreshIcon,
    Section,
    Skeleton,
    useOnline,
} from "@pollinations/ui";
import { type ReactNode, useState } from "react";
import {
    useOutage,
    useOutageRetry,
    useRequestTimeout,
} from "../../lib/outage.ts";

/**
 * Holds a card's place while its content loads: a quiet block about the size
 * of what replaces it (`className` sets the size), so nothing jumps.
 */
export function CardLoading({ className = "h-24" }: { className?: string }) {
    return (
        <output className="block">
            <Skeleton className={className} />
            <span className="sr-only">Loading…</span>
        </output>
    );
}

/** Keep section headings and controls outside the content that waits for data. */
export function SectionContent({
    loading,
    className,
    children,
}: {
    loading: boolean;
    /** The loading block's size. */
    className?: string;
    children?: ReactNode;
}) {
    return loading ? <CardLoading className={className} /> : children;
}

/** Every card of a page that is still loading, each holding its place. */
export function PageLoading({ titles }: { titles: readonly string[] }) {
    return titles.map((title) => (
        <Section key={title} title={title}>
            <CardLoading />
        </Section>
    ));
}

/**
 * A failed load: the outage notice when one of `paths` (the requests behind
 * it) failed with a 5xx or no response, else `children`.
 */
export function LoadError({
    children,
    onRetry,
    paths,
}: {
    children: string;
    onRetry?: () => unknown;
    /** Without paths, any failed Enter or gen call counts. */
    paths?: readonly string[];
}) {
    const [retrying, setRetrying] = useState(false);
    const outage = useOutage(paths);
    const timeout = useRequestTimeout(paths);
    const online = useOnline();
    useOutageRetry(outage, paths?.join(" ") ?? "page", onRetry);

    async function retry() {
        if (!onRetry || retrying) return;
        setRetrying(true);
        try {
            await onRetry();
        } catch {
            // Keep the existing error visible if the retry also fails.
        } finally {
            setRetrying(false);
        }
    }

    if (outage && (!timeout || !online))
        return <OutageNotice retrying={Boolean(onRetry)} />;

    return (
        <Alert intent="danger">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <span>
                    {timeout
                        ? `This data took too long to load.${onRetry ? " Retrying automatically, or try again now." : " Please try again."}`
                        : children}
                </span>
                {onRetry && (
                    <Button
                        intent="neutral"
                        icon={<RefreshIcon />}
                        onClick={retry}
                        disabled={retrying}
                    >
                        {retrying ? "Retrying…" : "Try again"}
                    </Button>
                )}
            </div>
        </Alert>
    );
}
