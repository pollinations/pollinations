import {
    PolliProvider,
    useAuthActions,
    useAuthKey,
    useAuthState,
} from "@pollinations_ai/sdk/react";
import {
    Button,
    Chip,
    KeyBudget,
    KeyExpiry,
    KeyModels,
    KeyPrefix,
    LinkButton,
    LoginButton,
    LogoutButton,
    Surface,
    Switch,
    UserAvatar,
    UserEmail,
    UserName,
} from "@pollinations_ai/ui";
import { type ReactNode, useEffect, useState } from "react";

// Publishable key for this showcase (pk_… is safe to commit).
// Created via `polli keys create --type publishable` with redirect URIs
// http://localhost:5173 and https://react.pollinations.ai.
const APP_KEY = "pk_kZRl8saq8s2h9ome";

type ToggleKey =
    | "avatar"
    | "name"
    | "email"
    | "keyBudget"
    | "keyExpiry"
    | "keyModels"
    | "permissions"
    | "keyPrefix";

const TOGGLES: { key: ToggleKey; label: string }[] = [
    { key: "avatar", label: "Avatar" },
    { key: "name", label: "Name" },
    { key: "email", label: "Email" },
    { key: "keyPrefix", label: "Key prefix" },
    { key: "keyExpiry", label: "Key expiry" },
    { key: "keyBudget", label: "Key budget" },
    { key: "keyModels", label: "Allowed models" },
    { key: "permissions", label: "Permissions" },
];

const permissionLabels: Record<string, string> = {
    profile: "Profile",
    usage: "Usage",
    keys: "Keys",
};

function SectionLabel({ children }: { children: ReactNode }) {
    return (
        <h2 className="text-xs font-semibold uppercase tracking-wider text-stone-500">
            {children}
        </h2>
    );
}

function SubSection({
    label,
    children,
}: {
    label: string;
    children: ReactNode;
}) {
    return (
        <section className="flex flex-col gap-3 border-t border-amber-950/10 pt-4">
            <h3 className="text-sm font-semibold text-stone-900">{label}</h3>
            {children}
        </section>
    );
}

function Metric({ label, children }: { label: string; children: ReactNode }) {
    return (
        <div className="flex min-w-0 flex-wrap items-center gap-2">
            <span className="text-xs font-semibold tracking-wide whitespace-nowrap text-stone-500 uppercase">
                {label}
            </span>
            {children}
        </div>
    );
}

function CopyButton({ text }: { text: string }) {
    const [copied, setCopied] = useState(false);

    useEffect(() => {
        if (!copied) return;
        const timer = setTimeout(() => setCopied(false), 1500);
        return () => clearTimeout(timer);
    }, [copied]);

    return (
        <Button
            type="button"
            theme="amber"
            size="small"
            onClick={() => {
                void navigator.clipboard.writeText(text).then(() => {
                    setCopied(true);
                });
            }}
        >
            {copied ? "Copied" : "Copy"}
        </Button>
    );
}

function DashboardLink() {
    const { enterUrl } = useAuthActions();
    return (
        <LinkButton theme="amber" href={enterUrl}>
            Dashboard
        </LinkButton>
    );
}

function UserCard({ enabled }: { enabled: Record<ToggleKey, boolean> }) {
    return (
        <Surface variant="panel" theme="amber">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex min-w-0 items-center gap-3">
                    {enabled.avatar && <UserAvatar size="md" />}
                    <div className="flex min-w-0 flex-col gap-0.5">
                        {enabled.name && <UserName />}
                        {enabled.email && <UserEmail />}
                    </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <DashboardLink />
                    <LogoutButton intent="danger">Log out</LogoutButton>
                </div>
            </div>
        </Surface>
    );
}

function GrantedAccess({ enabled }: { enabled: Record<ToggleKey, boolean> }) {
    const { permissions, isLoadingKey } = useAuthKey();
    return (
        <div className="flex flex-col items-start gap-2">
            {enabled.permissions &&
                (isLoadingKey ? (
                    <p className="text-sm text-stone-500">Checking access…</p>
                ) : (
                    permissions.map((permission) => (
                        <Chip theme="blue" key={permission}>
                            {permissionLabels[permission] ?? permission}
                        </Chip>
                    ))
                ))}
            {enabled.keyModels && (
                <div className="flex items-center gap-2">
                    <KeyModels />
                    <span className="text-xs text-stone-500">models</span>
                </div>
            )}
        </div>
    );
}

function KeyCard({ enabled }: { enabled: Record<ToggleKey, boolean> }) {
    const hasMeta = enabled.keyPrefix || enabled.keyExpiry;
    const hasAccess = enabled.permissions || enabled.keyModels;

    return (
        <Surface variant="panel" theme="amber" className="flex flex-col gap-4">
            {hasMeta && (
                <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
                    {enabled.keyPrefix && <KeyPrefix />}
                    {enabled.keyExpiry && (
                        <Metric label="Expires">
                            <KeyExpiry />
                        </Metric>
                    )}
                </div>
            )}
            {enabled.keyBudget && (
                <SubSection label="Budget">
                    <Metric label="Remaining">
                        <KeyBudget />
                    </Metric>
                </SubSection>
            )}
            {hasAccess && (
                <SubSection label="Granted access">
                    <GrantedAccess enabled={enabled} />
                </SubSection>
            )}
        </Surface>
    );
}

function Wallet({ enabled }: { enabled: Record<ToggleKey, boolean> }) {
    const { isLoggedIn } = useAuthState();
    if (!isLoggedIn) {
        return (
            <LoginButton theme="amber">Log in with Pollinations</LoginButton>
        );
    }

    const showUserCard = enabled.avatar || enabled.name || enabled.email;
    const showKeyCard =
        enabled.keyPrefix ||
        enabled.keyExpiry ||
        enabled.keyBudget ||
        enabled.keyModels ||
        enabled.permissions;

    return (
        <div className="flex flex-col gap-6">
            {showUserCard && (
                <section className="flex flex-col gap-3">
                    <SectionLabel>User</SectionLabel>
                    <UserCard enabled={enabled} />
                </section>
            )}
            {showKeyCard && (
                <section className="flex flex-col gap-3">
                    <SectionLabel>Key</SectionLabel>
                    <KeyCard enabled={enabled} />
                </section>
            )}
        </div>
    );
}

function buildCode(enabled: Record<ToggleKey, boolean>) {
    const showUserCard = enabled.avatar || enabled.name || enabled.email;
    const hasKeyMeta = enabled.keyPrefix || enabled.keyExpiry;
    const hasAccess = enabled.permissions || enabled.keyModels;
    const showKeyCard = hasKeyMeta || enabled.keyBudget || hasAccess;

    const uiImports = [
        enabled.permissions && "Chip",
        enabled.keyBudget && "KeyBudget",
        enabled.keyExpiry && "KeyExpiry",
        enabled.keyModels && "KeyModels",
        enabled.keyPrefix && "KeyPrefix",
        showUserCard && "LinkButton",
        showUserCard && "LogoutButton",
        (showUserCard || showKeyCard) && "Surface",
        enabled.avatar && "UserAvatar",
        enabled.email && "UserEmail",
        enabled.name && "UserName",
    ].filter(Boolean);

    const sdkHooks = ["PolliProvider"];
    if (showUserCard) sdkHooks.push("useAuthActions");
    if (enabled.permissions) sdkHooks.push("useAuthKey");

    const hookLines = [
        showUserCard && "    const { enterUrl } = useAuthActions();",
        enabled.permissions && "    const { permissions } = useAuthKey();",
    ].filter(Boolean);

    const identity = [
        enabled.avatar && '                        <UserAvatar size="md" />',
        (enabled.name || enabled.email) &&
            `                        <div className="flex flex-col">
${[
    enabled.name && "                            <UserName />",
    enabled.email && "                            <UserEmail />",
]
    .filter(Boolean)
    .join("\n")}
                        </div>`,
    ]
        .filter(Boolean)
        .join("\n");

    const userCardJsx = showUserCard
        ? `            <section className="flex flex-col gap-3">
                <h2>User</h2>
                <Surface variant="panel" theme="amber">
                    <div className="flex justify-between">
                        <div className="flex items-center gap-3">
${identity}
                        </div>
                        <div className="flex gap-2">
                            <LinkButton theme="amber" href={enterUrl}>Dashboard</LinkButton>
                            <LogoutButton intent="danger">Log out</LogoutButton>
                        </div>
                    </div>
                </Surface>
            </section>`
        : "";

    const keyMeta = [
        enabled.keyPrefix && "                    <KeyPrefix />",
        enabled.keyExpiry && "                    <KeyExpiry />",
    ]
        .filter(Boolean)
        .join("\n");

    const budgetBlock = enabled.keyBudget
        ? `                    <section>
                        <h3>Budget</h3>
                        <KeyBudget />
                    </section>`
        : "";

    const accessInner = [
        enabled.permissions &&
            `                        {permissions.map((p) => (
                            <Chip theme="blue" key={p}>{p}</Chip>
                        ))}`,
        enabled.keyModels && "                        <KeyModels />",
    ]
        .filter(Boolean)
        .join("\n");

    const accessBlock = hasAccess
        ? `                    <section>
                        <h3>Granted access</h3>
${accessInner}
                    </section>`
        : "";

    const keyCardInner = [keyMeta, budgetBlock, accessBlock]
        .filter(Boolean)
        .join("\n");

    const keyCardJsx = showKeyCard
        ? `            <section className="flex flex-col gap-3">
                <h2>Key</h2>
                <Surface variant="panel" theme="amber">
${keyCardInner}
                </Surface>
            </section>`
        : "";

    const walletBody = [userCardJsx, keyCardJsx].filter(Boolean).join("\n");

    const uiImportBlock =
        uiImports.length > 0
            ? `import {
${uiImports.map((c) => `    ${c},`).join("\n")}
} from "@pollinations_ai/ui";\n`
            : "";

    const sdkImportBlock = `import {
${sdkHooks.map((h) => `    ${h},`).join("\n")}
} from "@pollinations_ai/sdk/react";`;

    const hookBlock = hookLines.length > 0 ? `${hookLines.join("\n")}\n\n` : "";

    return `// 1) npm install @pollinations_ai/sdk @pollinations_ai/ui
// 2) Create a publishable key at https://enter.pollinations.ai and
//    whitelist your app's redirect URI. Replace APP_KEY below.

import "@pollinations_ai/ui/styles.css";
${sdkImportBlock}
${uiImportBlock}
const APP_KEY = "pk_your_key_here";

function Wallet() {
${hookBlock}    return (
        <div className="flex flex-col gap-6">
${walletBody}
        </div>
    );
}

export default function App() {
    return (
        <PolliProvider appKey={APP_KEY}>
            <Wallet />
        </PolliProvider>
    );
}`;
}

export default function App() {
    const [enabled, setEnabled] = useState<Record<ToggleKey, boolean>>({
        avatar: true,
        name: true,
        email: true,
        keyPrefix: true,
        keyBudget: true,
        keyExpiry: true,
        keyModels: true,
        permissions: true,
    });

    return (
        <div className="min-h-screen bg-stone-50 text-stone-900 font-sans">
            <main className="mx-auto flex max-w-3xl flex-col gap-8 px-6 pt-12 pb-16">
                <header>
                    <h1 className="text-2xl font-semibold tracking-tight">
                        @pollinations_ai/ui
                    </h1>
                    <p className="mt-1 text-stone-500">
                        Design primitives for Pollinations auth and wallet
                        surfaces. Compose your own wallet — toggle the pieces
                        below to see the matching code.
                    </p>
                </header>

                <PolliProvider appKey={APP_KEY}>
                    <Wallet enabled={enabled} />

                    <section className="flex flex-col gap-3">
                        <h2 className="text-xs font-semibold uppercase tracking-wider text-stone-500">
                            Toggle pieces
                        </h2>
                        <div className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
                            {TOGGLES.map((t) => (
                                <div
                                    key={t.key}
                                    className="flex items-center gap-3 text-sm text-stone-700"
                                >
                                    <Switch
                                        checked={enabled[t.key]}
                                        onChange={(checked) =>
                                            setEnabled((prev) => ({
                                                ...prev,
                                                [t.key]: checked,
                                            }))
                                        }
                                        ariaLabel={t.label}
                                    />
                                    <span>{t.label}</span>
                                </div>
                            ))}
                        </div>
                    </section>

                    <section className="flex flex-col gap-3">
                        <div className="flex items-center justify-between">
                            <h2 className="text-xs font-semibold uppercase tracking-wider text-stone-500">
                                Code
                            </h2>
                            <CopyButton text={buildCode(enabled)} />
                        </div>
                        <pre className="overflow-auto rounded-lg bg-stone-950 p-4 font-mono text-xs leading-relaxed text-stone-100">
                            <code>{buildCode(enabled)}</code>
                        </pre>
                    </section>
                </PolliProvider>
            </main>
        </div>
    );
}
