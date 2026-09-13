import { cn } from "../lib/cn.ts";
import { ChevronIcon } from "../primitives/ChevronIcon.tsx";
import { Dropdown, type DropdownProps } from "../primitives/Dropdown.tsx";
import {
    AccountIdentity,
    type AccountIdentityProps,
} from "./AccountIdentity.tsx";

export type AccountMenuProps = AccountIdentityProps & {
    /** The caller owns navigation, permissions and sign-out behavior. */
    children: DropdownProps["children"];
    menuClassName?: string;
    side?: "top" | "bottom";
    menuLabel?: string;
};

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
                    <AccountIdentity
                        name={name}
                        avatarUrl={avatarUrl}
                        secondaryContent={secondaryContent}
                        className="polli:flex-1 polli:bg-transparent polli:p-0 polli:pr-0"
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
