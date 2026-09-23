import {
    Alert,
    Button,
    LoadingStatus,
    RefreshIcon,
    Section,
} from "@pollinations/ui";

export function DashboardLoading({
    title,
    label,
}: {
    title: string;
    label: string;
}) {
    return (
        <Section title={title}>
            <LoadingStatus>{label}</LoadingStatus>
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
