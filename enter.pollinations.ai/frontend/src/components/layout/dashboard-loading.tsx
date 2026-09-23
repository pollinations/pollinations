import {
    Alert,
    Button,
    LoadingStatus,
    RefreshIcon,
    Section,
} from "@pollinations/ui";
import { type ReactNode, useState } from "react";

/** Keep section headings and controls outside the content that waits for data. */
export function SectionContent({
    loading,
    label,
    children,
}: {
    loading: boolean;
    label: string;
    children?: ReactNode;
}) {
    return loading ? <LoadingStatus>{label}</LoadingStatus> : children;
}

export function DashboardLoading({
    title,
    label,
}: {
    title: string;
    label: string;
}) {
    return (
        <Section title={title}>
            <SectionContent loading label={label} />
        </Section>
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
