import { Button, GitHubIcon } from "@pollinations/ui";
import { useState } from "react";
import { SignInScreen } from "./sign-in-screen.tsx";

export function DashboardSignInTrigger({
    defaultOpen = false,
}: {
    defaultOpen?: boolean;
}) {
    const [open, setOpen] = useState(defaultOpen);
    function openSignIn() {
        setOpen(true);
    }
    return (
        <>
            <Button
                intent="brand"
                size="md"
                className="polli:gap-2"
                aria-haspopup="dialog"
                onClick={openSignIn}
            >
                Sign in with GitHub
                <GitHubIcon aria-hidden="true" className="h-4 w-4 shrink-0" />
            </Button>
            {open && (
                <SignInScreen
                    title="Sign in to Pollinations"
                    description="Continuing creates your account if you don’t have one yet."
                    onCancel={() => setOpen(false)}
                />
            )}
        </>
    );
}
