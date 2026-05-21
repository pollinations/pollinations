import { useAuthProfile, useAuthState } from "@pollinations_ai/sdk/react";
import { cn } from "../index.ts";

export type UserEmailProps = {
    className?: string;
};

/** Renders `profile.email` (only present when the key has `account:profile`). `null` otherwise. */
export function UserEmail({ className }: UserEmailProps) {
    const { isLoggedIn } = useAuthState();
    const { profile } = useAuthProfile();
    if (!isLoggedIn) return null;
    const email = profile?.email ?? null;
    if (!email) return null;
    return (
        <span
            data-polli="user-email"
            className={cn(
                "polli:text-sm polli:text-theme-text-muted",
                className,
            )}
        >
            {email}
        </span>
    );
}
