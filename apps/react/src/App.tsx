import {
    PolliProvider,
    useAccountKey,
    useAuthActions,
    useAuthState,
} from "@pollinations_ai/sdk/react";
import {
    Button,
    Chip,
    ExternalLinkButton,
    Surface,
    Switch,
} from "@pollinations_ai/ui";
import {
    LoginButton,
    LogoutButton,
    UserAvatar,
    UserEmail,
    UserName,
} from "@pollinations_ai/ui/auth";
import {
    KeyBudget,
    KeyExpiry,
    KeyModels,
    KeyPrefix,
} from "@pollinations_ai/ui/wallet";
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

type ToggleGroup = "user" | "key";

const TOGGLES: { key: ToggleKey; label: string; group: ToggleGroup }[] = [
    { key: "avatar", label: "Avatar", group: "user" },
    { key: "name", label: "Name", group: "user" },
    { key: "email", label: "Email", group: "user" },
    { key: "keyPrefix", label: "Key prefix", group: "key" },
    { key: "keyExpiry", label: "Key expiry", group: "key" },
    { key: "keyBudget", label: "Key budget", group: "key" },
    { key: "keyModels", label: "Allowed models", group: "key" },
    { key: "permissions", label: "Permissions", group: "key" },
];

const TOGGLE_GROUPS: { id: ToggleGroup; label: string }[] = [
    { id: "user", label: "User" },
    { id: "key", label: "Key" },
];

const permissionLabels: Record<string, string> = {
    profile: "Profile",
    usage: "Usage",
    keys: "Keys",
};

function Metric({ label, children }: { label: string; children: ReactNode }) {
    return (
        <div className="flex flex-wrap items-center gap-2">
            <span className="w-24 shrink-0 text-xs font-semibold uppercase tracking-wide text-stone-500">
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
        <ExternalLinkButton theme="amber" href={enterUrl}>
            Dashboard
        </ExternalLinkButton>
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

function KeyCard({ enabled }: { enabled: Record<ToggleKey, boolean> }) {
    const { data: key, isLoading } = useAccountKey({
        enabled: enabled.keyBudget || enabled.keyExpiry || enabled.permissions,
    });
    const permissions = key?.permissions?.account ?? [];
    const showBudget = enabled.keyBudget && key?.pollenBudget != null;
    const showExpiry = enabled.keyExpiry && !!key?.expiresAt;
    const showPrefix = enabled.keyPrefix;
    const showPermissions = enabled.permissions;
    const showModels = enabled.keyModels;

    if (
        !showPrefix &&
        !showExpiry &&
        !showBudget &&
        !showPermissions &&
        !showModels &&
        !isLoading
    ) {
        return null;
    }

    return (
        <Surface variant="panel" theme="amber" className="flex flex-col gap-3">
            {showPrefix && (
                <Metric label="Key">
                    <KeyPrefix />
                </Metric>
            )}
            {showExpiry && (
                <Metric label="Expires">
                    <KeyExpiry />
                </Metric>
            )}
            {showBudget && (
                <Metric label="Remaining">
                    <KeyBudget />
                </Metric>
            )}
            {showPermissions && (
                <Metric label="Permission">
                    {isLoading ? (
                        <span className="text-sm text-stone-500">
                            Checking permissions…
                        </span>
                    ) : (
                        permissions.map((p) => (
                            <Chip theme="blue" key={p}>
                                {permissionLabels[p] ?? p}
                            </Chip>
                        ))
                    )}
                </Metric>
            )}
            {showModels && (
                <Metric label="Models">
                    <KeyModels />
                </Metric>
            )}
        </Surface>
    );
}

function SessionActions() {
    return (
        <Surface
            variant="panel"
            theme="amber"
            className="flex items-center justify-between gap-3"
        >
            <span className="text-sm text-stone-600">Signed in</span>
            <div className="flex flex-wrap items-center gap-2">
                <DashboardLink />
                <LogoutButton intent="danger">Log out</LogoutButton>
            </div>
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
        <div className="flex flex-col gap-4">
            {showUserCard && <UserCard enabled={enabled} />}
            {showKeyCard && <KeyCard enabled={enabled} />}
            {!showUserCard && <SessionActions />}
        </div>
    );
}

function buildCode(enabled: Record<ToggleKey, boolean>) {
    const showUserCard = enabled.avatar || enabled.name || enabled.email;
    const hasKeyMeta = enabled.keyPrefix || enabled.keyExpiry;
    const showKeyCard =
        hasKeyMeta ||
        enabled.keyBudget ||
        enabled.permissions ||
        enabled.keyModels;

    const primitiveImports = [
        "ExternalLinkButton",
        "Surface",
        enabled.permissions && "Chip",
    ].filter(Boolean) as string[];

    const authImports = [
        "LoginButton",
        "LogoutButton",
        enabled.avatar && "UserAvatar",
        enabled.email && "UserEmail",
        enabled.name && "UserName",
    ].filter(Boolean) as string[];

    const walletImports = [
        enabled.keyBudget && "KeyBudget",
        enabled.keyExpiry && "KeyExpiry",
        enabled.keyModels && "KeyModels",
        enabled.keyPrefix && "KeyPrefix",
    ].filter(Boolean) as string[];

    const sdkHooks = ["PolliProvider", "useAuthActions", "useAuthState"];
    if (enabled.permissions) sdkHooks.push("useAccountKey");

    const hookLines = [
        "    const { isLoggedIn } = useAuthState();",
        "    const { enterUrl } = useAuthActions();",
        enabled.permissions &&
            "    const { data: key } = useAccountKey();\n    const permissions = key?.permissions?.account ?? [];",
    ].filter(Boolean) as string[];

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
        ? `                <Surface variant="panel" theme="amber">
                    <div className="flex justify-between">
                        <div className="flex items-center gap-3">
${identity}
                        </div>
                        <div className="flex gap-2">
                            <ExternalLinkButton theme="amber" href={enterUrl}>Dashboard</ExternalLinkButton>
                            <LogoutButton intent="danger">Log out</LogoutButton>
                        </div>
                    </div>
                </Surface>`
        : "";

    const row = (
        label: string,
        body: string,
    ) => `                    <div className="flex flex-wrap items-center gap-2">
                        <span className="w-24 shrink-0 text-xs font-semibold uppercase tracking-wide text-stone-500">${label}</span>
${body}
                    </div>`;

    const permissionRow = enabled.permissions
        ? row(
              "Permission",
              `                        {permissions.map((p) => (
                            <Chip theme="blue" key={p}>{PERMISSION_LABELS[p] ?? p}</Chip>
                        ))}`,
          )
        : "";

    const modelsRow = enabled.keyModels
        ? row("Models", "                        <KeyModels />")
        : "";

    const keyRows = [
        enabled.keyPrefix &&
            row("Key", "                        <KeyPrefix />"),
        enabled.keyExpiry &&
            row("Expires", "                        <KeyExpiry />"),
        enabled.keyBudget &&
            row("Remaining", "                        <KeyBudget />"),
        permissionRow,
        modelsRow,
    ]
        .filter(Boolean)
        .join("\n");

    const sessionStripJsx = !showUserCard
        ? `                <Surface variant="panel" theme="amber" className="flex items-center justify-between gap-3">
                    <span className="text-sm text-stone-600">Signed in</span>
                    <div className="flex gap-2">
                        <ExternalLinkButton theme="amber" href={enterUrl}>Dashboard</ExternalLinkButton>
                        <LogoutButton intent="danger">Log out</LogoutButton>
                    </div>
                </Surface>`
        : "";

    const keyCardJsx = showKeyCard
        ? `                <Surface variant="panel" theme="amber" className="flex flex-col gap-3">
${keyRows}
                </Surface>`
        : "";

    const walletBody = [userCardJsx, keyCardJsx, sessionStripJsx]
        .filter(Boolean)
        .join("\n");

    const permissionLabelsBlock = enabled.permissions
        ? `\nconst PERMISSION_LABELS: Record<string, string> = {
    profile: "Profile",
    usage: "Usage",
    keys: "Keys",
};\n`
        : "";

    const uiImportBlock = `import {
${primitiveImports.map((c) => `    ${c},`).join("\n")}
} from "@pollinations_ai/ui";\n`;

    const authImportBlock = `import {
${authImports.map((c) => `    ${c},`).join("\n")}
} from "@pollinations_ai/ui/auth";\n`;

    const walletImportBlock =
        walletImports.length > 0
            ? `import {
${walletImports.map((c) => `    ${c},`).join("\n")}
} from "@pollinations_ai/ui/wallet";\n`
            : "";

    const sdkImportBlock = `import {
${sdkHooks.map((h) => `    ${h},`).join("\n")}
} from "@pollinations_ai/sdk/react";`;

    const hookBlock = `${hookLines.join("\n")}\n\n`;

    return `// 1) npm install @pollinations_ai/sdk @pollinations_ai/ui
// 2) Create a publishable key at https://enter.pollinations.ai and
//    whitelist your app's redirect URI. Replace APP_KEY below.

import "@pollinations_ai/ui/styles.css";
${sdkImportBlock}
${uiImportBlock}
${authImportBlock}
${walletImportBlock}
const APP_KEY = "pk_your_key_here";
${permissionLabelsBlock}
function Wallet() {
${hookBlock}    if (!isLoggedIn) {
        return <LoginButton theme="amber">Log in with Pollinations</LoginButton>;
    }
    return (
        <div className="flex flex-col gap-4">
${walletBody}
        </div>
    );
}

export default function App() {
    return (
        <PolliProvider appKey={APP_KEY} permissions={["profile"]}>
            <Wallet />
        </PolliProvider>
    );
}`;
}

const POLLI_TOKENS = [
    "PolliProvider",
    "useAuthActions",
    "useAccountKey",
    "useAuthState",
    "Surface",
    "Chip",
    "KeyBudget",
    "KeyExpiry",
    "KeyModels",
    "KeyPrefix",
    "ExternalLinkButton",
    "LoginButton",
    "LogoutButton",
    "UserAvatar",
    "UserEmail",
    "UserName",
];

const KEYWORDS = [
    "import",
    "from",
    "const",
    "function",
    "return",
    "export",
    "default",
];

function highlightCode(code: string): ReactNode[] {
    const re = new RegExp(
        [
            "(\\/\\/[^\\n]*)", // 1: comment
            '("[^"]*")', // 2: string
            `\\b(${KEYWORDS.join("|")})\\b`, // 3: keyword
            `\\b(${POLLI_TOKENS.join("|")})\\b`, // 4: polli identifier
            "(<\\/?)([a-z][a-z0-9]*)", // 5,6: html tag punct + name
        ].join("|"),
        "g",
    );

    const nodes: ReactNode[] = [];
    let last = 0;
    let i = 0;
    for (const m of code.matchAll(re)) {
        if (m.index > last) nodes.push(code.slice(last, m.index));
        const [, comment, str, kw, polli, tagPunct, tagName] = m;
        const cls = comment
            ? "text-stone-500"
            : str
              ? "text-amber-300"
              : kw
                ? "text-pink-300"
                : polli
                  ? "text-teal-300"
                  : "";
        if (cls) {
            nodes.push(
                <span key={i++} className={cls}>
                    {m[0]}
                </span>,
            );
        } else if (tagPunct) {
            nodes.push(tagPunct);
            nodes.push(
                <span key={i++} className="text-violet-300">
                    {tagName}
                </span>,
            );
        }
        last = m.index + m[0].length;
    }
    if (last < code.length) nodes.push(code.slice(last));
    return nodes;
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
    const code = buildCode(enabled);

    return (
        <div className="min-h-screen bg-stone-50 text-stone-900 font-sans">
            <main className="mx-auto flex max-w-3xl flex-col gap-8 px-6 pt-12 pb-16">
                <header>
                    <h1 className="text-2xl font-semibold tracking-tight">
                        @pollinations_ai/ui
                    </h1>
                    <p className="mt-1 text-stone-500">
                        React primitives for Pollinations auth and wallets.
                        Toggle the pieces below to compose your own — copy the
                        code to drop it into your app.
                    </p>
                </header>

                <PolliProvider appKey={APP_KEY} permissions={["profile"]}>
                    <Wallet enabled={enabled} />

                    <section className="flex flex-col gap-5">
                        <h2 className="text-xs font-semibold uppercase tracking-wider text-stone-500">
                            Toggle pieces
                        </h2>
                        {TOGGLE_GROUPS.map((group) => (
                            <div key={group.id} className="flex flex-col gap-3">
                                <h3 className="text-xs font-medium uppercase tracking-wide text-stone-400">
                                    {group.label}
                                </h3>
                                <div className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
                                    {TOGGLES.filter(
                                        (t) => t.group === group.id,
                                    ).map((t) => (
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
                            </div>
                        ))}
                    </section>

                    <section className="flex flex-col gap-3">
                        <div className="flex items-center justify-between">
                            <h2 className="text-xs font-semibold uppercase tracking-wider text-stone-500">
                                Code
                            </h2>
                            <CopyButton text={code} />
                        </div>
                        <pre className="overflow-auto rounded-lg bg-stone-950 p-4 font-mono text-xs leading-relaxed text-stone-100">
                            <code>{highlightCode(code)}</code>
                        </pre>
                    </section>
                </PolliProvider>
            </main>
        </div>
    );
}
