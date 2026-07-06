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
import { useEffect, useMemo, useState } from "react";
import { FilterBar, FilterSelect, MonthFilter } from "./components/Filters";
import { HeaderButton } from "./components/HeaderButton";
import { OperationsGuide } from "./components/OperationsGuide";
import { type ProvenanceCode, SourceMark } from "./components/Provenance";
import { STALE_AFTER_HOURS } from "./config";
import { hoursSince } from "./lib/format";
import { insightVendorOptions } from "./lib/insights";
import { collectMonths } from "./lib/months";
import { fixturesMode, loadAll, TbError } from "./lib/tb";
import {
    findVendorVocabularyIssues,
    VENDOR_OPTIONS,
    vendorVocabularyRunIssues,
} from "./lib/vendor-vocabulary";
import type { Data } from "./types";
import { BurnTab } from "./views/BurnTab";
import { MeterTab } from "./views/MeterTab";
import { PnlTab } from "./views/PnlTab";
import { RevenueTab } from "./views/RevenueTab";
import { TransactionsTab } from "./views/TransactionsTab";
import { VendorsTab } from "./views/VendorsTab";

type Tab = "transactions" | "burn" | "meter" | "revenue";
type Section = "insights" | "raw";
type InsightTab = "pnl" | "vendors" | "models";

const INSIGHT_TABS: {
    id: InsightTab;
    label: string;
    note: string;
}[] = [
    {
        id: "pnl",
        label: "P&L",
        note: "Monthly blend: Stripe net revenue minus cash spend per category, with credit burn as a shadow. Derived client-side from transactions, meter, and revenue pipes.",
    },
    {
        id: "vendors",
        label: "Vendors",
        note: "Three-way per vendor and month: what the bank paid, what the vendor metered, what our own metering registered - with the delta that exposes wrong registry unit costs.",
    },
];

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
        id: "transactions",
        label: "Transactions",
        codes: ["EN"],
        pipe: "transactions_api",
        note: "Enty monthly export: charged amount, paid amount, currencies, and match state.",
        rows: (data) => data.transactions.length,
    },
    {
        id: "burn",
        label: "Pollen Usage",
        codes: ["TB"],
        pipe: "usage_monthly_api",
        note: "Our own metering: Tinybird generation events → one model/month row, paid vs quest Pollen.",
        rows: (data) => data.usageMonthly.length,
    },
    {
        id: "meter",
        label: "Compute Usage",
        codes: ["API", "CLI", "BQ", "HC"],
        pipe: "meter_monthly_api",
        note: "Monthly vendor usage from vendor APIs, CLIs, BigQuery exports, and manual entries.",
        rows: (data) => data.meterMonthly.length,
    },
    {
        id: "revenue",
        label: "Revenue",
        codes: ["ST"],
        pipe: "revenue_monthly_api",
        note: "Raw monthly revenue rows. Net revenue is intentionally not precomputed in the pipe.",
        rows: (data) => data.revenueMonthly.length,
    },
];

function vendorOptionsForTab(data: Data | null, tab: Tab) {
    if (!data) return VENDOR_OPTIONS;

    const vendors = new Set<string>();
    const add = (value: string) => {
        const vendor = value.trim();
        if (vendor) vendors.add(vendor);
    };

    if (tab === "transactions") {
        for (const row of data.transactions) add(row.vendor);
    } else if (tab === "burn") {
        for (const row of data.usageMonthly) add(row.vendor);
    } else if (tab === "meter") {
        for (const row of data.meterMonthly) add(row.vendor);
    }

    return ["all", ...[...vendors].sort((a, b) => a.localeCompare(b))];
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
    const [tab, setTab] = useState<Tab>("transactions");
    const [section, setSection] = useState<Section>("insights");
    const [insightTab, setInsightTab] = useState<InsightTab>("pnl");
    // Default to All so the transactions page opens with the full Enty export.
    const [month, setMonth] = useState("");
    // Keep the selection while it exists in the current tab's vendor set.
    const [vendor, setVendor] = useState("all");
    const [attempt, setAttempt] = useState(0);
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

    const staleHours = useMemo(() => {
        const latest = data?.runs[0]?.run_at;
        return latest ? hoursSince(latest) : null;
    }, [data]);

    const months = useMemo(() => (data ? collectMonths(data) : []), [data]);
    const activeMonth = month;
    const vendorOptions = useMemo(
        () => vendorOptionsForTab(data, tab),
        [data, tab],
    );
    const insightVendors = useMemo(
        () => (data ? insightVendorOptions(data) : ["all"]),
        [data],
    );
    const showVendorFilter =
        section === "insights"
            ? insightTab !== "pnl"
            : tab !== "revenue" && vendorOptions.length > 1;
    const activeVendorOptions =
        section === "insights" ? insightVendors : vendorOptions;
    const showCategoryFilter = section === "raw" && tab === "transactions";
    const vendorIssues = useMemo(
        () =>
            data
                ? [
                      ...vendorVocabularyRunIssues(data.runs),
                      ...findVendorVocabularyIssues(data),
                  ]
                : [],
        [data],
    );
    const categoryOptions = useMemo(() => {
        const categories = new Set<string>();
        for (const row of data?.transactions ?? []) {
            if (row.category) categories.add(row.category);
        }
        return ["all", ...[...categories].sort((a, b) => a.localeCompare(b))];
    }, [data]);
    const [category, setCategory] = useState("all");

    useEffect(() => {
        if (vendor !== "all" && !activeVendorOptions.includes(vendor)) {
            setVendor("all");
        }
    }, [vendor, activeVendorOptions]);

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
        <div
            data-theme="amber"
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
                            {fixtures && <Chip intent="alpha">fixtures</Chip>}
                            {staleHours !== null &&
                                staleHours <= STALE_AFTER_HOURS && (
                                    <Chip size="sm">
                                        data {Math.round(staleHours)}h old
                                    </Chip>
                                )}
                            {!fixtures && (
                                <HeaderButton
                                    tone="danger"
                                    onClick={() => {
                                        logout().finally(() => {
                                            setAuthenticated(false);
                                            setData(null);
                                        });
                                    }}
                                >
                                    Log out
                                </HeaderButton>
                            )}
                            <ColorModeToggle />
                        </div>
                    </header>

                    {staleHours !== null && staleHours > STALE_AFTER_HOURS && (
                        <Alert intent="warning" title="Stale data">
                            Last forager run was {Math.round(staleHours)}h ago.
                            Run <code>python3 -m ingest.run</code> for fresh
                            numbers.
                        </Alert>
                    )}

                    {vendorIssues.length > 0 && (
                        <Alert
                            intent="warning"
                            title="Vendor vocabulary mismatch"
                        >
                            <div className="flex flex-col gap-1">
                                {vendorIssues.slice(0, 5).map((issue) => (
                                    <span
                                        key={`${issue.source}:${issue.vendor}:${issue.detail}`}
                                    >
                                        {issue.detail}
                                    </span>
                                ))}
                                {vendorIssues.length > 5 && (
                                    <span>+{vendorIssues.length - 5} more</span>
                                )}
                            </div>
                        </Alert>
                    )}

                    <nav className="flex flex-wrap gap-2">
                        <TabButton
                            active={section === "insights"}
                            onClick={() => setSection("insights")}
                        >
                            Insights
                        </TabButton>
                        <TabButton
                            active={section === "raw"}
                            onClick={() => setSection("raw")}
                        >
                            Raw
                        </TabButton>
                    </nav>

                    <nav className="flex flex-wrap gap-2">
                        {section === "raw" &&
                            TABS.map((item) => (
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
                        {section === "insights" &&
                            INSIGHT_TABS.map((item) => (
                                <Tooltip
                                    key={item.id}
                                    triggerAs="span"
                                    content={
                                        <span className="flex max-w-72 flex-col gap-1">
                                            <span className="font-mono text-theme-text-soft">
                                                derived · client-side
                                            </span>
                                            <span>{item.note}</span>
                                        </span>
                                    }
                                >
                                    <TabButton
                                        active={insightTab === item.id}
                                        onClick={() => setInsightTab(item.id)}
                                    >
                                        {item.label}
                                    </TabButton>
                                </Tooltip>
                            ))}
                    </nav>

                    <FilterBar>
                        <MonthFilter
                            months={months}
                            value={activeMonth}
                            onChange={setMonth}
                        />
                        {(showVendorFilter || showCategoryFilter) && (
                            <div className="flex flex-wrap gap-3">
                                {showVendorFilter && (
                                    <FilterSelect
                                        label="vendor"
                                        value={vendor}
                                        onChange={setVendor}
                                        options={activeVendorOptions}
                                    />
                                )}
                                {showCategoryFilter && (
                                    <FilterSelect
                                        label="category"
                                        value={category}
                                        onChange={setCategory}
                                        options={categoryOptions}
                                    />
                                )}
                            </div>
                        )}
                    </FilterBar>

                    {error && (
                        <Alert intent="warning" title="Load failed">
                            <div className="flex flex-wrap items-center gap-2">
                                <span>{error}</span>
                                <HeaderButton
                                    onClick={() => setAttempt((n) => n + 1)}
                                >
                                    Retry
                                </HeaderButton>
                            </div>
                        </Alert>
                    )}
                    {!error && !data && (
                        <Text tone="soft">Loading pipes...</Text>
                    )}
                    {data && section === "raw" && tab === "transactions" && (
                        <TransactionsTab
                            category={category}
                            data={data}
                            month={activeMonth}
                            vendor={vendor}
                        />
                    )}
                    {data && section === "raw" && tab === "burn" && (
                        <BurnTab
                            data={data}
                            month={activeMonth}
                            vendor={vendor}
                        />
                    )}
                    {data && section === "raw" && tab === "meter" && (
                        <MeterTab
                            data={data}
                            month={activeMonth}
                            vendor={vendor}
                        />
                    )}
                    {data && section === "raw" && tab === "revenue" && (
                        <RevenueTab data={data} />
                    )}
                    {data && section === "insights" && insightTab === "pnl" && (
                        <PnlTab data={data} month={activeMonth} />
                    )}
                    {data &&
                        section === "insights" &&
                        insightTab === "vendors" && (
                            <VendorsTab
                                data={data}
                                month={activeMonth}
                                vendor={vendor}
                            />
                        )}
                </main>
            </ScrollArea>
        </div>
    );
}
