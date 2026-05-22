import { useAuthProfile, useAuthState } from "@pollinations_ai/sdk/react";

export type UserNameProps = { className?: string };

/** Renders `profile.name`. `null` when logged out or unavailable. */
export function UserName({ className }: UserNameProps) {
    const { isLoggedIn } = useAuthState();
    const { profile } = useAuthProfile();
    if (!isLoggedIn || !profile?.name) return null;
    return (
        <span data-polli="user-name" className={className}>
            {profile.name}
        </span>
    );
}
