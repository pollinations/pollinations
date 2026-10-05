import { Button, GitHubIcon } from "@pollinations/ui";
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

export function DashboardSignInTrigger() {
    const [open, setOpen] = useState(false);
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
            {open && <DashboardSignInDialog onCancel={() => setOpen(false)} />}
        </>
    );
}
