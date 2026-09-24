import { Text } from "@pollinations/ui";
import { DashboardSignInTrigger } from "./dashboard-sign-in-trigger.tsx";

export function DashboardSignInBanner({
    defaultOpen = false,
    message = "Create your Pollinations account to start building.",
}: {
    defaultOpen?: boolean;
    message?: string;
}) {
    return (
        <aside
            aria-label="Sign in to Pollinations.ai"
            className="flex w-full flex-wrap items-center gap-4"
        >
            <Text size="body" tone="muted">
                {message}
            </Text>
            <div className="flex shrink-0">
                <DashboardSignInTrigger defaultOpen={defaultOpen} />
            </div>
        </aside>
    );
}
