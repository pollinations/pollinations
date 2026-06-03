import {
    LoginButton,
    LogoutButton,
    UserAvatar,
    UserName,
    WhenLoggedIn,
    WhenLoggedOut,
} from "../../modules/auth/sdk.ts";
import { Balance } from "../../modules/wallet/sdk.ts";
import { Button } from "../../primitives/Button.tsx";
import { Dropdown } from "../../primitives/Dropdown.tsx";
import type { ThemeName } from "../../theme.ts";

export type AccountMenuLabels = {
    login: string;
    accountMenu: string;
    balance: string;
    dashboard: string;
    logout: string;
};

export type AccountMenuProps = {
    dashboardHref: string;
    theme?: ThemeName;
    labels?: Partial<AccountMenuLabels>;
};

const defaultLabels: AccountMenuLabels = {
    login: "Login",
    accountMenu: "Account menu",
    balance: "Balance",
    dashboard: "Dashboard",
    logout: "Log out",
};

export function AccountMenu({
    dashboardHref,
    theme = "green",
    labels: labelOverrides,
}: AccountMenuProps) {
    const labels = { ...defaultLabels, ...labelOverrides };

    return (
        <>
            <WhenLoggedOut>
                <LoginButton theme={theme} size="small">
                    {labels.login}
                </LoginButton>
            </WhenLoggedOut>

            <WhenLoggedIn>
                <Dropdown
                    theme={theme}
                    align="end"
                    trigger={() => (
                        <button
                            type="button"
                            aria-label={labels.accountMenu}
                            className="polli:flex polli:items-center polli:gap-2 polli:rounded-full polli:border polli:border-theme-border polli:bg-theme-bg-subtle polli:px-2 polli:py-1 polli:text-theme-text-strong"
                        >
                            <UserAvatar size="sm" />
                            <UserName className="polli:hidden polli:text-sm polli:font-semibold sm:polli:block" />
                        </button>
                    )}
                >
                    {(close) => (
                        <div className="polli:flex polli:w-56 polli:flex-col polli:gap-3 polli:p-3">
                            <div className="polli:flex polli:items-center polli:gap-3">
                                <UserAvatar size="md" />
                                <UserName className="polli:text-sm polli:font-semibold polli:text-theme-text-strong" />
                            </div>
                            <div className="polli:flex polli:items-center polli:justify-between polli:text-sm polli:text-theme-text-base">
                                <span>{labels.balance}</span>
                                <Balance />
                            </div>
                            <Button
                                as="a"
                                href={dashboardHref}
                                target="_blank"
                                rel="noopener noreferrer"
                                theme={theme}
                                size="small"
                                onClick={close}
                            >
                                {labels.dashboard}
                            </Button>
                            <LogoutButton theme={theme} size="small">
                                {labels.logout}
                            </LogoutButton>
                        </div>
                    )}
                </Dropdown>
            </WhenLoggedIn>
        </>
    );
}
