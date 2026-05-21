import { useAuthProfile, useAuthState } from "@pollinations_ai/sdk/react";
import { cn } from "../index.ts";

export type UserAvatarProps = {
    size?: "sm" | "md" | "lg";
    className?: string;
};

const sizeClass = {
    sm: "polli:w-6 polli:h-6 polli:text-xs",
    md: "polli:w-9 polli:h-9 polli:text-sm",
    lg: "polli:w-12 polli:h-12 polli:text-base",
} as const;

function initials(name: string | null | undefined): string {
    if (!name) return "?";
    const trimmed = name.trim();
    if (!trimmed) return "?";
    const parts = trimmed.split(/\s+/);
    const first = parts[0] ?? "";
    if (parts.length === 1) return first.slice(0, 2).toUpperCase() || "?";
    const last = parts[parts.length - 1] ?? "";
    const initialsStr = ((first[0] ?? "") + (last[0] ?? "")).toUpperCase();
    return initialsStr || "?";
}

/** Avatar from `profile.image`, with initials fallback. `null` when logged out. */
export function UserAvatar({ size = "md", className }: UserAvatarProps) {
    const { isLoggedIn } = useAuthState();
    const { profile } = useAuthProfile();
    if (!isLoggedIn) return null;

    const base = cn(
        "polli:inline-flex polli:items-center polli:justify-center polli:rounded-full polli:overflow-hidden polli:bg-theme-bg-pale polli:text-theme-text-strong polli:font-semibold polli:select-none",
        sizeClass[size],
        className,
    );

    const label = profile?.githubUsername ?? profile?.name ?? null;

    if (profile?.image) {
        return (
            <img
                src={profile.image}
                alt={label ?? "User avatar"}
                data-polli="user-avatar"
                className={base}
            />
        );
    }

    return (
        <div
            data-polli="user-avatar"
            role="img"
            aria-label={label ?? "User"}
            className={base}
        >
            {initials(label)}
        </div>
    );
}
