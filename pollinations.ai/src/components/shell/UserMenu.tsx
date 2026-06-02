import { Button, Dropdown } from "@pollinations/ui";
import {
    LoginButton,
    LogoutButton,
    UserAvatar,
    UserName,
    WhenLoggedIn,
    WhenLoggedOut,
} from "@pollinations/ui/auth/sdk";
import { Balance } from "@pollinations/ui/wallet/sdk";
import { ENTER_HREF } from "./links.ts";

export function UserMenu() {
    return (
        <>
            <WhenLoggedOut>
                <LoginButton theme="green" size="small">
                    Login
                </LoginButton>
            </WhenLoggedOut>

            <WhenLoggedIn>
                <Dropdown
                    theme="green"
                    align="end"
                    trigger={() => (
                        <button
                            type="button"
                            aria-label="Account menu"
                            className="flex items-center gap-2 rounded-full border border-theme-border bg-theme-bg-subtle px-2 py-1 text-theme-text-strong"
                        >
                            <UserAvatar size="sm" />
                            <UserName className="hidden text-sm font-semibold sm:block" />
                        </button>
                    )}
                >
                    {(close) => (
                        <div className="flex w-56 flex-col gap-3 p-3">
                            <div className="flex items-center gap-3">
                                <UserAvatar size="md" />
                                <UserName className="text-sm font-semibold text-theme-text-strong" />
                            </div>
                            <div className="flex items-center justify-between text-sm text-theme-text-base">
                                <span>Balance</span>
                                <Balance />
                            </div>
                            <Button
                                as="a"
                                href={ENTER_HREF}
                                target="_blank"
                                rel="noopener noreferrer"
                                theme="green"
                                size="small"
                                onClick={close}
                            >
                                Dashboard
                            </Button>
                            <LogoutButton theme="green" size="small">
                                Log out
                            </LogoutButton>
                        </div>
                    )}
                </Dropdown>
            </WhenLoggedIn>
        </>
    );
}
