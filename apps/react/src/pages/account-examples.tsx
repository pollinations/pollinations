import {
    AccountMenu,
    Button,
    CodeBlock,
    DropdownItem,
    SignOutIcon,
    Surface,
} from "@pollinations/ui";
import {
    AuthInfoCard,
    AuthModal,
    AuthModalHeader,
    ErrorBanner,
} from "@pollinations/ui/auth";
import {
    formatPollen,
    PaidChip,
    TierChip,
    WalletBalanceCard,
    WalletKindIcon,
} from "@pollinations/ui/wallet";
import { useState } from "react";
import { PrimitiveExample, SectionHeader } from "./reference-layout";

const contexts = [
    {
        id: "owner",
        title: "Account owner",
        context: "Pollinations account",
        action: "Sign out of Enter",
        description:
            "Enter’s GitHub-backed session manages the whole account: balances, purchases, keys and account settings. Apps do not receive this session.",
        links: [
            "Account settings",
            "Wallet / buy Pollen",
            "API keys & connected apps",
        ],
    },
    {
        id: "app",
        title: "Connected app",
        context: "App allowance: 2.500 Pollen",
        action: "Log out from this app",
        description:
            "Connect authorizes one app to use a delegated secret key. Its allowed models, expiry, allowance and optional account permissions limit access. Buying Pollen does not increase a key’s allowance.",
        links: ["Allowed models & key details", "Manage account / buy Pollen"],
    },
    {
        id: "dashboard",
        title: "Operations dashboard",
        context: "Dashboard session",
        action: "Sign out of dashboard",
        description:
            "Economics, KPI and Observability use identity-only login. Enter checks administrator access with Better Auth; each dashboard keeps its own signed HttpOnly session. No generation key is issued.",
        links: ["Signed-in profile"],
    },
] as const;

export function AccountMenuExample() {
    const [message, setMessage] = useState(
        "Example data — menu actions stay on this page.",
    );
    return (
        <div className="space-y-3">
            <AccountMenu name="Alex Morgan" secondaryContent="Example account">
                {(close) => (
                    <>
                        <DropdownItem
                            onClick={() => {
                                close();
                                setMessage(
                                    "Account settings selected (example).",
                                );
                            }}
                        >
                            Account settings
                        </DropdownItem>
                        <DropdownItem
                            onClick={() => {
                                close();
                                setMessage("Signed out of the example only.");
                            }}
                        >
                            <SignOutIcon className="h-4 w-4" />
                            Sign out
                        </DropdownItem>
                    </>
                )}
            </AccountMenu>
            <output className="block text-xs text-theme-text-muted">
                {message}
            </output>
            <CodeBlock
                code={
                    'import { AccountMenu, DropdownItem } from "@pollinations/ui";\n\n<AccountMenu name={user.name} avatarUrl={user.image}>\n  {(close) => (\n    <DropdownItem onClick={() => { close(); signOut(); }}>\n      Sign out\n    </DropdownItem>\n  )}\n</AccountMenu>'
                }
            />
        </div>
    );
}

export function AccountContexts() {
    const [signedOut, setSignedOut] = useState<string[]>([]);
    const [message, setMessage] = useState(
        "These previews use fictional data. Nothing is connected or purchased.",
    );
    return (
        <section id="account-contexts" className="space-y-4">
            <SectionHeader title="One account, different access">
                A shared menu is not a shared login. Use the composition for
                appearance, the SDK for delegated API access, and the server
                auth package for dashboard sessions.
            </SectionHeader>
            <div className="grid gap-3">
                {contexts.map((item) => (
                    <PrimitiveExample
                        key={item.id}
                        name={item.title}
                        description={item.description}
                    >
                        <div className="space-y-3">
                            <span className="block text-xs font-semibold uppercase tracking-wide text-theme-text-muted">
                                Example data
                            </span>
                            {signedOut.includes(item.id) ? (
                                <Button
                                    onClick={() => {
                                        setSignedOut((ids) =>
                                            ids.filter((id) => id !== item.id),
                                        );
                                        setMessage(
                                            `${item.title}: preview reset. No login performed.`,
                                        );
                                    }}
                                >
                                    Reset {item.title.toLowerCase()} preview
                                </Button>
                            ) : (
                                <AccountMenu
                                    name="Alex Morgan"
                                    secondaryContent={item.context}
                                    menuLabel={`${item.title} example menu`}
                                    menuClassName="polli:w-64"
                                >
                                    {(close) => (
                                        <>
                                            {item.links.map((label) => (
                                                <DropdownItem
                                                    key={label}
                                                    onClick={() => {
                                                        close();
                                                        setMessage(
                                                            `${item.title}: ${label} selected. This is a preview, not a live action.`,
                                                        );
                                                    }}
                                                >
                                                    {label}
                                                </DropdownItem>
                                            ))}
                                            <DropdownItem
                                                onClick={() => {
                                                    close();
                                                    setSignedOut((ids) => [
                                                        ...ids,
                                                        item.id,
                                                    ]);
                                                    setMessage(
                                                        `${item.action}: only this preview changed. The other sessions are independent.`,
                                                    );
                                                }}
                                            >
                                                <SignOutIcon className="h-4 w-4" />
                                                {item.action}
                                            </DropdownItem>
                                        </>
                                    )}
                                </AccountMenu>
                            )}
                        </div>
                    </PrimitiveExample>
                ))}
            </div>
            <output className="block text-sm text-theme-text-soft">
                {message}
            </output>
            <Surface variant="panel" className="space-y-3 text-sm leading-6">
                <h3 className="font-bold">Which layer owns what?</h3>
                <dl className="space-y-3">
                    <div>
                        <dt className="font-mono font-semibold">
                            @pollinations/ui
                        </dt>
                        <dd>
                            AccountMenu is an SDK-free composition of Dropdown,
                            avatar/name and caller-provided actions. It has no
                            login or permission logic.
                        </dd>
                    </div>
                    <div>
                        <dt className="font-mono font-semibold">
                            @pollinations/ui/app-user-menu/sdk
                        </dt>
                        <dd>
                            AppUserMenu integrates that composition with
                            PolliProvider. It connects the app, reads the
                            permitted profile and key balance, and forgets the
                            app’s stored key on logout. Logout does not revoke
                            the authorization or sign out of Enter.
                        </dd>
                    </div>
                    <div>
                        <dt className="font-mono font-semibold">
                            @pollinations/auth
                        </dt>
                        <dd>
                            Server-only, first-party dashboard integration:
                            OAuth code + PKCE, an identity-only token for one
                            userinfo call, then a 12-hour origin-bound session.
                            Administrator permission is checked by Enter, not by
                            the menu.
                        </dd>
                    </div>
                </dl>
                <p>
                    Open WebUI keeps its native menu. Its Pollinations OAuth
                    connection also carries delegated API access, so it is not
                    the same as identity-only operations login.
                </p>
            </Surface>
            <CodeBlock
                code={
                    'import { PolliProvider } from "@pollinations/sdk/react";\nimport { AppUserMenu } from "@pollinations/ui/app-user-menu/sdk";\n\n// pk_ identifies your app. Never embed an owner secret key.\n<PolliProvider appKey={PUBLIC_APP_KEY}>\n  <AppUserMenu dashboardHref="https://enter.pollinations.ai" />\n</PolliProvider>'
                }
            />
        </section>
    );
}

export function WalletExamples() {
    return (
        <section id="wallet" className="space-y-3">
            <SectionHeader title="Wallet — display components">
                Import from @pollinations/ui/wallet. These components display
                supplied values; they never fetch a balance or grant billing
                access. All values below are examples.
            </SectionHeader>
            <PrimitiveExample
                name="WalletBalanceCard"
                description="Two sources fund one wallet. The API’s legacy tier field represents Quest Pollen; paid represents purchased Pollen."
            >
                <div className="grid gap-3 sm:grid-cols-2">
                    <WalletBalanceCard
                        kind="tier"
                        label="Quest Pollen"
                        value={formatPollen(3.25)}
                    />
                    <WalletBalanceCard
                        kind="paid"
                        label="Paid Pollen"
                        value={formatPollen(12.5)}
                    />
                </div>
            </PrimitiveExample>
            <PrimitiveExample
                name="PaidChip · TierChip · WalletKindIcon"
                description="Consistent labels and icons for paid and Quest balances. formatPollen formats values; it does not calculate available spending."
            >
                <div className="flex flex-wrap gap-2">
                    <TierChip>
                        <WalletKindIcon kind="tier" />
                        Quest Pollen
                    </TierChip>
                    <PaidChip>
                        <WalletKindIcon kind="paid" />
                        Paid Pollen
                    </PaidChip>
                </div>
            </PrimitiveExample>
            <Surface variant="panel" className="space-y-2 text-sm leading-6">
                <p>
                    A budgeted key’s <code>balance</code> is its remaining
                    allowance, not the full account wallet. Spending still needs
                    sufficient wallet funds.
                </p>
                <p>
                    The optional <code>usage</code> permission allows
                    account-wide balance and usage access. Without it, do not
                    infer the wallet from a key’s allowance. A top-up funds the
                    wallet; changing the app’s allowance is a separate account
                    action.
                </p>
            </Surface>
        </section>
    );
}

export function AuthPresentationExamples() {
    const [preview, setPreview] = useState<"info" | "error" | "loading" | null>(
        null,
    );
    return (
        <section className="space-y-3">
            <SectionHeader title="Auth — presentation components">
                Import from @pollinations/ui/auth. These are SDK-free surfaces
                for Enter’s sign-in and consent pages, not an additional login
                system.
            </SectionHeader>
            <PrimitiveExample
                name="AuthModal · AuthModalHeader · AuthInfoCard · ErrorBanner"
                description="Preview the full-page authorization surface and its error state. Closing only dismisses this example."
            >
                <div className="flex flex-wrap gap-2">
                    <Button onClick={() => setPreview("info")}>
                        Preview auth surface
                    </Button>
                    <Button onClick={() => setPreview("error")}>
                        Preview auth error
                    </Button>
                    <Button onClick={() => setPreview("loading")}>
                        Preview loading state
                    </Button>
                </div>
            </PrimitiveExample>
            <PrimitiveExample
                name="AuthModalLoading"
                description="The ready-made loading screen composes AuthModal and AuthModalHeader. Use it while the Enter session is being checked."
            >
                <CodeBlock
                    code={
                        'import { AuthModalLoading } from "@pollinations/ui/auth";\n\nif (isPending) return <AuthModalLoading />;'
                    }
                />
            </PrimitiveExample>
            {preview && (
                <AuthModal
                    dialog={{ label: "Example authorization surface" }}
                    tone={preview === "error" ? "error" : undefined}
                >
                    <AuthModalHeader>
                        <span className="text-xs text-theme-text-muted">
                            Example only
                        </span>
                    </AuthModalHeader>
                    <div className="space-y-4 p-6">
                        {preview === "error" ? (
                            <ErrorBanner>
                                This example app’s connection expired. Connect
                                again to review its permissions.
                            </ErrorBanner>
                        ) : preview === "loading" ? (
                            <output>Loading…</output>
                        ) : (
                            <AuthInfoCard title="Connect an app">
                                <p>
                                    Authorize access to selected models and an
                                    app allowance. Optional profile and usage
                                    permissions should be requested only when
                                    needed.
                                </p>
                            </AuthInfoCard>
                        )}
                        <Button onClick={() => setPreview(null)}>
                            Close preview
                        </Button>
                    </div>
                </AuthModal>
            )}
        </section>
    );
}
