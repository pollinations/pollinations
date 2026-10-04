import {
    AccountMenu,
    BrandMark,
    Button,
    DropdownItem,
    ExternalLinkIcon,
    Eyebrow,
    PowerIcon,
    Text,
} from "@pollinations/ui";
import { AUTH_COPY } from "../../copy/content/auth";
import { LINKS } from "../../copy/content/socialLinks";
import { useAuth } from "../../hooks/useAuth";
import { usePageCopy } from "../../hooks/usePageCopy";

export function UserMenu() {
    const { apiKey, isLoggedIn, profile, balance, login, logout } = useAuth();
    const { copy } = usePageCopy(AUTH_COPY);

    if (!isLoggedIn) {
        return (
            <div data-theme="accent" className="flex shrink-0">
                {/* Amber cell with the mark, then a light cell with the label. */}
                <Button
                    onClick={login}
                    className="h-12 gap-0 overflow-hidden whitespace-nowrap border border-theme-bg-active bg-surface-white p-0 text-base text-theme-text-strong hover:bg-surface-white [.dark_&]:bg-transparent [.dark_&]:hover:bg-transparent"
                >
                    <span
                        aria-hidden="true"
                        className="flex h-full w-12 shrink-0 items-center justify-center bg-theme-bg-active"
                    >
                        <BrandMark className="-top-px relative left-px h-7 w-7" />
                    </span>
                    <span className="px-4">{copy.loginButton}</span>
                </Button>
            </div>
        );
    }

    const displayName = profile?.githubUsername || copy.defaultUsername;

    return (
        <AccountMenu
            name={displayName}
            avatarUrl={profile?.image}
            className="max-w-80"
            secondaryContent={
                balance !== null
                    ? `${balance.balance.toFixed(1)} ${copy.pollenUnit}`
                    : undefined
            }
        >
            {(close) => (
                <>
                    <dl className="m-0 flex flex-col gap-3 px-3 py-2">
                        {profile && (
                            <div className="flex flex-col gap-0.5">
                                <Eyebrow as="dt" size="chrome">
                                    {copy.accountLabel}
                                </Eyebrow>
                                <dd className="m-0 font-semibold text-sm text-theme-text-strong">
                                    {displayName}
                                </dd>
                            </div>
                        )}
                        {balance !== null && (
                            <div className="flex flex-col gap-0.5">
                                <Eyebrow as="dt" size="chrome">
                                    {copy.balanceLabel}
                                </Eyebrow>
                                <dd className="m-0 font-semibold text-sm text-theme-text-strong tabular-nums">
                                    {balance.balance.toFixed(2)}{" "}
                                    {copy.pollenUnit}
                                </dd>
                            </div>
                        )}
                        <div className="flex flex-col gap-0.5">
                            <Eyebrow as="dt" size="chrome">
                                {copy.apiKeyLabel}
                            </Eyebrow>
                            <dd className="m-0 font-mono text-sm text-theme-text-muted">
                                {apiKey ? `${apiKey.slice(0, 4)}••••••••` : "—"}
                            </dd>
                        </div>
                    </dl>

                    {/* BYOP CTA */}
                    <DropdownItem
                        as="a"
                        href={LINKS.byopDocs}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={close}
                    >
                        <span className="flex flex-col gap-0.5">
                            <span className="font-semibold">
                                {copy.byopTitle}
                            </span>
                            <Text as="span" size="xs" tone="muted">
                                {copy.byopDescription}
                            </Text>
                            <Text as="span" size="xs" tone="strong">
                                {copy.byopLink} →
                            </Text>
                        </span>
                    </DropdownItem>

                    {/* Enter Dashboard */}
                    <DropdownItem
                        as="a"
                        href={LINKS.enter}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={close}
                    >
                        {copy.enterLink}
                        <ExternalLinkIcon
                            className="ml-auto h-3.5 w-3.5 shrink-0"
                            aria-hidden="true"
                        />
                    </DropdownItem>

                    {/* Logout */}
                    <DropdownItem
                        type="button"
                        onClick={() => {
                            close();
                            logout();
                        }}
                    >
                        <PowerIcon
                            className="h-4 w-4 shrink-0"
                            aria-hidden="true"
                        />
                        {copy.logoutButton}
                    </DropdownItem>
                </>
            )}
        </AccountMenu>
    );
}
