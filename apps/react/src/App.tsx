import { PolliProvider, useAuthState } from "@pollinations_ai/sdk/react";
import {
    Balance,
    KeyPrefix,
    LoginButton,
    LogoutButton,
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

const styles = {
    body: {
        margin: 0,
        fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
        background: "#fafaf7",
        color: "#1a1a1a",
        minHeight: "100vh",
    },
    main: {
        maxWidth: 760,
        margin: "0 auto",
        padding: "3rem 1.5rem 4rem",
        display: "flex",
        flexDirection: "column" as const,
        gap: "2rem",
    },
    h1: { fontSize: "1.6rem", margin: "0 0 0.25rem" },
    lede: { color: "#666", margin: 0 },
    grid: {
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: "1rem",
    },
    section: {
        display: "flex",
        flexDirection: "column" as const,
        gap: "0.75rem",
    },
    sectionTitle: {
        fontSize: "0.8rem",
        fontWeight: 600,
        textTransform: "uppercase" as const,
        letterSpacing: "0.06em",
        color: "#777",
        margin: 0,
    },
    toggleRow: {
        display: "flex",
        alignItems: "center",
        gap: "0.5rem",
        fontSize: "0.85rem",
        color: "#333",
        cursor: "pointer",
        userSelect: "none" as const,
    },
    pre: {
        margin: 0,
        padding: "1rem",
        background: "#0f0e0c",
        color: "#e6e6e1",
        borderRadius: 8,
        fontFamily: "ui-monospace, Menlo, monospace",
        fontSize: "0.78rem",
        lineHeight: 1.55,
        overflow: "auto",
    },
};

const WALLET_CARD_CLASS =
    "polli:flex polli:flex-col polli:gap-4 polli:p-4 polli:rounded-xl " +
    "polli:border polli:border-theme-border polli:bg-theme-bg-subtle";
const WALLET_HEADER_CLASS = "polli:flex polli:items-center polli:gap-3";
const WALLET_IDENTITY_CLASS =
    "polli:flex polli:flex-col polli:gap-0.5 polli:min-w-0";
const WALLET_ROW_CLASS =
    "polli:flex polli:items-center polli:gap-2 polli:flex-wrap";

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
        <div data-theme="amber" className={WALLET_CARD_CLASS}>
            {showHeader && (
                <div className={WALLET_HEADER_CLASS}>
                    {enabled.avatar && <UserAvatar size="md" />}
                    {showIdentity && (
                        <div className={WALLET_IDENTITY_CLASS}>
                            {enabled.name && <UserName />}
                            {enabled.email && <UserEmail />}
                        </div>
                    )}
                </div>
            )}

            {showMeta && (
                <div className={WALLET_ROW_CLASS}>
                    {enabled.balance && <Balance />}
                    {enabled.keyPrefix && <KeyPrefix />}
                </div>
            )}

            <div className={WALLET_ROW_CLASS}>
                {enabled.topUp && <TopUpLink theme="amber">Top up</TopUpLink>}
                <LogoutButton theme="amber">Log out</LogoutButton>
            </div>
        </div>
    );
}

function buildCode(enabled: Record<ToggleKey, boolean>) {
    const block = (className: string, content: string) =>
        content
            ? `    <div className="${className}">\n${content}\n    </div>\n`
            : "";
    const avatar = enabled.avatar ? '      <UserAvatar size="md" />' : "";
    const identity = TOGGLES.filter((t) => ["name", "email"].includes(t.key))
        .filter((t) => enabled[t.key])
        .map((t) => `        ${t.jsx}`)
        .join("\n");
    const header = [
        avatar,
        identity
            ? `      <div className="${WALLET_IDENTITY_CLASS}">\n${identity}\n      </div>`
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

    return `<PolliProvider appKey="${APP_KEY}">
  <div data-theme="amber" className="${WALLET_CARD_CLASS}">
${block(WALLET_HEADER_CLASS, header)}${block(WALLET_ROW_CLASS, meta)}    <div className="${WALLET_ROW_CLASS}">
${actions}
    </div>
  </div>
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
        <div style={styles.body}>
            <main style={styles.main}>
                <header>
                    <h1 style={styles.h1}>@pollinations_ai/ui</h1>
                    <p style={styles.lede}>
                        Design primitives for Pollinations auth and wallet
                        surfaces. Compose your own wallet — toggle the pieces
                        below to see the matching code.
                    </p>
                </header>

                <PolliProvider appKey={APP_KEY}>
                    <Wallet enabled={enabled} />

                    <div style={styles.grid}>
                        <section style={styles.section}>
                            <h2 style={styles.sectionTitle}>Toggle pieces</h2>
                            {TOGGLES.map((t) => (
                                <label key={t.key} style={styles.toggleRow}>
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

                        <section style={styles.section}>
                            <h2 style={styles.sectionTitle}>Code</h2>
                            <pre style={styles.pre}>
                                <code>{buildCode(enabled)}</code>
                            </pre>
                        </section>
                    </div>
                </PolliProvider>
            </main>
        </div>
    );
}
