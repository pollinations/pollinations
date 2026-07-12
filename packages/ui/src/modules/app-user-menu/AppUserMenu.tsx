import { useAuthActions } from "@pollinations/sdk/react";
import { ChevronIcon } from "../../primitives/ChevronIcon.tsx";
import { Dropdown } from "../../primitives/Dropdown.tsx";
import { DropdownItem } from "../../primitives/DropdownItem.tsx";
import { LockIcon } from "../../primitives/icons/index.tsx";
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
};

const defaultLabels: AppUserMenuLabels = {
    authorize: "Connect",
    appUserMenu: "App user menu",
    topUpAccount: "Top up account",
    logout: "Log out from this app",
};

export function AppUserMenu({
    dashboardHref,
    labels: labelOverrides,
}: AppUserMenuProps) {
    return (
        <AppUserMenuContent
            dashboardHref={dashboardHref}
            labels={labelOverrides}
        />
    );
}

function AppUserMenuContent({
    dashboardHref,
    labels: labelOverrides,
}: Pick<AppUserMenuProps, "dashboardHref" | "labels">) {
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
                <LoginButton className="polli:gap-1.5 polli:whitespace-nowrap">
                    <LockIcon className="polli:h-4 polli:w-4 polli:shrink-0" />
                    {labels.authorize}
                </LoginButton>
            </WhenLoggedOut>

            <WhenLoggedIn>
                <Dropdown
                    align="end"
                    className="polli:w-64 polli:p-1"
                    trigger={(open) => (
                        <button
                            type="button"
                            data-theme="accent"
                            aria-label={labels.appUserMenu}
                            className="polli-control polli:flex polli:min-w-0 polli:items-center polli:gap-2 polli:rounded-full polli:bg-theme-bg-active polli:py-1 polli:pl-1 polli:pr-3 polli:text-theme-text-base polli:shadow-sm polli:transition-colors polli:hover:bg-theme-bg-hover"
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
                            <DropdownItem
                                as="a"
                                href={dashboardHref}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={close}
                            >
                                {labels.topUpAccount}
                            </DropdownItem>
                            <DropdownItem
                                type="button"
                                onClick={() => {
                                    close();
                                    logout();
                                }}
                            >
                                {labels.logout}
                            </DropdownItem>
                        </div>
                    )}
                </Dropdown>
            </WhenLoggedIn>
        </div>
    );
}
