import { useAuthProfile, useAuthState } from "@pollinations_ai/sdk/react";
import { cn } from "../index.ts";

export type UserNameProps = {
    className?: string;
};

/** Renders `profile.githubUsername` (or `profile.name` fallback). `null` when unavailable. */
export function UserName({ className }: UserNameProps) {
    const { isLoggedIn } = useAuthState();
    const { profile } = useAuthProfile();
    if (!isLoggedIn) return null;
    const name = profile?.githubUsername ?? profile?.name ?? null;
    if (!name) return null;
    return (
        <span
            data-polli="user-name"
            className={cn(
                "polli:font-medium polli:text-theme-text-strong",
                className,
            )}
        >
            {name}
        </span>
    );
}
