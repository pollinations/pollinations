import { ClockIcon, Surface, Text } from "@pollinations/ui";

/** Shared page loading state inside the dashboard shell. */
export function DashboardLoading({ label }: { label: string }) {
    return (
        <Surface variant="panel">
            <div
                role="status"
                className="flex items-center gap-2 text-theme-text-muted"
            >
                <ClockIcon aria-hidden="true" className="h-4 w-4 shrink-0" />
                <Text size="sm" tone="muted">
                    {label}
                </Text>
            </div>
        </Surface>
    );
}
