import { type ReactNode, useId } from "react";
import { cn } from "../lib/cn.ts";
import { ChevronIcon } from "../primitives/ChevronIcon.tsx";
import { Dropdown, type DropdownProps } from "../primitives/Dropdown.tsx";

export type AccountMenuProps = {
    name: string;
    avatarUrl?: string | null;
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
}: {
    name: string;
    avatarUrl?: string | null;
    className: string;
}) {
    return avatarUrl ? (
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
}

export function AccountIdentity({
    name,
    avatarUrl,
    secondaryContent,
    layout = "stacked",
    secondaryId,
}: {
    name: string;
    avatarUrl?: string | null;
    secondaryContent?: ReactNode;
    layout?: "stacked" | "inline";
    secondaryId?: string;
}) {
    return (
        <span className="polli:inline-flex polli:min-w-0 polli:flex-1 polli:items-center polli:gap-2">
            <AccountAvatar
                name={name}
                avatarUrl={avatarUrl}
                className={
                    layout === "stacked" && secondaryContent != null
                        ? "polli:h-11 polli:w-11"
                        : "polli:h-8 polli:w-8"
                }
            />
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
        </span>
    );
}

export function AccountMenu({
    name,
    avatarUrl,
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
                    className={cn(
                        "polli-control polli:flex polli:min-w-0 polli:items-center polli:gap-2 polli:rounded-full polli:bg-theme-bg-active polli:p-1 polli:pr-3 polli:text-theme-text-strong polli:transition-colors polli:hover:bg-theme-bg-hover",
                        className,
                    )}
                >
                    <AccountIdentity
                        name={name}
                        avatarUrl={avatarUrl}
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
    );
}
