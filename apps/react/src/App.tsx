import { PolliProvider, useAuthState } from "@pollinations_ai/sdk/react";
import {
    Balance,
    KeyPrefix,
    LoginButton,
    LogoutButton,
    Surface,
    TopUpLink,
    UserAvatar,
    UserEmail,
    UserName,
} from "@pollinations_ai/ui";
import { useState } from "react";

// Publishable key for this showcase (pk_… is safe to commit).
// Created via `polli keys create --type publishable` with redirect URIs
// http://localhost:5173 and https://react.pollinations.ai.
const APP_KEY = "pk_kZRl8saq8s2h9ome";

type ToggleKey =
    | "avatar"
    | "name"
    | "email"
    | "balance"
    | "keyPrefix"
    | "topUp";

const TOGGLES: { key: ToggleKey; label: string; jsx: string }[] = [
    { key: "avatar", label: "Avatar", jsx: '<UserAvatar size="md" />' },
    { key: "name", label: "Name", jsx: "<UserName />" },
    { key: "email", label: "Email", jsx: "<UserEmail />" },
    { key: "balance", label: "Balance", jsx: "<Balance />" },
    { key: "keyPrefix", label: "Key prefix", jsx: "<KeyPrefix />" },
    {
        key: "topUp",
        label: "Top up",
        jsx: '<TopUpLink theme="amber">Top up</TopUpLink>',
    },
];

function Wallet({ enabled }: { enabled: Record<ToggleKey, boolean> }) {
    const { isLoggedIn } = useAuthState();
    const showHeader = enabled.avatar || enabled.name || enabled.email;
    const showIdentity = enabled.name || enabled.email;
    const showMeta = enabled.balance || enabled.keyPrefix;

    if (!isLoggedIn) {
        return (
            <LoginButton theme="amber">Log in with Pollinations</LoginButton>
        );
    }

    return (
        <Surface variant="panel" theme="amber" className="flex flex-col gap-4">
            {showHeader && (
                <div className="flex items-center gap-3">
                    {enabled.avatar && <UserAvatar size="md" />}
                    {showIdentity && (
                        <div className="flex flex-col gap-0.5 min-w-0">
                            {enabled.name && <UserName />}
                            {enabled.email && <UserEmail />}
                        </div>
                    )}
                </div>
            )}

            {showMeta && (
                <div className="flex flex-wrap items-center gap-2">
                    {enabled.balance && <Balance />}
                    {enabled.keyPrefix && <KeyPrefix />}
                </div>
            )}

            <div className="flex flex-wrap items-center gap-2">
                {enabled.topUp && <TopUpLink theme="amber">Top up</TopUpLink>}
                <LogoutButton theme="amber">Log out</LogoutButton>
            </div>
        </Surface>
    );
}

function buildCode(enabled: Record<ToggleKey, boolean>) {
    const avatar = enabled.avatar ? '      <UserAvatar size="md" />' : "";
    const identity = TOGGLES.filter((t) => ["name", "email"].includes(t.key))
        .filter((t) => enabled[t.key])
        .map((t) => `        ${t.jsx}`)
        .join("\n");
    const headerInner = [
        avatar,
        identity
            ? `      <div className="flex flex-col gap-0.5 min-w-0">\n${identity}\n      </div>`
            : "",
    ]
        .filter(Boolean)
        .join("\n");
    const meta = TOGGLES.filter((t) => ["balance", "keyPrefix"].includes(t.key))
        .filter((t) => enabled[t.key])
        .map((t) => `      ${t.jsx}`)
        .join("\n");
    const actions = [
        ...(enabled.topUp
            ? ['      <TopUpLink theme="amber">Top up</TopUpLink>']
            : []),
        '      <LogoutButton theme="amber">Log out</LogoutButton>',
    ].join("\n");

    const headerBlock = headerInner
        ? `    <div className="flex items-center gap-3">\n${headerInner}\n    </div>\n`
        : "";
    const metaBlock = meta
        ? `    <div className="flex flex-wrap items-center gap-2">\n${meta}\n    </div>\n`
        : "";

    return `<PolliProvider appKey="${APP_KEY}">
  <Surface variant="panel" theme="amber" className="flex flex-col gap-4">
${headerBlock}${metaBlock}    <div className="flex flex-wrap items-center gap-2">
${actions}
    </div>
  </Surface>
</PolliProvider>`;
}

export default function App() {
    const [enabled, setEnabled] = useState<Record<ToggleKey, boolean>>({
        avatar: true,
        name: true,
        email: false,
        balance: true,
        keyPrefix: false,
        topUp: true,
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

                    <div className="grid grid-cols-2 gap-4">
                        <section className="flex flex-col gap-3">
                            <h2 className="text-xs font-semibold uppercase tracking-wider text-stone-500">
                                Toggle pieces
                            </h2>
                            {TOGGLES.map((t) => (
                                <label
                                    key={t.key}
                                    className="flex cursor-pointer items-center gap-2 text-sm text-stone-700 select-none"
                                >
                                    <input
                                        type="checkbox"
                                        checked={enabled[t.key]}
                                        onChange={(e) =>
                                            setEnabled((prev) => ({
                                                ...prev,
                                                [t.key]: e.target.checked,
                                            }))
                                        }
                                    />
                                    {t.label}
                                </label>
                            ))}
                        </section>

                        <section className="flex flex-col gap-3">
                            <h2 className="text-xs font-semibold uppercase tracking-wider text-stone-500">
                                Code
                            </h2>
                            <pre className="overflow-auto rounded-lg bg-stone-950 p-4 font-mono text-xs leading-relaxed text-stone-100">
                                <code>{buildCode(enabled)}</code>
                            </pre>
                        </section>
                    </div>
                </PolliProvider>
            </main>
        </div>
    );
}
