import { Heading, Surface, Text } from "@pollinations/ui";
import { DashboardSignInTrigger } from "./dashboard-sign-in-trigger.tsx";

export function DashboardSignInBanner() {
    return (
        <Surface
            as="section"
            variant="panel"
            className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between"
        >
            <div className="min-w-0 space-y-2">
                <Heading size="subsection">Your Pollinations account</Heading>
                <Text size="sm">
                    Sign in to manage your keys, apps, models, and Pollen.
                </Text>
            </div>
            <div className="flex shrink-0">
                <DashboardSignInTrigger variant="page" />
            </div>
        </Surface>
    );
}
