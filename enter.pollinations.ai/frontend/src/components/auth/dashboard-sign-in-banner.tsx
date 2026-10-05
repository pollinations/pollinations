import { Text } from "@pollinations/ui";
import { DashboardSignInTrigger } from "./dashboard-sign-in-trigger.tsx";

/** Below desktop the rail's sign-in button sits in a closed drawer. */
export function DashboardSignInBanner() {
    return (
        <aside
            aria-label="Sign in to Pollinations.ai"
            className="flex w-full flex-wrap items-center gap-x-4 gap-y-2 px-4 sm:px-0 lg:hidden"
        >
            <Text size="body" tone="muted">
                Create your Pollinations account to start building.
            </Text>
            <div className="flex shrink-0">
                <DashboardSignInTrigger />
            </div>
        </aside>
    );
}
