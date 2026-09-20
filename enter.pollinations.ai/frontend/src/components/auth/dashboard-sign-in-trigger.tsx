import { Button, GitHubIcon } from "@pollinations/ui";
import { useState } from "react";
import { SignInScreen } from "./sign-in-screen.tsx";

export function DashboardSignInTrigger({
    defaultOpen = false,
}: {
    defaultOpen?: boolean;
}) {
    const [open, setOpen] = useState(defaultOpen);
    return (
        <>
            <Button
                intent="brand"
                size="md"
                className="polli:gap-2"
                aria-haspopup="dialog"
                onClick={() => setOpen(true)}
            >
                Sign in with GitHub
                <GitHubIcon aria-hidden="true" className="h-4 w-4 shrink-0" />
            </Button>
            {open && (
                <SignInScreen
                    title="Sign in"
                    description="to your Pollinations account."
                    onCancel={() => setOpen(false)}
                >
                    <p className="text-sm text-theme-text-muted">
                        Continuing creates your Pollinations account if you
                        don’t have one yet.
                    </p>
                </SignInScreen>
            )}
        </>
    );
}
