import { Text } from "@pollinations/ui";
import { useRouterState } from "@tanstack/react-router";
import { DashboardSignInTrigger } from "./dashboard-sign-in-trigger.tsx";

export function DashboardSignInBanner({
    defaultOpen = false,
}: {
    defaultOpen?: boolean;
}) {
    const message = useRouterState({
        select: ({ location }) => {
            if (location.pathname === "/quests") {
                return "Sign in to track your quests and claim Pollen rewards.";
            }
            if (location.pathname === "/models") {
                const { category } = location.search as { category?: string };
                if (category === "agent") {
                    return "Sign in to use agents and create your own.";
                }
                if (category === "mcp") {
                    return "Sign in to connect your tools to Pollinations.ai.";
                }
                return "Sign in to get an API key and use these models.";
            }
            return "Create your Pollinations.ai account to start building.";
        },
    });

    return (
        <aside
            aria-label="Sign in to Pollinations.ai"
            className="flex w-full flex-col gap-4 md:flex-row md:items-center md:justify-between"
        >
            <Text size="sm" tone="muted">
                {message}
            </Text>
            <div className="flex shrink-0">
                <DashboardSignInTrigger defaultOpen={defaultOpen} />
            </div>
        </aside>
    );
}
