import { Button, GitHubIcon, NavItem } from "@pollinations/ui";
import { useState } from "react";
import { SignInScreen } from "./sign-in-screen.tsx";

export function DashboardSignInTrigger({
    variant = "drawer",
    defaultOpen = false,
}: {
    variant?: "drawer" | "page";
    defaultOpen?: boolean;
}) {
    const [open, setOpen] = useState(defaultOpen);
    const label = (
        <>
            Sign in with GitHub
            <GitHubIcon aria-hidden="true" className="h-4 w-4 shrink-0" />
        </>
    );

    return (
        <>
            {variant === "page" ? (
                <Button
                    intent="brand"
                    size="lg"
                    className="polli:self-start polli:gap-3 polli:text-base"
                    aria-haspopup="dialog"
                    onClick={() => setOpen(true)}
                >
                    {label}
                </Button>
            ) : (
                <NavItem
                    flushLeft
                    className="dashboard-rail-tab"
                    aria-haspopup="dialog"
                    onClick={() => setOpen(true)}
                >
                    {label}
                </NavItem>
            )}
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
