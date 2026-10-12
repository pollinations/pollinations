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
            className="flex w-full flex-col px-4 pb-3 sm:px-0 lg:hidden"
        >
            <div className="flex min-h-10 items-center pl-12">
                <Text size="body" tone="muted">
                    Start building with Pollinations.
                </Text>
            </div>
            <div className="flex pl-12">
                <Button
                    intent="brand"
                    size="lg"
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
