import { type ReactNode, useId } from "react";
import { cn } from "../lib/cn.ts";
import { ChevronIcon } from "../primitives/ChevronIcon.tsx";
import { Dropdown, type DropdownProps } from "../primitives/Dropdown.tsx";

export type AccountMenuProps = {
    name: string;
    avatarUrl?: string | null;
    dashboardHref?: string;
    /** Optional display content, such as the app allowance or session context. */
    secondaryContent?: ReactNode;
    /** Place the name and secondary content on one line. */
    layout?: "stacked" | "inline";
    /** The caller owns navigation, permissions and sign-out behavior. */
    children: DropdownProps["children"];
    className?: string;
    menuClassName?: string;
    side?: "top" | "bottom";
    menuLabel?: string;
    portalled?: boolean;
};

function initials(name: string) {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return "?";
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return `${parts[0][0] ?? ""}${parts.at(-1)?.[0] ?? ""}`.toUpperCase();
}

function AccountAvatar({
    name,
    avatarUrl,
    className,
    dashboardHref = "https://enter.pollinations.ai/pollen",
}: {
    name: string;
    avatarUrl?: string | null;
    className: string;
    dashboardHref?: string;
}) {
    return (
        <a
            href={dashboardHref}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Open dashboard"
            title="Open dashboard"
            data-pollinations-action="dashboard"
            className="polli:shrink-0 polli:rounded-full polli:cursor-pointer polli:transition-transform polli:hover:scale-105 polli:hover:brightness-110 polli:focus-visible:outline-2 polli:focus-visible:outline-offset-2 polli:focus-visible:outline-current polli:motion-reduce:transition-none polli:motion-reduce:hover:scale-100"
        >
            {avatarUrl ? (
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
            )}
        </a>
    );
}

export function AccountIdentity({
    name,
    avatarUrl,
    secondaryContent,
    layout = "stacked",
    secondaryId,
    dashboardHref,
}: {
    name: string;
    avatarUrl?: string | null;
    secondaryContent?: ReactNode;
    layout?: "stacked" | "inline";
    secondaryId?: string;
    dashboardHref?: string;
}) {
    return (
        <span className="polli:inline-flex polli:min-w-0 polli:flex-1 polli:items-center polli:gap-2">
            <AccountAvatar
                name={name}
                avatarUrl={avatarUrl}
                dashboardHref={dashboardHref}
                className={
                    layout === "stacked" && secondaryContent != null
                        ? "polli:h-11 polli:w-11"
                        : "polli:h-8 polli:w-8"
                }
            />
            <AccountDetails
                name={name}
                secondaryContent={secondaryContent}
                layout={layout}
                secondaryId={secondaryId}
            />
        </span>
    );
}

function AccountDetails({
    name,
    secondaryContent,
    layout,
    secondaryId,
}: {
    name: string;
    secondaryContent?: ReactNode;
    layout: "stacked" | "inline";
    secondaryId?: string;
}) {
    return (
        <span
            className={cn(
                "polli:flex polli:min-w-0 polli:flex-1 polli:text-left",
                layout === "inline"
                    ? "polli:items-center polli:gap-2"
                    : "polli:flex-col polli:items-start",
            )}
        >
            <span className="polli:max-w-full polli:truncate polli:text-sm polli:font-medium polli:leading-5 polli:text-theme-text-strong">
                {name}
            </span>
            {secondaryContent != null && (
                <span
                    id={secondaryId}
                    className={cn(
                        "polli:inline-flex polli:min-h-5 polli:max-w-full polli:items-center polli:truncate polli:text-xs polli:leading-4 polli:text-theme-text-base",
                        layout === "inline" && "polli:shrink-0",
                    )}
                >
                    {secondaryContent}
                </span>
            )}
        </span>
    );
}

export function AccountMenu({
    name,
    avatarUrl,
    dashboardHref,
    secondaryContent,
    layout = "stacked",
    children,
    className,
    menuClassName,
    side = "bottom",
    portalled,
    menuLabel = `Account menu for ${name}`,
}: AccountMenuProps) {
    const statusId = useId();

    return (
        <div
            data-theme="accent"
            className={cn(
                "polli:flex polli:min-w-0 polli:items-center polli:gap-2 polli:rounded-full polli:bg-theme-bg-active polli:p-1 polli:pr-3 polli:text-theme-text-strong polli:transition-colors polli:hover:bg-theme-bg-hover",
                className,
            )}
        >
            <AccountAvatar
                name={name}
                avatarUrl={avatarUrl}
                dashboardHref={dashboardHref}
                className={
                    layout === "stacked" && secondaryContent != null
                        ? "polli:h-11 polli:w-11"
                        : "polli:h-8 polli:w-8"
                }
            />
            <Dropdown
                align="end"
                side={side}
                portalled={portalled}
                className={cn(
                    "polli:w-[var(--reference-width)] polli:min-w-48 polli:p-1",
                    menuClassName,
                )}
                trigger={(open) => (
                    <button
                        type="button"
                        data-theme="accent"
                        aria-label={menuLabel}
                        aria-describedby={
                            secondaryContent != null ? statusId : undefined
                        }
                        className="polli-control polli:flex polli:min-w-0 polli:flex-1 polli:items-center polli:gap-2 polli:self-stretch polli:rounded-full polli:text-theme-text-strong"
                    >
                        <AccountDetails
                            name={name}
                            secondaryContent={secondaryContent}
                            layout={layout}
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
