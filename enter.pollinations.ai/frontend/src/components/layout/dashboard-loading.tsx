import { Alert, Button, RefreshIcon } from "@pollinations/ui";
import { type ReactNode, useState } from "react";

/** Keep section headings and controls outside the content that waits for data. */
export function SectionContent({
    loading,
    children,
}: {
    loading: boolean;
    children?: ReactNode;
}) {
    return loading ? null : children;
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
