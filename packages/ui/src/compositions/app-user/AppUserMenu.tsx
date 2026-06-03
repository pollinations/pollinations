import { useAuthActions } from "@pollinations/sdk/react";
import {
    LoginButton,
    UserAvatar,
    UserName,
    WhenLoggedIn,
    WhenLoggedOut,
} from "../../modules/auth/sdk.ts";
import { Balance } from "../../modules/wallet/sdk.ts";
import { ChevronIcon } from "../../primitives/ChevronIcon.tsx";
import { Dropdown } from "../../primitives/Dropdown.tsx";

export type AppUserMenuLabels = {
    authorize: string;
    appUserMenu: string;
    topUpAccount: string;
    logout: string;
};

export type AppUserMenuProps = {
    dashboardHref: string;
    labels?: Partial<AppUserMenuLabels>;
    hiddenWhenEmbedded?: boolean;
    embedQueryParam?: string;
};

const defaultLabels: AppUserMenuLabels = {
    authorize: "Authorize app",
    appUserMenu: "App user menu",
    topUpAccount: "Top up account",
    logout: "Log out from this app",
};

const rowClass =
    "polli-control polli:flex polli:w-full polli:cursor-pointer polli:items-center polli:gap-2 polli:rounded-lg polli:bg-transparent polli:px-3 polli:py-2 polli:text-left polli:text-sm polli:font-medium polli:text-theme-text-base polli:no-underline polli:transition-colors polli:hover:bg-theme-bg-hover polli:focus-visible:bg-theme-bg-hover";

export function isEmbeddedContext(embedQueryParam = "embed"): boolean {
    if (typeof window === "undefined") return false;
    const search = new URLSearchParams(window.location.search);
    if (search.get(embedQueryParam) === "1") return true;
    try {
        return window.self !== window.top;
    } catch {
        return true;
    }
}

export function AppUserMenu({
    dashboardHref,
    labels: labelOverrides,
    hiddenWhenEmbedded = false,
    embedQueryParam = "embed",
}: AppUserMenuProps) {
    if (hiddenWhenEmbedded && isEmbeddedContext(embedQueryParam)) return null;

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
        <div data-theme="amber" className="polli:flex polli:justify-end">
            <WhenLoggedOut>
                <LoginButton theme="amber" size="small">
                    {labels.authorize}
                </LoginButton>
            </WhenLoggedOut>

            <WhenLoggedIn>
                <Dropdown
                    theme="amber"
                    align="end"
                    className="polli:w-64 polli:p-1"
                    trigger={(open) => (
                        <button
                            type="button"
                            data-theme="amber"
                            aria-label={labels.appUserMenu}
                            className="polli-control polli:flex polli:min-w-0 polli:items-center polli:gap-2 polli:rounded-full polli:border polli:border-theme-border polli:bg-theme-bg-active polli:py-1 polli:pl-1 polli:pr-3 polli:text-theme-text-base polli:shadow-sm polli:transition-colors polli:hover:bg-theme-bg-hover"
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
                            data-theme="amber"
                            className="polli:flex polli:flex-col"
                        >
                            <a
                                href={dashboardHref}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={close}
                                className={rowClass}
                            >
                                {labels.topUpAccount}
                            </a>
                            <button
                                type="button"
                                onClick={() => {
                                    close();
                                    logout();
                                }}
                                className={rowClass}
                            >
                                {labels.logout}
                            </button>
                        </div>
                    )}
                </Dropdown>
            </WhenLoggedIn>
        </div>
    );
}
