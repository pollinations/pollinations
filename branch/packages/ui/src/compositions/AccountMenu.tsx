import type { ReactNode } from "react";
import { cn } from "../lib/cn.ts";
import { ChevronIcon } from "../primitives/ChevronIcon.tsx";
import { Dropdown, type DropdownProps } from "../primitives/Dropdown.tsx";

export type AccountMenuProps = {
    name: string;
    avatarUrl?: string | null;
    /** Optional display content, such as the app allowance or session context. */
    secondaryContent?: ReactNode;
    /** The caller owns navigation, permissions and sign-out behavior. */
    children: DropdownProps["children"];
    className?: string;
    menuClassName?: string;
    side?: "top" | "bottom";
    menuLabel?: string;
};

function initials(name: string) {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return "?";
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return `${parts[0][0] ?? ""}${parts.at(-1)?.[0] ?? ""}`.toUpperCase();
}

export function AccountMenu({
    name,
    avatarUrl,
    secondaryContent,
    children,
    className,
    menuClassName,
    side = "bottom",
    menuLabel = `Account menu for ${name}`,
}: AccountMenuProps) {
    return (
        <Dropdown
            align="end"
            side={side}
            className={cn(
                "polli:w-[var(--reference-width)] polli:min-w-48 polli:p-1",
                menuClassName,
            )}
            trigger={(open) => (
                <button
                    type="button"
                    data-theme="accent"
                    aria-label={menuLabel}
                    className={cn(
                        "polli-control polli:flex polli:min-w-0 polli:items-center polli:gap-2 polli:rounded-full polli:bg-theme-bg-active polli:p-1 polli:pr-3 polli:text-theme-text-strong polli:transition-colors polli:hover:bg-theme-bg-hover",
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
                        <span className="polli:max-w-full polli:truncate polli:text-sm polli:font-medium">
                            {name}
                        </span>
                        {secondaryContent != null && (
                            <span className="polli:max-w-full polli:truncate polli:text-xs polli:text-theme-text-base">
                                {secondaryContent}
                            </span>
                        )}
                    </span>
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
