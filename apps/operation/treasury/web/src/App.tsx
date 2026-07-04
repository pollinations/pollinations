import {
    Alert,
    Button,
    Chip,
    ColorModeToggle,
    Heading,
    Input,
    ScrollArea,
    TabButton,
    Text,
    Tooltip,
} from "@pollinations/ui";
import { useEffect, useMemo, useRef, useState } from "react";
import { FilterBar, FilterSelect, MonthFilter } from "./components/Filters";
import { OperationsGuide } from "./components/OperationsGuide";
import { type ProvenanceCode, SourceMark } from "./components/Provenance";
import { SaveControls } from "./components/SaveControls";
import { STALE_AFTER_HOURS } from "./config";
import { hoursSince } from "./lib/format";
import { collectMonths, defaultMonth } from "./lib/months";
import { queuedKeysForChange } from "./lib/queued";
import { StagingProvider } from "./lib/staging";
import { fixturesMode, loadAll, TbError } from "./lib/tb";
import type { Data } from "./types";
import { BurnTab } from "./views/BurnTab";
import { INVOICE_CATEGORIES, InvoicesTab } from "./views/InvoicesTab";
import { MeterTab } from "./views/MeterTab";
import { PaymentsTab } from "./views/PaymentsTab";
import { RevenueTab } from "./views/RevenueTab";

type Tab = "invoices" | "payments" | "burn" | "meter" | "revenue";

// note + pipe surface as a hover tooltip on the tab button — the tab body
// itself stays table-only.
const TABS: {
    id: Tab;
    label: string;
    codes: ProvenanceCode[];
    pipe: string;
    note: string;
    rows: (data: Data) => number;
}[] = [
    {
        id: "invoices",
        label: "Invoices",
        codes: ["IV", "HC"],
        pipe: "invoices_ep",
        note: "Raw latest row per invoice SHA. Edit recategorizes the invoice; provider stays read-only from Forager.",
        rows: (data) => data.invoices.length,
    },
    {
        id: "payments",
        label: "Payments",
        codes: ["WS", "HC"],
        pipe: "payments_ep",
        note: "Raw Wise transactions. Edit sets a counterparty→provider rule that forager applies to the whole history.",
        rows: (data) => data.paymentsTx.length,
    },
    {
        id: "burn",
        label: "Pollen Usage",
        codes: ["TB"],
        pipe: "usage_ep",
        note: "Our own metering: Tinybird generation events → one model/month row, paid vs quest Pollen.",
        rows: (data) => data.usageMonthly.length,
    },
    {
        id: "meter",
        label: "Provider Usage",
        codes: ["API", "CLI", "BQ", "HC"],
        pipe: "meter_monthly_ep",
        note: "Monthly provider usage. Credit usage and prepaid usage are shown as separate values; manual rows fill gaps where dashboards/APIs do not.",
        rows: (data) => data.meterMonthly.length,
    },
    {
        id: "revenue",
        label: "Revenue",
        codes: ["ST"],
        pipe: "revenue_ep",
        note: "Raw monthly revenue rows. Net revenue is intentionally not precomputed in the pipe.",
        rows: (data) => data.revenueMonthly.length,
    },
];

const INGEST_COMMAND = "python3 -m ingest.run";
const INGEST_QUEUED_DATASOURCES = new Set(["overrides"]);
const POST_SAVE_REFRESH_MS = 800;

function addProvider(slugs: Set<string>, provider: string) {
    const slug = provider.trim();
    if (slug) slugs.add(slug);
}

async function checkSession() {
    const res = await fetch("/api/auth/session");
    if (!res.ok) return false;
    const body = (await res.json()) as { authenticated?: boolean };
    return body.authenticated === true;
}

async function login(password: string) {
    const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
    });
    if (!res.ok) {
        throw new Error(res.status === 401 ? "Wrong password" : "Login failed");
    }
}

async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
}

function PasswordGate({
    error,
    onSubmit,
}: {
    error: string | null;
    onSubmit: (password: string) => void;
}) {
    const [value, setValue] = useState("");

    return (
        <div className="mx-auto mt-24 flex max-w-md flex-col gap-4 px-4">
            <Heading as="h1">Treasury</Heading>
            <Text tone="soft">
                Enter the treasury password. Tinybird tokens stay on the server.
            </Text>
            {error && <Alert intent="warning">{error}</Alert>}
            <form
                className="flex gap-2"
                onSubmit={(event) => {
                    event.preventDefault();
                    if (value) onSubmit(value);
                }}
            >
                <Input
                    type="password"
                    autoFocus
                    placeholder="Password"
                    value={value}
                    onChange={(event) => setValue(event.target.value)}
                    className="flex-1"
                />
                <Button type="submit" className="self-start">
                    Connect
                </Button>
            </form>
        </div>
    );
}

export default function App() {
    const fixtures = fixturesMode();
    const [authenticated, setAuthenticated] = useState(fixtures);
    const [sessionChecked, setSessionChecked] = useState(fixtures);
    const [authError, setAuthError] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [data, setData] = useState<Data | null>(null);
    const [tab, setTab] = useState<Tab>("invoices");
    // null until the operator picks a period; the effective default is the
    // last complete month once data arrives.
    const [month, setMonth] = useState<string | null>(null);
    // App-global like the period: pick a provider once, drill through the
    // provider tabs.
    const [provider, setProvider] = useState("all");
    const [category, setCategory] = useState("all");
    const [attempt, setAttempt] = useState(0);
    const [committedNonce, setCommittedNonce] = useState(0);
    const [committedAwaitingIngest, setCommittedAwaitingIngest] = useState(0);
    const [showCommittedBanner, setShowCommittedBanner] = useState(false);
    const [queuedKeys, setQueuedKeys] = useState<ReadonlySet<string>>(
        () => new Set(),
    );
    const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const ready = fixtures || (sessionChecked && authenticated);

    useEffect(() => {
        if (fixtures) return;

        let cancelled = false;
        checkSession()
            .then((ok) => {
                if (!cancelled) {
                    setAuthenticated(ok);
                    setSessionChecked(true);
                }
            })
            .catch(() => {
                if (!cancelled) {
                    setAuthenticated(false);
                    setSessionChecked(true);
                }
            });

        return () => {
            cancelled = true;
        };
    }, [fixtures]);

    useEffect(() => {
        if (!ready) return;

        const retryKey = attempt;
        let cancelled = false;
        setError(null);
        loadAll()
            .then((loaded) => {
                if (!cancelled && retryKey === attempt) setData(loaded);
            })
            .catch((caught: unknown) => {
                if (cancelled || retryKey !== attempt) return;

                if (
                    caught instanceof TbError &&
                    (caught.status === 401 || caught.status === 403)
                ) {
                    setAuthenticated(false);
                    setSessionChecked(true);
                    setAuthError(
                        `Session rejected (${caught.message}) - enter the password again.`,
                    );
                } else {
                    setError(
                        caught instanceof Error
                            ? caught.message
                            : String(caught),
                    );
                }
            });

        return () => {
            cancelled = true;
        };
    }, [ready, attempt]);

    useEffect(
        () => () => {
            if (refreshTimerRef.current) {
                clearTimeout(refreshTimerRef.current);
            }
        },
        [],
    );

    const staleHours = useMemo(() => {
        const latest = data?.runs[0]?.run_at;
        return latest ? hoursSince(latest) : null;
    }, [data]);

    const months = useMemo(() => (data ? collectMonths(data) : []), [data]);
    const activeMonth = month ?? defaultMonth(months);
    const providerOptions = useMemo(() => {
        const slugs = new Set<string>();
        for (const row of data?.invoices ?? [])
            addProvider(slugs, row.provider);
        for (const row of data?.paymentsTx ?? [])
            addProvider(slugs, row.provider);
        for (const row of data?.meterMonthly ?? [])
            addProvider(slugs, row.provider);
        for (const row of data?.usageMonthly ?? [])
            addProvider(slugs, row.provider);
        return ["all", ...[...slugs].sort((a, b) => a.localeCompare(b))];
    }, [data]);
    const categoryOptions = useMemo(() => {
        const categories = new Set(INVOICE_CATEGORIES);
        for (const row of data?.invoices ?? []) {
            if (row.category) categories.add(row.category);
        }
        for (const row of data?.paymentsTx ?? []) {
            if (row.category) categories.add(row.category);
        }
        return ["all", ...[...categories].sort((a, b) => a.localeCompare(b))];
    }, [data]);

    if (!sessionChecked) {
        return (
            <div className="flex h-dvh min-h-0 flex-col overflow-hidden bg-app-bg text-theme-text-strong">
                <ScrollArea axis="y" className="min-h-0 flex-1">
                    <div className="mx-auto mt-24 max-w-md px-4">
                        <Text tone="soft">Checking session...</Text>
                    </div>
                </ScrollArea>
            </div>
        );
    }

    if (!ready) {
        return (
            <div className="flex h-dvh min-h-0 flex-col overflow-hidden bg-app-bg text-theme-text-strong">
                <ScrollArea axis="y" className="min-h-0 flex-1">
                    <PasswordGate
                        error={authError}
                        onSubmit={(password) => {
                            login(password)
                                .then(() => {
                                    setAuthError(null);
                                    setAuthenticated(true);
                                    setSessionChecked(true);
                                    setAttempt((current) => current + 1);
                                })
                                .catch((caught: unknown) => {
                                    setAuthError(
                                        caught instanceof Error
                                            ? caught.message
                                            : String(caught),
                                    );
                                });
                        }}
                    />
                </ScrollArea>
            </div>
        );
    }

    return (
        <StagingProvider
            fixtures={fixtures}
            onCommitted={(changes) => {
                setCommittedNonce((current) => current + 1);
                const ingestChanges = changes.filter((change) =>
                    INGEST_QUEUED_DATASOURCES.has(change.datasource),
                );
                if (ingestChanges.length > 0) {
                    setCommittedAwaitingIngest(
                        (current) => current + ingestChanges.length,
                    );
                    setShowCommittedBanner(true);
                }
                setQueuedKeys((current) => {
                    const next = new Set(current);
                    for (const change of ingestChanges) {
                        for (const key of queuedKeysForChange(change)) {
                            next.add(key);
                        }
                    }
                    return next;
                });
                if (refreshTimerRef.current) {
                    clearTimeout(refreshTimerRef.current);
                }
                refreshTimerRef.current = setTimeout(() => {
                    setAttempt((current) => current + 1);
                    refreshTimerRef.current = null;
                }, POST_SAVE_REFRESH_MS);
            }}
        >
            <div
                data-theme="amber"
                data-committed-awaiting-ingest={committedAwaitingIngest}
                className="flex h-dvh min-h-0 flex-col overflow-hidden bg-app-bg text-theme-text-strong"
            >
                <ScrollArea axis="y" className="min-h-0 flex-1">
                    <main className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-8 pb-32 sm:px-6 sm:py-10 sm:pb-32">
                        <header className="flex flex-col gap-4 border-b border-theme-border/70 pb-5 sm:flex-row sm:items-start sm:justify-between">
                            <div className="min-w-0">
                                <Text
                                    size="micro"
                                    tone="soft"
                                    weight="bold"
                                    className="mb-2 uppercase tracking-wide"
                                >
                                    Operations
                                </Text>
                                <Heading as="h1" size="title">
                                    Treasury
                                </Heading>
                            </div>
                            <div className="flex shrink-0 flex-wrap items-center gap-2">
                                <OperationsGuide />
                                {fixtures && (
                                    <Chip intent="alpha">fixtures</Chip>
                                )}
                                {staleHours !== null &&
                                    staleHours <= STALE_AFTER_HOURS && (
                                        <Chip size="sm">
                                            data {Math.round(staleHours)}h old
                                        </Chip>
                                    )}
                                <SaveControls />
                                {!fixtures && (
                                    <Button
                                        size="sm"
                                        intent="danger"
                                        className="h-7"
                                        onClick={() => {
                                            logout().finally(() => {
                                                setAuthenticated(false);
                                                setData(null);
                                            });
                                        }}
                                    >
                                        Log out
                                    </Button>
                                )}
                                <ColorModeToggle />
                            </div>
                        </header>

                        {staleHours !== null &&
                            staleHours > STALE_AFTER_HOURS && (
                                <Alert intent="warning" title="Stale data">
                                    Last forager run was{" "}
                                    {Math.round(staleHours)}h ago. Run{" "}
                                    <code>python3 -m ingest.run</code> for fresh
                                    numbers.
                                </Alert>
                            )}

                        {showCommittedBanner && committedAwaitingIngest > 0 && (
                            <Alert
                                intent="warning"
                                title="Committed, waiting for ingest"
                            >
                                <div className="flex flex-wrap items-center gap-2">
                                    <span>
                                        {committedAwaitingIngest} changes
                                        committed. Flagged rows update after the
                                        next ingest run (
                                        <code>{INGEST_COMMAND}</code>).
                                    </span>
                                    <Button
                                        size="sm"
                                        onClick={() =>
                                            void navigator.clipboard?.writeText(
                                                INGEST_COMMAND,
                                            )
                                        }
                                    >
                                        Copy command
                                    </Button>
                                    <Button
                                        size="sm"
                                        onClick={() =>
                                            setShowCommittedBanner(false)
                                        }
                                    >
                                        Dismiss
                                    </Button>
                                </div>
                            </Alert>
                        )}

                        <FilterBar>
                            <MonthFilter
                                months={months}
                                value={activeMonth}
                                onChange={setMonth}
                            />
                            <div className="flex flex-wrap gap-3">
                                <FilterSelect
                                    label="provider"
                                    value={provider}
                                    onChange={setProvider}
                                    options={providerOptions}
                                />
                                <FilterSelect
                                    label="category"
                                    value={category}
                                    onChange={setCategory}
                                    options={categoryOptions}
                                />
                            </div>
                        </FilterBar>

                        <nav className="flex flex-wrap gap-2">
                            {TABS.map((item) => (
                                <Tooltip
                                    key={item.id}
                                    triggerAs="span"
                                    content={
                                        <span className="flex max-w-72 flex-col gap-1">
                                            {item.codes.length > 0 && (
                                                <span className="flex items-center gap-1.5">
                                                    {item.codes.map((code) => (
                                                        <SourceMark
                                                            key={code}
                                                            code={code}
                                                        />
                                                    ))}
                                                </span>
                                            )}
                                            <span className="font-mono text-theme-text-soft">
                                                {item.pipe}
                                                {data
                                                    ? ` · ${item.rows(data)} rows`
                                                    : ""}
                                            </span>
                                            <span>{item.note}</span>
                                        </span>
                                    }
                                >
                                    <TabButton
                                        active={tab === item.id}
                                        onClick={() => setTab(item.id)}
                                    >
                                        {item.label}
                                    </TabButton>
                                </Tooltip>
                            ))}
                        </nav>

                        {error && (
                            <Alert intent="warning" title="Load failed">
                                <div className="flex flex-wrap items-center gap-2">
                                    <span>{error}</span>
                                    <Button
                                        size="sm"
                                        onClick={() => setAttempt((n) => n + 1)}
                                    >
                                        Retry
                                    </Button>
                                </div>
                            </Alert>
                        )}
                        {!error && !data && (
                            <Text tone="soft">Loading pipes...</Text>
                        )}
                        {data && tab === "invoices" && (
                            <InvoicesTab
                                category={category}
                                data={data}
                                month={activeMonth}
                                provider={provider}
                                queuedKeys={queuedKeys}
                            />
                        )}
                        {data && tab === "payments" && (
                            <PaymentsTab
                                category={category}
                                data={data}
                                month={activeMonth}
                                provider={provider}
                                queuedKeys={queuedKeys}
                            />
                        )}
                        {data && tab === "burn" && (
                            <BurnTab
                                data={data}
                                month={activeMonth}
                                provider={provider}
                            />
                        )}
                        {data && tab === "meter" && (
                            <MeterTab
                                committedNonce={committedNonce}
                                data={data}
                                month={activeMonth}
                                months={months}
                                provider={provider}
                                providers={providerOptions}
                                queuedKeys={queuedKeys}
                            />
                        )}
                        {data && tab === "revenue" && (
                            <RevenueTab data={data} />
                        )}
                    </main>
                </ScrollArea>
            </div>
        </StagingProvider>
    );
}
