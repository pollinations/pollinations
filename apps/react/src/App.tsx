import {
    PolliProvider,
    useAuthActions,
    useAuthKey,
    useAuthState,
    useKeyUsage,
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
    UserAvatar,
    UserEmail,
    UserName,
} from "@pollinations_ai/ui";
import { type ReactNode, useState } from "react";

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
    | "keyPrefix"
    | "keyUsage";

const TOGGLES: { key: ToggleKey; label: string; jsx: string }[] = [
    { key: "avatar", label: "Avatar", jsx: '<UserAvatar size="md" />' },
    { key: "name", label: "Name", jsx: "<UserName />" },
    { key: "email", label: "Email", jsx: "<UserEmail />" },
    { key: "keyPrefix", label: "Key prefix", jsx: "<KeyPrefix />" },
    { key: "keyBudget", label: "Key budget", jsx: "<KeyBudget />" },
    { key: "keyExpiry", label: "Key expiry", jsx: "<KeyExpiry />" },
    { key: "keyModels", label: "Allowed models", jsx: "<KeyModels />" },
    {
        key: "permissions",
        label: "Permissions",
        jsx: '{permissions.map((permission) => <Chip theme="blue" size="sm" key={permission}>{permission}</Chip>)}',
    },
    {
        key: "keyUsage",
        label: "Key usage",
        jsx: "const { usage } = useKeyUsage({ days: 7, limit: 5 });",
    },
];

const dateFormatter = new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
});

const permissionLabels: Record<string, string> = {
    profile: "Profile",
    usage: "Usage",
    keys: "Keys",
};

function formatTimestamp(value: string) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return dateFormatter.format(date);
}

function formatCost(value: number) {
    if (!Number.isFinite(value)) return "-";
    return `$${value.toFixed(4)}`;
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

function SectionHeading({
    title,
    children,
}: {
    title: string;
    children?: ReactNode;
}) {
    return (
        <div>
            <h3 className="font-['Fraunces'] text-lg leading-tight font-medium text-stone-900">
                {title}
            </h3>
            {children && (
                <p className="mt-1 text-sm text-stone-600">{children}</p>
            )}
        </div>
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

function UserSection({ enabled }: { enabled: Record<ToggleKey, boolean> }) {
    const showIdentity = enabled.name || enabled.email;

    return (
        <section className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex min-w-0 items-center gap-3">
                {enabled.avatar && <UserAvatar size="md" />}
                <div className="flex min-w-0 flex-col gap-1">
                    {showIdentity && (
                        <div className="flex min-w-0 flex-col gap-0.5">
                            {enabled.name && <UserName />}
                            {enabled.email && <UserEmail />}
                        </div>
                    )}
                </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
                <DashboardLink />
                <LogoutButton intent="danger">Log out</LogoutButton>
            </div>
        </section>
    );
}

function KeyMetaSection({ enabled }: { enabled: Record<ToggleKey, boolean> }) {
    const showMeta = enabled.keyPrefix || enabled.keyExpiry;
    if (!showMeta) return null;

    return (
        <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
            {enabled.keyPrefix && <KeyPrefix />}
            {enabled.keyExpiry && (
                <Metric label="Expires">
                    <KeyExpiry />
                </Metric>
            )}
        </div>
    );
}

function BudgetSection({ enabled }: { enabled: Record<ToggleKey, boolean> }) {
    const showBudget = enabled.keyBudget;
    if (!showBudget) return null;

    return (
        <section className="flex flex-col gap-3 border-t border-amber-950/10 pt-4">
            <SectionHeading title="Budget">
                Remaining pollen available to this delegated key.
            </SectionHeading>
            <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
                <Metric label="Remaining">
                    <KeyBudget />
                </Metric>
            </div>
        </section>
    );
}

function GrantedAccessSection({
    enabled,
}: {
    enabled: Record<ToggleKey, boolean>;
}) {
    const { permissions, isLoadingKey } = useAuthKey();
    const showAccess = enabled.permissions || enabled.keyModels;
    if (!showAccess) return null;

    return (
        <section className="flex flex-col gap-3 border-t border-amber-950/10 pt-4">
            <SectionHeading title="Granted access" />
            <div className="flex flex-wrap items-center gap-2">
                {enabled.permissions &&
                    (isLoadingKey ? (
                        <p className="text-sm text-stone-500">
                            Checking access…
                        </p>
                    ) : permissions.length > 0 ? (
                        permissions.map((permission) => (
                            <Chip theme="blue" size="sm" key={permission}>
                                {permissionLabels[permission] ?? permission}
                            </Chip>
                        ))
                    ) : null)}
                {enabled.keyModels && <KeyModels />}
            </div>
        </section>
    );
}

function UsageSnapshot() {
    const { usage, isLoading, error, refresh } = useKeyUsage({
        days: 7,
        limit: 5,
    });
    const records = usage?.usage ?? [];
    const count = usage?.count ?? 0;

    return (
        <section className="flex flex-col gap-3 border-t border-amber-950/10 pt-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <SectionHeading title="Usage">
                    Recent requests charged through this user key.
                </SectionHeading>
                <Button
                    type="button"
                    theme="amber"
                    disabled={isLoading}
                    onClick={() => void refresh()}
                >
                    {isLoading ? "Loading" : "Refresh usage"}
                </Button>
            </div>

            {error && <p className="text-sm text-red-700">{error.message}</p>}

            {!error && isLoading && records.length === 0 && (
                <p className="text-sm text-stone-500">Loading usage…</p>
            )}

            {!error && !isLoading && records.length === 0 && (
                <p className="text-sm text-stone-500">
                    No usage recorded for this key yet.
                </p>
            )}

            {records.length > 0 && (
                <div className="overflow-x-auto">
                    <table className="w-full min-w-[34rem] border-collapse text-left text-xs">
                        <thead className="text-stone-500">
                            <tr className="border-b border-stone-200">
                                <th className="py-2 pr-4 font-medium">Time</th>
                                <th className="py-2 pr-4 font-medium">Model</th>
                                <th className="py-2 pr-4 font-medium">Type</th>
                                <th className="py-2 pr-4 font-medium">
                                    Source
                                </th>
                                <th className="py-2 pr-0 text-right font-medium">
                                    Cost
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            {records.map((record, index) => (
                                <tr
                                    key={`${record.timestamp}-${index}`}
                                    className="border-b border-stone-200/70 last:border-0"
                                >
                                    <td className="py-2 pr-4 whitespace-nowrap">
                                        {formatTimestamp(record.timestamp)}
                                    </td>
                                    <td className="max-w-40 py-2 pr-4 truncate font-mono">
                                        {record.model || "unknown"}
                                    </td>
                                    <td className="py-2 pr-4">
                                        {record.type || "-"}
                                    </td>
                                    <td className="py-2 pr-4">
                                        {record.meter_source || "-"}
                                    </td>
                                    <td className="py-2 pr-0 text-right font-mono tabular-nums">
                                        {formatCost(record.cost_usd)}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {count > records.length && (
                <p className="text-xs text-stone-500">
                    Showing {records.length} of {count} matching records.
                </p>
            )}
        </section>
    );
}

function Wallet({ enabled }: { enabled: Record<ToggleKey, boolean> }) {
    const { isLoggedIn } = useAuthState();
    const showKeySection =
        enabled.keyPrefix ||
        enabled.keyBudget ||
        enabled.keyExpiry ||
        enabled.keyModels ||
        enabled.permissions ||
        enabled.keyUsage;

    if (!isLoggedIn) {
        return (
            <LoginButton theme="amber">Log in with Pollinations</LoginButton>
        );
    }

    return (
        <Surface variant="panel" theme="amber" className="flex flex-col gap-4">
            <UserSection enabled={enabled} />

            {showKeySection && (
                <section className="flex flex-col gap-4 border-t border-amber-950/10 pt-4">
                    <SectionHeading title="Key" />
                    <KeyMetaSection enabled={enabled} />
                    <BudgetSection enabled={enabled} />
                    <GrantedAccessSection enabled={enabled} />
                    {enabled.keyUsage && <UsageSnapshot />}
                </section>
            )}
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
    const userInner = headerInner;
    const keyMeta = [
        enabled.keyPrefix ? "    <KeyPrefix />" : "",
        enabled.keyExpiry ? "    <KeyExpiry />" : "",
    ]
        .filter(Boolean)
        .join("\n");
    const budget = [enabled.keyBudget ? "        <KeyBudget />" : ""]
        .filter(Boolean)
        .join("\n");
    const access = [
        enabled.permissions
            ? `        {permissions.map((permission) => (
          <Chip theme="blue" size="sm" key={permission}>
            {permission}
          </Chip>
        ))}`
            : "",
        enabled.keyModels ? "        <KeyModels />" : "",
    ]
        .filter(Boolean)
        .join("\n");
    const usage = enabled.keyUsage
        ? `      const { usage } = useKeyUsage({ days: 7, limit: 5 });`
        : "";
    const keyMetaBlock = keyMeta ? `${keyMeta}\n` : "";
    const budgetBlock = budget
        ? `    <section>
      <h3>Budget</h3>
${budget}
    </section>\n`
        : "";
    const accessBlock = access
        ? `    <section>
      <h3>Granted access</h3>
${access}
    </section>\n`
        : "";
    const usageBlock = usage ? `    <section>\n${usage}\n    </section>\n` : "";
    const keyBlock =
        keyMetaBlock || budgetBlock || accessBlock || usageBlock
            ? `  <section>
    <h2>Key</h2>
${keyMetaBlock}${budgetBlock}${accessBlock}${usageBlock}  </section>
`
            : "";

    return `<PolliProvider appKey="${APP_KEY}">
  <Surface variant="panel" theme="amber" className="flex flex-col gap-4">
  <section>
${userInner}
    <LinkButton theme="amber" href="https://enter.pollinations.ai">Dashboard</LinkButton>
    <LogoutButton intent="danger">Log out</LogoutButton>
  </section>
${keyBlock}
  </Surface>
</PolliProvider>`;
}

export default function App() {
    const [enabled, setEnabled] = useState<Record<ToggleKey, boolean>>({
        avatar: true,
        name: true,
        email: false,
        keyPrefix: true,
        keyBudget: true,
        keyExpiry: true,
        keyModels: true,
        permissions: true,
        keyUsage: true,
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
                        <div className="flex flex-wrap gap-x-6 gap-y-2">
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
                        </div>
                    </section>

                    <section className="flex flex-col gap-3">
                        <h2 className="text-xs font-semibold uppercase tracking-wider text-stone-500">
                            Code
                        </h2>
                        <pre className="overflow-auto rounded-lg bg-stone-950 p-4 font-mono text-xs leading-relaxed text-stone-100">
                            <code>{buildCode(enabled)}</code>
                        </pre>
                    </section>
                </PolliProvider>
            </main>
        </div>
    );
}
