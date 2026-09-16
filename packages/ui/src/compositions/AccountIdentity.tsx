import type { ReactNode } from "react";
import { cn } from "../lib/cn.ts";

function initials(name: string) {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return "?";
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return `${parts[0][0] ?? ""}${parts.at(-1)?.[0] ?? ""}`.toUpperCase();
}

export function AccountAvatar({
    name,
    avatarUrl,
    className,
    dashboardHref,
}: {
    name: string;
    avatarUrl?: string | null;
    className: string;
    dashboardHref?: string;
}) {
    const avatar = avatarUrl ? (
        <img
            src={avatarUrl}
            alt=""
            className={cn(
                className,
                "polli:shrink-0 polli:rounded-full polli:object-cover",
            )}
        />
    ) : (
        <span
            role="img"
            aria-label={`${name} avatar`}
            className={cn(
                className,
                "polli:flex polli:shrink-0 polli:items-center polli:justify-center polli:rounded-full polli:bg-theme-bg-pale polli:text-xs polli:font-semibold polli:text-theme-text-strong",
            )}
        >
            {initials(name)}
        </span>
    );
    return dashboardHref ? (
        <a
            href={dashboardHref}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Open dashboard"
            title="Open dashboard"
            className="polli:shrink-0 polli:rounded-full polli:cursor-pointer polli:transition-transform polli:hover:scale-105 polli:hover:brightness-110 polli:focus-visible:outline-2 polli:focus-visible:outline-offset-2 polli:focus-visible:outline-current polli:motion-reduce:transition-none polli:motion-reduce:hover:scale-100"
        >
            {avatar}
        </a>
    ) : (
        avatar
    );
}

export type AccountIdentityProps = {
    name: string;
    avatarUrl?: string | null;
    secondaryContent?: ReactNode;
    /** Optional dashboard destination, owned by the caller. Opens in a new tab. */
    dashboardHref?: string;
    className?: string;
};

export function AccountIdentity({
    name,
    avatarUrl,
    secondaryContent,
    dashboardHref,
    className,
}: AccountIdentityProps) {
    return (
        <span
            className={cn(
                "polli:flex polli:min-w-0 polli:items-center polli:gap-2 polli:rounded-full polli:bg-ink-100/80 polli:p-1 polli:pr-3",
                className,
            )}
        >
            <AccountAvatar
                name={name}
                avatarUrl={avatarUrl}
                dashboardHref={dashboardHref}
                className={
                    secondaryContent != null
                        ? "polli:h-11 polli:w-11"
                        : "polli:h-8 polli:w-8"
                }
            />
            <AccountDetails name={name} secondaryContent={secondaryContent} />
        </span>
    );
}

export function AccountDetails({
    name,
    secondaryContent,
    secondaryId,
}: {
    name: string;
    secondaryContent?: ReactNode;
    secondaryId?: string;
}) {
    return (
        <span className="polli:flex polli:min-w-0 polli:flex-1 polli:flex-col polli:items-start polli:text-left">
            <span
                title={name}
                className="polli:max-w-full polli:truncate polli:text-sm polli:font-medium polli:leading-5 polli:text-theme-text-strong"
            >
                {name}
            </span>
            {secondaryContent != null && (
                <span
                    id={secondaryId}
                    className="polli:inline-flex polli:min-h-5 polli:max-w-full polli:items-center polli:truncate polli:text-xs polli:leading-4 polli:text-theme-text-base"
                >
                    {secondaryContent}
                </span>
            )}
        </span>
    );
}
