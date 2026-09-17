import type { ReactNode } from "react";
import { useId } from "react";
import { cn } from "../lib/cn.ts";
import { ChevronIcon } from "../primitives/ChevronIcon.tsx";
import { Dropdown, type DropdownProps } from "../primitives/Dropdown.tsx";

function initials(name: string) {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return "?";
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return `${parts[0][0] ?? ""}${parts.at(-1)?.[0] ?? ""}`.toUpperCase();
}

function AccountAvatar({
    name,
    avatarUrl,
    secondaryContent,
    dashboardHref,
}: {
    name: string;
    avatarUrl?: string | null;
    secondaryContent?: ReactNode;
    dashboardHref?: string;
}) {
    const large = secondaryContent != null;
    const className = large ? "polli:h-11 polli:w-11" : "polli:h-8 polli:w-8";
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
                secondaryContent={secondaryContent}
            />
            <AccountDetails name={name} secondaryContent={secondaryContent} />
        </span>
    );
}

function AccountDetails({
    name,
    secondaryContent,
    secondaryId,
}: {
    name: string;
    secondaryContent?: ReactNode;
    secondaryId?: string;
}) {
    return (
        <span className="polli:flex polli:min-w-0 polli:flex-col polli:items-start polli:text-left">
            <span
                title={name}
                className="polli:max-w-full polli:truncate polli:text-sm polli:font-medium polli:leading-5 polli:text-theme-text-strong"
            >
                {name}
            </span>
            {secondaryContent != null && (
                <span
                    id={secondaryId}
                    className="polli:inline-flex polli:min-h-5 polli:items-center polli:whitespace-nowrap polli:text-xs polli:leading-4 polli:text-theme-text-base"
                >
                    {secondaryContent}
                </span>
            )}
        </span>
    );
}

export type AccountMenuProps = AccountIdentityProps & {
    /** The caller owns navigation, permissions and sign-out behavior. */
    children: DropdownProps["children"];
    menuClassName?: string;
    side?: "top" | "bottom";
    menuLabel?: string;
};

/**
 * With `dashboardHref` the avatar is a link and the name/chevron open the
 * menu; without one the whole pill is the trigger.
 */
export function AccountMenu({
    name,
    avatarUrl,
    dashboardHref,
    secondaryContent,
    children,
    className,
    menuClassName,
    side = "bottom",
    menuLabel = `Account menu for ${name}`,
}: AccountMenuProps) {
    const statusId = useId();
    const avatar = (
        <AccountAvatar
            name={name}
            avatarUrl={avatarUrl}
            dashboardHref={dashboardHref}
            secondaryContent={secondaryContent}
        />
    );

    return (
        <div
            data-theme="accent"
            className={cn(
                "polli:flex polli:min-w-0 polli:items-center polli:gap-2 polli:rounded-full polli:bg-theme-bg-active polli:p-1 polli:pr-3 polli:text-theme-text-strong polli:transition-colors polli:hover:bg-theme-bg-hover",
                className,
            )}
        >
            {dashboardHref && avatar}
            <Dropdown
                align="end"
                side={side}
                className={cn(
                    "polli:w-max polli:min-w-[var(--reference-width)] polli:p-1",
                    menuClassName,
                )}
                trigger={(open) => (
                    <button
                        type="button"
                        aria-label={menuLabel}
                        aria-describedby={
                            secondaryContent != null ? statusId : undefined
                        }
                        className="polli-control polli:flex polli:min-w-0 polli:flex-1 polli:items-center polli:gap-2 polli:self-stretch polli:rounded-full polli:text-theme-text-strong"
                    >
                        {!dashboardHref && avatar}
                        <AccountDetails
                            name={name}
                            secondaryContent={secondaryContent}
                            secondaryId={statusId}
                        />
                        <ChevronIcon
                            expanded={open}
                            className="polli:ml-auto polli:h-4 polli:w-4 polli:text-theme-text-strong"
                        />
                    </button>
                )}
            >
                {children}
            </Dropdown>
        </div>
    );
}
