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

export type AccountMenuLabels = {
    login: string;
    accountMenu: string;
    balance: string;
    dashboard: string;
    logout: string;
};

export type AccountMenuProps = {
    dashboardHref: string;
    labels?: Partial<AccountMenuLabels>;
};

const defaultLabels: AccountMenuLabels = {
    login: "Login",
    accountMenu: "Account menu",
    balance: "Balance",
    dashboard: "Dashboard",
    logout: "Log out",
};

// The login menu is always amber — a fixed brand accent, independent of the
// surrounding page theme (`data-theme="amber"` is forced on every surface).
// Mirrors the enter.pollinations.ai account menu: a soft amber pill that opens
// an amber panel of flat amber rows. The amber theme tokens line up with
// Tailwind's amber palette (bg-active≈amber-200, bg-hover≈amber-300,
// text-base≈amber-900, border≈amber-300), so enter's look is reproduced exactly.
const rowClass =
    "polli:flex polli:w-full polli:cursor-pointer polli:items-center polli:gap-2 polli:rounded-lg polli:bg-transparent polli:px-3 polli:py-2 polli:text-left polli:text-sm polli:font-medium polli:text-theme-text-base polli:no-underline polli:transition-colors polli:hover:bg-theme-bg-hover polli:focus:outline-none polli:focus-visible:bg-theme-bg-hover";

export function AccountMenu({
    dashboardHref,
    labels: labelOverrides,
}: AccountMenuProps) {
    const labels = { ...defaultLabels, ...labelOverrides };
    const { logout } = useAuthActions();

    return (
        <>
            <WhenLoggedOut>
                <LoginButton theme="amber" size="small">
                    {labels.login}
                </LoginButton>
            </WhenLoggedOut>

            <WhenLoggedIn>
                <Dropdown
                    theme="amber"
                    align="end"
                    panelClassName="polli:w-60 polli:rounded-2xl polli:bg-theme-bg-active polli:p-1 polli:shadow-lg polli:ring-1 polli:ring-black/5"
                    trigger={(open) => (
                        <button
                            type="button"
                            data-theme="amber"
                            aria-label={labels.accountMenu}
                            className="polli:flex polli:min-w-0 polli:items-center polli:gap-2 polli:rounded-full polli:bg-theme-bg-active polli:py-1 polli:pl-1 polli:pr-3 polli:text-theme-text-base polli:transition-colors polli:hover:bg-theme-bg-hover"
                        >
                            <UserAvatar
                                size="md"
                                className="polli:h-8 polli:w-8"
                            />
                            <UserName className="polli:min-w-0 polli:truncate polli:text-sm polli:font-medium" />
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
                            <div className="polli:flex polli:items-center polli:gap-2 polli:px-3 polli:pb-2 polli:pt-1.5">
                                <UserAvatar size="md" />
                                <UserName className="polli:min-w-0 polli:truncate polli:text-sm polli:font-semibold polli:text-theme-text-strong" />
                            </div>
                            <div className="polli:flex polli:items-center polli:justify-between polli:px-3 polli:pb-2 polli:text-sm polli:text-theme-text-base">
                                <span>{labels.balance}</span>
                                <Balance />
                            </div>
                            <div className="polli:mx-1 polli:my-1 polli:border-t polli:border-theme-border" />
                            <a
                                href={dashboardHref}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={close}
                                className={rowClass}
                            >
                                {labels.dashboard}
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
        </>
    );
}
