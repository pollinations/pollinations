import { useAuthActions } from "@pollinations/sdk/react";
import { cn } from "../../lib/cn.ts";
import { ChevronIcon } from "../../primitives/ChevronIcon.tsx";
import { Dropdown } from "../../primitives/Dropdown.tsx";
import { DropdownItem } from "../../primitives/DropdownItem.tsx";
import {
    KeyIcon,
    LogInIcon,
    LogOutIcon,
} from "../../primitives/icons/index.tsx";
import {
    LoginButton,
    UserAvatar,
    UserName,
    WhenLoggedIn,
    WhenLoggedOut,
} from "../auth/sdk.ts";
import { Balance } from "../wallet/sdk.ts";

export type AppUserMenuLabels = {
    authorize: string;
    appUserMenu: string;
    topUpAccount: string;
    logout: string;
};

export type AppUserMenuProps = {
    dashboardHref: string;
    labels?: Partial<AppUserMenuLabels>;
    /** Keep the account menu focused when the host already links to Dashboard. */
    showDashboard?: boolean;
    /** Match a large rectangular site action instead of the default pill. */
    triggerVariant?: "pill" | "action";
};

const defaultLabels: AppUserMenuLabels = {
    authorize: "Connect",
    appUserMenu: "App user menu",
    topUpAccount: "Top up account",
    logout: "Log out",
};

const actionTriggerClass =
    "polli:min-h-14 polli:rounded-xl polli:border-r-4 polli:border-b-4 polli:border-solid polli:border-brand-dark/20 polli:py-2 polli:hover:border-brand-dark/45";

export function AppUserMenu({
    dashboardHref,
    labels: labelOverrides,
    showDashboard = true,
    triggerVariant = "pill",
}: AppUserMenuProps) {
    return (
        <AppUserMenuContent
            dashboardHref={dashboardHref}
            labels={labelOverrides}
            showDashboard={showDashboard}
            triggerVariant={triggerVariant}
        />
    );
}

function AppUserMenuContent({
    dashboardHref,
    labels: labelOverrides,
    showDashboard,
    triggerVariant,
}: Required<
    Pick<AppUserMenuProps, "dashboardHref" | "showDashboard" | "triggerVariant">
> &
    Pick<AppUserMenuProps, "labels">) {
    const labels = { ...defaultLabels, ...labelOverrides };
    const { logout } = useAuthActions();

    return (
        // shrink-0 so the account control never gets squeezed (and its label
        // never wraps) when it sits next to flexible content in a header row.
        <div
            data-theme="accent"
            className="polli:flex polli:shrink-0 polli:justify-end"
        >
            <WhenLoggedOut>
                <LoginButton
                    appearance={triggerVariant === "action" ? "raised" : "pill"}
                    className={cn(
                        "polli:gap-1.5 polli:whitespace-nowrap",
                        triggerVariant === "action" &&
                            `${actionTriggerClass} polli:px-4`,
                    )}
                >
                    <LogInIcon className="polli:h-4 polli:w-4 polli:shrink-0" />
                    {labels.authorize}
                </LoginButton>
            </WhenLoggedOut>

            <WhenLoggedIn>
                <Dropdown
                    align="end"
                    className="polli:w-max polli:bg-surface-opaque! polli:p-1"
                    trigger={(open) => (
                        <button
                            type="button"
                            data-theme="accent"
                            aria-label={labels.appUserMenu}
                            className={cn(
                                "polli-control polli:flex polli:min-w-0 polli:items-center polli:gap-2 polli:bg-theme-bg-active polli:text-theme-text-base polli:transition-colors polli:hover:bg-theme-bg-hover",
                                triggerVariant === "action"
                                    ? `${actionTriggerClass} polli:pl-2 polli:pr-4`
                                    : "polli:rounded-full polli:py-1 polli:pl-1 polli:pr-3",
                            )}
                        >
                            <UserAvatar
                                size="md"
                                className="polli:h-8 polli:w-8"
                            />
                            <span className="polli:flex polli:min-w-0 polli:flex-col polli:items-start polli:leading-tight">
                                <UserName className="polli:max-w-32 polli:truncate polli:text-sm polli:font-semibold" />
                                <Balance className="polli:bg-transparent polli:px-0 polli:py-0 polli:text-xs polli:text-theme-text-base" />
                            </span>
                            <ChevronIcon
                                expanded={open}
                                className="polli:h-4 polli:w-4 polli:text-theme-text-base"
                            />
                        </button>
                    )}
                >
                    {(close) => (
                        <div
                            data-theme="accent"
                            className="polli:flex polli:flex-col"
                        >
                            {showDashboard && (
                                <DropdownItem
                                    as="a"
                                    href={dashboardHref}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    onClick={close}
                                >
                                    <KeyIcon className="polli:h-4 polli:w-4 polli:shrink-0" />
                                    {labels.topUpAccount}
                                </DropdownItem>
                            )}
                            <DropdownItem
                                type="button"
                                className="polli:justify-start polli:text-left"
                                onClick={() => {
                                    close();
                                    logout();
                                }}
                            >
                                <LogOutIcon className="polli:h-4 polli:w-4 polli:shrink-0" />
                                {labels.logout}
                            </DropdownItem>
                        </div>
                    )}
                </Dropdown>
            </WhenLoggedIn>
        </div>
    );
}
