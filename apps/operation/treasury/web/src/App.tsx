import {
    Alert,
    Button,
    Chip,
    ColorModeToggle,
    DatabaseIcon,
    Heading,
    Input,
    MenuIcon,
    NavItem,
    ScrollArea,
    Text,
    TrendUpIcon,
    useScrollLock,
    XIcon,
} from "@pollinations/ui";
import {
    type ComponentType,
    type ReactNode,
    type RefObject,
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
} from "react";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { FilterBar, FilterSelect, MonthFilter } from "./components/Filters";
import type { ProvenanceCode } from "./components/Provenance";
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
import { ModelsTab } from "./views/ModelsTab";
import { PnlTab } from "./views/PnlTab";
import { PollenTab } from "./views/PollenTab";
import { ProviderTab } from "./views/ProviderTab";
import { RevenueTab } from "./views/RevenueTab";
import { TransactionsTab } from "./views/TransactionsTab";
import { VendorsTab } from "./views/VendorsTab";

type Tab = "transactions" | "pollen" | "provider" | "revenue";
type Section = "insights" | "raw";
type InsightTab = "pnl" | "vendors" | "models";

type DrawerItem<Id extends string> = {
    id: Id;
    label: string;
    note: string;
    icon: ComponentType<{ className?: string }>;
};

const INSIGHT_TABS: {
    id: InsightTab;
    label: string;
    note: string;
    icon: ComponentType<{ className?: string }>;
}[] = [
    {
        id: "pnl",
        label: "P&L",
        note: "Monthly blend: Stripe net revenue minus cash spend per category, with credit burn as a shadow. Derived client-side from the transactions, provider, and revenue pipes.",
        icon: TrendUpIcon,
    },
    {
        id: "vendors",
        label: "Vendors",
        note: "One spend, three witnesses per vendor and month: transactions (bank cash), provider (their meter), pollen (our metering) - with the delta that exposes wrong registry unit costs.",
        icon: DatabaseIcon,
    },
    {
        id: "models",
        label: "Models",
        note: "Per-model unit economics: retained pollen (gross minus byop/model shares) vs true cost allocated from vendor actuals, with the break-even floor and ecosystem adoption totals.",
        icon: DatabaseIcon,
    },
] satisfies readonly DrawerItem<InsightTab>[];

// note + pipe surface as a hover tooltip on the tab button — the tab body
// itself stays table-only.
const TABS: {
    id: Tab;
    label: string;
    codes: ProvenanceCode[];
    pipe: string;
    note: string;
    icon: ComponentType<{ className?: string }>;
    rows: (data: Data) => number;
}[] = [
    {
        id: "transactions",
        label: "Transactions",
        codes: ["EN"],
        pipe: "transactions_api",
        note: "Enty monthly export: charged amount, paid amount, currencies, and match state.",
        icon: DatabaseIcon,
        rows: (data) => data.transactions.length,
    },
    {
        id: "pollen",
        label: "Pollen",
        codes: ["TB"],
        pipe: "pollen_monthly_api",
        note: "Our own metering: Tinybird generation events → one model/month row, paid vs quest Pollen.",
        icon: DatabaseIcon,
        rows: (data) => data.pollenMonthly.length,
    },
    {
        id: "provider",
        label: "Provider",
        codes: ["API", "CLI", "BQ", "HC"],
        pipe: "provider_monthly_api + grants_api",
        note: "Provider-reported monthly usage from vendor APIs, CLIs, BigQuery exports, and manual entries. Grants on top: credit start points per vendor.",
        icon: DatabaseIcon,
        rows: (data) => data.providerMonthly.length + data.grants.length,
    },
    {
        id: "revenue",
        label: "Revenue",
        codes: ["ST"],
        pipe: "revenue_monthly_api",
        note: "Raw monthly revenue rows. Net revenue is intentionally not precomputed in the pipe.",
        icon: DatabaseIcon,
        rows: (data) => data.revenueMonthly.length,
    },
];

function codesLabel(codes: readonly ProvenanceCode[]) {
    return codes.length ? `${codes.join(", ")} · ` : "";
}

function MobileMenuButton({
    buttonRef,
    onOpen,
}: {
    buttonRef: RefObject<HTMLButtonElement | null>;
    onOpen: () => void;
}) {
    return (
        <button
            ref={buttonRef}
            type="button"
            className="fixed left-3 top-3 z-30 flex h-9 w-9 items-center justify-center rounded-full bg-surface-opaque text-theme-text-strong shadow-md ring-1 ring-theme-text-strong/10 hover:bg-surface-opaque md:hidden"
            onClick={onOpen}
            aria-label="Open navigation"
        >
            <MenuIcon className="h-5 w-5" />
        </button>
    );
}

function DrawerGroup({
    label,
    children,
}: {
    label: string;
    children: ReactNode;
}) {
    return (
        <div className="flex flex-col gap-1">
            <Text
                size="micro"
                tone="soft"
                weight="bold"
                className="px-3 uppercase tracking-wide"
            >
                {label}
            </Text>
            <div className="flex flex-col gap-1">{children}</div>
        </div>
    );
}

function TreasuryNav({
    data,
    insightTab,
    section,
    tab,
    onInsightTabChange,
    onRawTabChange,
}: {
    data: Data | null;
    insightTab: InsightTab;
    section: Section;
    tab: Tab;
    onInsightTabChange: (value: InsightTab) => void;
    onRawTabChange: (value: Tab) => void;
}) {
    return (
        <nav className="flex flex-col gap-5 pr-2" aria-label="Treasury views">
            <DrawerGroup label="Insights">
                {INSIGHT_TABS.map((item) => (
                    <NavItem
                        key={item.id}
                        type="button"
                        data-theme="accent"
                        icon={item.icon}
                        active={
                            section === "insights" && insightTab === item.id
                        }
                        title={item.note}
                        onClick={() => onInsightTabChange(item.id)}
                    >
                        {item.label}
                    </NavItem>
                ))}
            </DrawerGroup>
            <DrawerGroup label="Raw">
                {TABS.map((item) => (
                    <NavItem
                        key={item.id}
                        type="button"
                        data-theme="accent"
                        icon={item.icon}
                        active={section === "raw" && tab === item.id}
                        title={`${codesLabel(item.codes)}${item.pipe}${data ? ` · ${item.rows(data)} rows` : ""}\n${item.note}`}
                        onClick={() => onRawTabChange(item.id)}
                    >
                        <span className="min-w-0 flex-1 truncate">
                            {item.label}
                        </span>
                        {data ? (
                            <Chip
                                data-theme="neutral"
                                intent="neutral"
                                size="sm"
                                className="ml-auto bg-transparent text-theme-text-soft"
                            >
                                {item.rows(data)}
                            </Chip>
                        ) : null}
                    </NavItem>
                ))}
            </DrawerGroup>
        </nav>
    );
}

function TreasuryDrawer({
    data,
    footer,
    insightTab,
    section,
    tab,
    onInsightTabChange,
    onRawTabChange,
}: {
    data: Data | null;
    footer: ReactNode;
    insightTab: InsightTab;
    section: Section;
    tab: Tab;
    onInsightTabChange: (value: InsightTab) => void;
    onRawTabChange: (value: Tab) => void;
}) {
    return (
        <aside
            data-theme="neutral"
            className="flex min-h-0 flex-1 flex-col px-2 py-4 md:fixed md:inset-y-0 md:left-0 md:z-30 md:w-60 md:border-r md:border-theme-text-strong/10"
            aria-label="Treasury navigation"
        >
            <div className="hidden shrink-0 flex-col gap-1 border-b border-theme-text-strong/10 pb-4 pl-1 md:flex">
                <Text
                    size="micro"
                    tone="soft"
                    weight="bold"
                    className="uppercase tracking-wide"
                >
                    Operations
                </Text>
                <Heading as="p" size="section">
                    Treasury
                </Heading>
            </div>
            <ScrollArea className="-mr-2 min-h-0 flex-1 pt-3">
                <TreasuryNav
                    data={data}
                    section={section}
                    tab={tab}
                    insightTab={insightTab}
                    onRawTabChange={onRawTabChange}
                    onInsightTabChange={onInsightTabChange}
                />
            </ScrollArea>
            <div className="flex shrink-0 flex-col gap-2 border-t border-theme-text-strong/10 px-1 pt-4">
                {footer}
            </div>
        </aside>
    );
}

function TreasuryShell({
    children,
    data,
    footer,
    insightTab,
    section,
    tab,
    onInsightTabChange,
    onRawTabChange,
}: {
    children: ReactNode;
    data: Data | null;
    footer: ReactNode;
    insightTab: InsightTab;
    section: Section;
    tab: Tab;
    onInsightTabChange: (value: InsightTab) => void;
    onRawTabChange: (value: Tab) => void;
}) {
    const [isDrawerOpen, setIsDrawerOpen] = useState(false);
    const drawerRef = useRef<HTMLDivElement>(null);
    const menuButtonRef = useRef<HTMLButtonElement>(null);

    useScrollLock(isDrawerOpen);

    const closeDrawer = useCallback(() => {
        const activeElement = document.activeElement;
        if (
            activeElement instanceof HTMLElement &&
            drawerRef.current?.contains(activeElement)
        ) {
            menuButtonRef.current?.focus({ preventScroll: true });
        }
        setIsDrawerOpen(false);
    }, []);

    useEffect(() => {
        if (!isDrawerOpen) return;

        function handleKeyDown(event: KeyboardEvent) {
            if (event.key === "Escape") closeDrawer();
        }

        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [closeDrawer, isDrawerOpen]);

    const handleInsightTabChange = (value: InsightTab) => {
        onInsightTabChange(value);
        closeDrawer();
    };
    const handleRawTabChange = (value: Tab) => {
        onRawTabChange(value);
        closeDrawer();
    };

    const drawer = (
        <TreasuryDrawer
            data={data}
            footer={footer}
            section={section}
            tab={tab}
            insightTab={insightTab}
            onRawTabChange={handleRawTabChange}
            onInsightTabChange={handleInsightTabChange}
        />
    );

    return (
        <div
            data-theme="amber"
            className="flex h-dvh min-h-0 overflow-hidden bg-app-bg text-theme-text-strong"
        >
            <div className="hidden md:block">{drawer}</div>
            <div
                ref={drawerRef}
                className={`fixed inset-0 z-40 transition-[visibility] md:hidden ${
                    isDrawerOpen
                        ? "pointer-events-auto visible delay-0"
                        : "pointer-events-none invisible delay-[420ms]"
                }`}
                aria-hidden={!isDrawerOpen}
                inert={!isDrawerOpen}
            >
                <button
                    type="button"
                    className={`absolute inset-0 bg-black/40 transition-opacity duration-[420ms] ease-out ${
                        isDrawerOpen ? "opacity-100" : "opacity-0"
                    }`}
                    onClick={closeDrawer}
                    aria-label="Close navigation"
                />
                <div
                    className={`absolute inset-y-0 left-0 flex w-[min(20rem,86vw)] transform-gpu flex-col overflow-hidden border-r border-theme-text-strong/10 bg-app-bg shadow-xl transition-transform duration-[420ms] ease-[cubic-bezier(0.22,1,0.36,1)] will-change-transform ${
                        isDrawerOpen ? "translate-x-0" : "-translate-x-full"
                    }`}
                >
                    <div className="flex shrink-0 items-center justify-between gap-2 border-b border-theme-text-strong/10 px-4 py-3">
                        <div>
                            <Text
                                size="micro"
                                tone="soft"
                                weight="bold"
                                className="uppercase tracking-wide"
                            >
                                Operations
                            </Text>
                            <Heading as="p" size="section">
                                Treasury
                            </Heading>
                        </div>
                        <button
                            type="button"
                            className="flex h-9 w-9 items-center justify-center rounded-full bg-surface-opaque/70 text-theme-text-strong hover:bg-surface-opaque"
                            onClick={closeDrawer}
                            aria-label="Close navigation"
                        >
                            <XIcon className="h-5 w-5" />
                        </button>
                    </div>
                    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                        {drawer}
                    </div>
                </div>
            </div>
            <div className="flex min-w-0 flex-1 flex-col md:ml-60">
                <MobileMenuButton
                    buttonRef={menuButtonRef}
                    onOpen={() => setIsDrawerOpen(true)}
                />
                <ScrollArea axis="y" className="min-h-0 flex-1">
                    {children}
                </ScrollArea>
            </div>
        </div>
    );
}

function vendorOptionsForTab(data: Data | null, tab: Tab) {
    if (!data) return VENDOR_OPTIONS;

    const vendors = new Set<string>();
    const add = (value: string) => {
        const vendor = value.trim();
        if (vendor) vendors.add(vendor);
    };

    if (tab === "transactions") {
        for (const row of data.transactions) add(row.vendor);
    } else if (tab === "pollen") {
        for (const row of data.pollenMonthly) add(row.vendor);
    } else if (tab === "provider") {
        for (const row of data.providerMonthly) add(row.vendor);
        for (const row of data.grants) add(row.vendor);
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
            ? insightTab !== "pnl" && insightVendors.length > 1
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

    const drawerFooter = (
        <>
            <div className="flex flex-wrap items-center gap-2">
                {fixtures && <Chip intent="alpha">fixtures</Chip>}
                {staleHours !== null && staleHours <= STALE_AFTER_HOURS && (
                    <Chip
                        data-theme="neutral"
                        intent="neutral"
                        size="sm"
                        className="w-fit"
                    >
                        data {Math.round(staleHours)}h old
                    </Chip>
                )}
            </div>
            <div className="flex items-center justify-between gap-2">
                {!fixtures ? (
                    <Button
                        intent="danger"
                        size="sm"
                        onClick={() => {
                            logout().finally(() => {
                                setAuthenticated(false);
                                setData(null);
                            });
                        }}
                    >
                        Log out
                    </Button>
                ) : (
                    <span />
                )}
                <ColorModeToggle />
            </div>
        </>
    );

    return (
        <TreasuryShell
            data={data}
            footer={drawerFooter}
            section={section}
            tab={tab}
            insightTab={insightTab}
            onRawTabChange={(value) => {
                setSection("raw");
                setTab(value);
            }}
            onInsightTabChange={(value) => {
                setSection("insights");
                setInsightTab(value);
            }}
        >
            <main className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-14 pb-32 sm:px-6 sm:py-10 sm:pb-32 md:py-8">
                {staleHours !== null && staleHours > STALE_AFTER_HOURS && (
                    <Alert intent="warning" title="Stale data">
                        Last forager run was {Math.round(staleHours)}h ago. Run{" "}
                        <code>python3 -m ingest.run</code> for fresh numbers.
                    </Alert>
                )}

                {vendorIssues.length > 0 && (
                    <Alert intent="warning" title="Vendor vocabulary mismatch">
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
                            <Button
                                size="sm"
                                onClick={() => setAttempt((n) => n + 1)}
                            >
                                Retry
                            </Button>
                        </div>
                    </Alert>
                )}
                {!error && !data && <Text tone="soft">Loading pipes...</Text>}
                <ErrorBoundary
                    resetKey={`${section}:${tab}:${insightTab}:${month}:${vendor}:${category}`}
                >
                    {data && section === "raw" && tab === "transactions" && (
                        <TransactionsTab
                            category={category}
                            data={data}
                            month={activeMonth}
                            vendor={vendor}
                        />
                    )}
                    {data && section === "raw" && tab === "pollen" && (
                        <PollenTab
                            data={data}
                            month={activeMonth}
                            vendor={vendor}
                        />
                    )}
                    {data && section === "raw" && tab === "provider" && (
                        <ProviderTab
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
                    {data &&
                        section === "insights" &&
                        insightTab === "models" && (
                            <ModelsTab
                                data={data}
                                month={activeMonth}
                                vendor={vendor}
                            />
                        )}
                </ErrorBoundary>
            </main>
        </TreasuryShell>
    );
}
