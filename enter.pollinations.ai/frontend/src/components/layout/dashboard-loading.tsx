import {
    Alert,
    Button,
    LoadingStatus,
    RefreshIcon,
    Section,
} from "@pollinations/ui";
import type { ReactNode } from "react";

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
    onRetry = () => window.location.reload(),
}: {
    children: string;
    onRetry?: () => void;
}) {
    return (
        <Alert intent="danger">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <span>{children}</span>
                <Button
                    intent="neutral"
                    icon={<RefreshIcon />}
                    onClick={onRetry}
                >
                    Try again
                </Button>
            </div>
        </Alert>
    );
}
