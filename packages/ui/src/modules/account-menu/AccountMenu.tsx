import { cn } from "../../lib/cn.ts";
import { ChevronIcon } from "../../primitives/ChevronIcon.tsx";
import { Dropdown } from "../../primitives/Dropdown.tsx";
import { DropdownItem } from "../../primitives/DropdownItem.tsx";
import { SignOutIcon } from "../../primitives/icons/index.tsx";

export type AccountMenuProps = {
    name: string;
    avatarUrl?: string | null;
    onSignOut: () => void;
    className?: string;
    side?: "top" | "bottom";
    menuLabel?: string;
    signOutLabel?: string;
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
    onSignOut,
    className,
    side = "bottom",
    menuLabel = "Account menu",
    signOutLabel = "Sign Out",
}: AccountMenuProps) {
    return (
        <Dropdown
            align="end"
            side={side}
            className="polli:w-[var(--reference-width)] polli:min-w-48 polli:p-1"
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
                    <span className="polli:min-w-0 polli:flex-1 polli:truncate polli:text-left polli:text-sm polli:font-medium">
                        {name}
                    </span>
                    <ChevronIcon
                        expanded={open}
                        className="polli:ml-auto polli:h-4 polli:w-4 polli:text-theme-text-strong"
                    />
                </button>
            )}
        >
            {(close) => (
                <DropdownItem
                    onClick={() => {
                        close();
                        onSignOut();
                    }}
                >
                    <SignOutIcon
                        className="polli:h-4 polli:w-4 polli:shrink-0"
                        aria-hidden="true"
                    />
                    {signOutLabel}
                </DropdownItem>
            )}
        </Dropdown>
    );
}
