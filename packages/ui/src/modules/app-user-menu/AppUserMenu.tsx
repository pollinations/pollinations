import { useAuthActions, useAuthState } from "@pollinations/sdk/react";
import { useState } from "react";
import { ChevronIcon } from "../../primitives/ChevronIcon.tsx";
import { Dropdown } from "../../primitives/Dropdown.tsx";
import { DropdownItem } from "../../primitives/DropdownItem.tsx";
import {
    AppIcon,
    LockIcon,
    SignOutIcon,
    WalletIcon,
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
    buyPollen: string;
    addingPollen: string;
    paymentSubmitted: string;
    paymentCanceled: string;
    topUpError: string;
    dashboard: string;
    logout: string;
};

export type AppUserMenuProps = {
    labels?: Partial<AppUserMenuLabels>;
};

const defaultLabels: AppUserMenuLabels = {
    authorize: "Connect",
    appUserMenu: "App user menu",
    buyPollen: "Buy 5 Pollen",
    addingPollen: "Opening checkout…",
    paymentSubmitted:
        "Payment submitted — Pollen is added once the payment is confirmed.",
    paymentCanceled: "Payment canceled.",
    topUpError: "Could not open checkout. Please try again.",
    dashboard: "Open dashboard",
    logout: "Log out from this app",
};

export function AppUserMenu({ labels: labelOverrides }: AppUserMenuProps) {
    return <AppUserMenuContent labels={labelOverrides} />;
}

function AppUserMenuContent({
    labels: labelOverrides,
}: Pick<AppUserMenuProps, "labels">) {
    const labels = { ...defaultLabels, ...labelOverrides };
    const { topUp, logout, enterUrl } = useAuthActions();
    const { topUpStatus } = useAuthState();
    const [isAddingPollen, setIsAddingPollen] = useState(false);
    const [topUpError, setTopUpError] = useState(false);

    const buyPollen = async () => {
        setIsAddingPollen(true);
        setTopUpError(false);
        try {
            await topUp({ packKey: "p5" });
        } catch {
            setTopUpError(true);
        } finally {
            setIsAddingPollen(false);
        }
    };

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
                                type="button"
                                disabled={isAddingPollen}
                                aria-busy={isAddingPollen}
                                className="polli:disabled:cursor-wait polli:disabled:opacity-60"
                                onClick={() => void buyPollen()}
                            >
                                <WalletIcon className="polli:h-4 polli:w-4 polli:shrink-0" />
                                {isAddingPollen
                                    ? labels.addingPollen
                                    : labels.buyPollen}
                            </DropdownItem>
                            {topUpStatus === "success" ? (
                                <p className="polli:m-0 polli:px-3 polli:py-2 polli:text-xs polli:text-theme-text-muted">
                                    {labels.paymentSubmitted}
                                </p>
                            ) : null}
                            {topUpStatus === "canceled" ? (
                                <p className="polli:m-0 polli:px-3 polli:py-2 polli:text-xs polli:text-theme-text-muted">
                                    {labels.paymentCanceled}
                                </p>
                            ) : null}
                            {topUpError ? (
                                <p
                                    role="alert"
                                    className="polli:m-0 polli:px-3 polli:py-2 polli:text-xs polli:text-intent-danger-text"
                                >
                                    {labels.topUpError}
                                </p>
                            ) : null}
                            <DropdownItem
                                as="a"
                                href={`${enterUrl.replace(/\/+$/, "")}/pollen`}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={close}
                            >
                                <AppIcon className="polli:h-4 polli:w-4 polli:shrink-0" />
                                {labels.dashboard}
                            </DropdownItem>
                            <DropdownItem
                                type="button"
                                onClick={() => {
                                    close();
                                    setTopUpError(false);
                                    logout();
                                }}
                            >
                                <SignOutIcon className="polli:h-4 polli:w-4 polli:shrink-0" />
                                {labels.logout}
                            </DropdownItem>
                        </div>
                    )}
                </Dropdown>
            </WhenLoggedIn>
        </div>
    );
}
