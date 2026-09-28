import {
    Alert,
    Button,
    LoadingStatus,
    RefreshIcon,
    Section,
} from "@pollinations/ui";
import { type ReactNode, useState } from "react";

/** One spinner per page: only the top card shows it, the rest wait empty. */
export function PageSpinner() {
    return <LoadingStatus>Loading…</LoadingStatus>;
}

/** Keep section headings and controls outside the content that waits for data. */
export function SectionContent({
    loading,
    spinner = false,
    children,
}: {
    loading: boolean;
    spinner?: boolean;
    children?: ReactNode;
}) {
    if (!loading) return children;
    return spinner ? <PageSpinner /> : null;
}

/** Every card title of a page that is still loading, spinner in the top card. */
export function PageLoading({ titles }: { titles: readonly string[] }) {
    return titles.map((title, index) => (
        <Section key={title} title={title}>
            {index === 0 && <PageSpinner />}
        </Section>
    ));
}

export function LoadError({
    children,
    onRetry,
}: {
    children: string;
    onRetry?: () => unknown;
}) {
    const [retrying, setRetrying] = useState(false);

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

    return (
        <Alert intent="danger">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <span>{children}</span>
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
