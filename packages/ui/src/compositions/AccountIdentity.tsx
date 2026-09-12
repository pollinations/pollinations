import type { ReactNode } from "react";
import { cn } from "../lib/cn.ts";

export type AccountIdentityProps = {
    name: string;
    avatarUrl?: string | null;
    secondaryContent?: ReactNode;
    className?: string;
};

function initials(name: string) {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return "?";
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return `${parts[0][0] ?? ""}${parts.at(-1)?.[0] ?? ""}`.toUpperCase();
}

/** The account menu's identity display, also usable without menu actions. */
export function AccountIdentity({
    name,
    avatarUrl,
    secondaryContent,
    className,
}: AccountIdentityProps) {
    return (
        <span
            className={cn(
                "polli:flex polli:min-w-0 polli:items-center polli:gap-2 polli:rounded-full polli:bg-ink-100/80 polli:p-1 polli:pr-3",
                className,
            )}
        >
            {avatarUrl ? (
                <img
                    src={avatarUrl}
                    alt=""
                    className="polli:h-8 polli:w-8 polli:shrink-0 polli:rounded-full polli:object-cover"
                />
            ) : (
                <span
                    role="img"
                    aria-label={`${name} avatar`}
                    className="polli:flex polli:h-8 polli:w-8 polli:shrink-0 polli:items-center polli:justify-center polli:rounded-full polli:bg-theme-bg-pale polli:text-xs polli:font-semibold polli:text-theme-text-strong"
                >
                    {initials(name)}
                </span>
            )}
            <span className="polli:flex polli:min-w-0 polli:flex-1 polli:flex-col polli:items-start polli:text-left">
                <span
                    className="polli:max-w-full polli:truncate polli:text-sm polli:font-medium polli:text-theme-text-strong"
                    title={name}
                >
                    {name}
                </span>
                {secondaryContent != null && (
                    <span className="polli:max-w-full polli:truncate polli:text-xs polli:text-theme-text-base">
                        {secondaryContent}
                    </span>
                )}
            </span>
        </span>
    );
}
