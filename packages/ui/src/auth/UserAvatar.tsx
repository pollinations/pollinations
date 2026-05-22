import { useAuthProfile, useAuthState } from "@pollinations_ai/sdk/react";
import { cn } from "../lib/cn.ts";

export type UserAvatarProps = {
    size?: "sm" | "md" | "lg";
    className?: string;
};

const sizeClass = {
    sm: "polli:w-6 polli:h-6 polli:text-xs",
    md: "polli:w-9 polli:h-9 polli:text-sm",
    lg: "polli:w-12 polli:h-12 polli:text-base",
} as const;

function initials(name: string): string | null {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return null;
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase() || null;
    const first = parts[0][0] ?? "";
    const last = parts[parts.length - 1][0] ?? "";
    return (first + last).toUpperCase() || null;
}

/** Avatar from `profile.image`, or initials from `profile.name`. `null` otherwise. */
export function UserAvatar({ size = "md", className }: UserAvatarProps) {
    const { isLoggedIn } = useAuthState();
    const { profile } = useAuthProfile();
    if (!isLoggedIn) return null;

    const base = cn(
        "polli:inline-flex polli:items-center polli:justify-center polli:rounded-full polli:overflow-hidden polli:bg-theme-bg-pale polli:text-theme-text-strong polli:font-semibold polli:select-none",
        sizeClass[size],
        className,
    );

    if (profile?.image) {
        return (
            <img
                data-polli="user-avatar"
                src={profile.image}
                alt={profile.name ?? ""}
                className={base}
            />
        );
    }
    const label = profile?.name ? initials(profile.name) : null;
    if (!label) return null;
    return (
        <div
            data-polli="user-avatar"
            role="img"
            aria-label={profile?.name ?? undefined}
            className={base}
        >
            {label}
        </div>
    );
}
