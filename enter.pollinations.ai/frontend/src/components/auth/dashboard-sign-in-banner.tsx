import { Button, GitHubIcon, Text } from "@pollinations/ui";
import { useState } from "react";
import { SignInScreen } from "./sign-in-screen.tsx";

export function DashboardSignInDialog({ onCancel }: { onCancel: () => void }) {
    return (
        <SignInScreen
            title="Sign in to Pollinations"
            description="Continuing creates your account if you don’t have one yet."
            onCancel={onCancel}
        />
    );
}

/** Below desktop the rail's sign-in button sits in a closed drawer. */
export function DashboardSignInBanner() {
    const [open, setOpen] = useState(false);
    return (
        <aside
            aria-label="Sign in to Pollinations.ai"
            className="flex w-full flex-wrap items-center gap-x-4 gap-y-2 px-4 sm:px-0 lg:hidden"
        >
            <Text size="body" tone="muted">
                Create your Pollinations account to start building.
            </Text>
            <div className="flex shrink-0">
                <Button
                    intent="brand"
                    size="md"
                    className="polli:gap-2"
                    aria-haspopup="dialog"
                    onClick={() => setOpen(true)}
                >
                    Sign in with GitHub
                    <GitHubIcon
                        aria-hidden="true"
                        className="h-4 w-4 shrink-0"
                    />
                </Button>
            </div>
            {open && <DashboardSignInDialog onCancel={() => setOpen(false)} />}
        </aside>
    );
}
