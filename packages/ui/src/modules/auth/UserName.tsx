import { useAccountProfile, useAuthState } from "@pollinations_ai/sdk/react";

export type UserNameProps = { className?: string };

/**
 * Renders the user's display name. Falls back to GitHub username when the
 * `profile` scope was not granted (or `name` is empty). `null` when logged
 * out, or when neither name nor GitHub username is available.
 */
export function UserName({ className }: UserNameProps) {
    const { isLoggedIn } = useAuthState();
    const { data: profile } = useAccountProfile({ enabled: isLoggedIn });
    if (!isLoggedIn || !profile) return null;
    const display = profile.name || profile.githubUsername;
    if (!display) return null;
    return (
        <span data-polli="user-name" className={className}>
            {display}
        </span>
    );
}
