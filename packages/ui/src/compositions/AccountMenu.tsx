import { useId } from "react";
import { cn } from "../lib/cn.ts";
import { ChevronIcon } from "../primitives/ChevronIcon.tsx";
import { Dropdown, type DropdownProps } from "../primitives/Dropdown.tsx";
import {
    AccountAvatar,
    AccountDetails,
    type AccountIdentityProps,
} from "./AccountIdentity.tsx";

/** The whole pill is the menu trigger; destinations belong in the menu items. */
export type AccountMenuProps = Omit<AccountIdentityProps, "dashboardHref"> & {
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
    const statusId = useId();

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
                    aria-describedby={
                        secondaryContent != null ? statusId : undefined
                    }
                    className={cn(
                        "polli-control polli:flex polli:min-w-0 polli:items-center polli:gap-2 polli:rounded-full polli:bg-theme-bg-active polli:p-1 polli:pr-3 polli:text-theme-text-strong polli:transition-colors polli:hover:bg-theme-bg-hover",
                        className,
                    )}
                >
                    <AccountAvatar
                        name={name}
                        avatarUrl={avatarUrl}
                        className={
                            secondaryContent != null
                                ? "polli:h-11 polli:w-11"
                                : "polli:h-8 polli:w-8"
                        }
                    />
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
    );
}
