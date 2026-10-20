import { Alert, Button, RefreshIcon, Section } from "@pollinations/ui";
import { type ReactNode, useContext, useEffect, useState } from "react";
import { PendingCount } from "./dashboard-shell.tsx";

/** Render while something on the page is still loading; the shell shows one status until none remain. */
export function PageStatus() {
    const setPendingCount = useContext(PendingCount);
    useEffect(() => {
        setPendingCount((count) => count + 1);
        return () => setPendingCount((count) => count - 1);
    }, [setPendingCount]);
    return null;
}

/** Keep section headings and controls outside the content that waits for data. */
export function SectionContent({
    loading,
    children,
}: {
    loading: boolean;
    children?: ReactNode;
}) {
    return loading ? <PageStatus /> : children;
}

/** Every card title of a page that is still loading, with the page status. */
export function PageLoading({ titles }: { titles: readonly string[] }) {
    return (
        <>
            <PageStatus />
            {titles.map((title) => (
                <Section key={title} title={title}>
                    {null}
                </Section>
            ))}
        </>
    );
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
