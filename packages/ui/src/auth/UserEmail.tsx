import { useAuthProfile, useAuthState } from "@pollinations_ai/sdk/react";

export type UserEmailProps = { className?: string };

/** Renders `profile.email`. `null` when logged out or the key lacks `profile` scope. */
export function UserEmail({ className }: UserEmailProps) {
    const { isLoggedIn } = useAuthState();
    const { profile } = useAuthProfile();
    if (!isLoggedIn || !profile?.email) return null;
    return (
        <span data-polli="user-email" className={className}>
            {profile.email}
        </span>
    );
}
