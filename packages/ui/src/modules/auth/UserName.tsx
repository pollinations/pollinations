import { useAccountProfile, useAuthState } from "@pollinations/sdk/react";

export type UserNameProps = { className?: string };

/**
 * Renders the user's display name. Falls back to `handle`, then to
 * `githubUsername` (legacy field, present only for GitHub-linked accounts).
 * Returns `null` when logged out or when no display value is available.
 */
export function UserName({ className }: UserNameProps) {
    const { isLoggedIn } = useAuthState();
    const { data: profile } = useAccountProfile({ enabled: isLoggedIn });
    if (!isLoggedIn || !profile) return null;
    const display = profile.name || profile.handle || profile.githubUsername;
    if (!display) return null;
    return (
        <span data-polli="user-name" className={className}>
            {display}
        </span>
    );
}
