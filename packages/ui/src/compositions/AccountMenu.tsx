import { useId } from "react";
import { cn } from "../lib/cn.ts";
import { ChevronIcon } from "../primitives/ChevronIcon.tsx";
import { Dropdown, type DropdownProps } from "../primitives/Dropdown.tsx";
import {
    AccountAvatar,
    AccountDetails,
    type AccountIdentityProps,
} from "./AccountIdentity.tsx";

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
            large={secondaryContent != null}
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
