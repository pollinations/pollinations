import { Surface, Text } from "@pollinations/ui";
import logoMarkUrl from "@pollinations/ui/brand/mark.svg";
import { DashboardSignInTrigger } from "./dashboard-sign-in-trigger.tsx";

export function DashboardSignInBanner() {
    return (
        <Surface
            as="aside"
            aria-label="Sign in to Pollinations.ai"
            variant="card"
            className="flex w-full flex-col gap-4 md:flex-row md:items-center md:justify-between"
        >
            <div className="flex min-w-0 items-center gap-3">
                <span
                    aria-hidden="true"
                    className="block h-8 w-8 shrink-0 bg-current text-theme-text-muted"
                    style={{
                        mask: `url('${logoMarkUrl}') center / contain no-repeat`,
                        WebkitMask: `url('${logoMarkUrl}') center / contain no-repeat`,
                    }}
                />
                <Text size="sm" weight="medium">
                    Sign in or create your Pollinations.ai account.
                </Text>
            </div>
            <div className="flex shrink-0">
                <DashboardSignInTrigger variant="page" />
            </div>
        </Surface>
    );
}
