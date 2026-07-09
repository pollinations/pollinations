import {
    Alert,
    Button,
    Chip,
    ClockIcon,
    ColorModeToggle,
    cn,
    DatabaseIcon,
    EyeIcon,
    GenApiIcon,
    GlobeIcon,
    Heading,
    InfoTip,
    Input,
    MenuIcon,
    NavItem,
    RocketIcon,
    ScrollArea,
    Section,
    Text,
    TrendUpIcon,
    useScrollLock,
    XIcon,
} from "@pollinations/ui";
import logoUrl from "@pollinations/ui/assets/logo.svg";
import {
    type ComponentType,
    type CSSProperties,
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
import { insightVendorOptions, vendorPlanes } from "./lib/insights";
import { collectMonths } from "./lib/months";
import { fixturesMode, loadAll, TbError } from "./lib/tb";
import type { Data } from "./types";
import { CreditsTab } from "./views/CreditsTab";
import { DataQualityTab } from "./views/DataQualityTab";
import { GpuTab } from "./views/GpuTab";
import { ModelsTab } from "./views/ModelsTab";
import { OpCloudTab } from "./views/OpCloudTab";
import { OpPollenTab } from "./views/OpPollenTab";
import { OpTransactionsTab } from "./views/OpTransactionsTab";
import { PnlTab } from "./views/PnlTab";
import { VendorsTab } from "./views/VendorsTab";

type Tab = "data-quality" | "op-transactions" | "op-pollen" | "op-cloud";
type TreasurySection = "insights" | "raw";
type InsightTab = "pnl" | "vendors" | "models" | "credits" | "gpu";

function isOpRawTabId(section: TreasurySection, tab: Tab) {
    return (
        section === "raw" &&
        (tab === "op-transactions" || tab === "op-pollen" || tab === "op-cloud")
    );
}

function isOpTableViewId(section: TreasurySection, tab: Tab) {
    return isOpRawTabId(section, tab);
}

function isCompactInsightView(
    section: TreasurySection,
    insightTab: InsightTab,
    tab: Tab,
) {
    return (
        (section === "raw" && tab === "data-quality") ||
        (section === "insights" &&
            (insightTab === "pnl" ||
                insightTab === "credits" ||
                insightTab === "vendors" ||
                insightTab === "models" ||
                insightTab === "gpu"))
    );
}

const logoMask: CSSProperties = {
    WebkitMask: `url(${logoUrl}) center / contain no-repeat`,
    mask: `url(${logoUrl}) center / contain no-repeat`,
};

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
        note: "Strict cash P&L from the signed Wise ledger: revenue inflows minus non-revenue outflows by category.",
        icon: TrendUpIcon,
    },
    {
        id: "credits",
        label: "Credits",
        note: "Credit burn rate and runway per vendor: grants pooled vs witnessed credit burn, current burn rate, and the earlier of exhaustion or expiry - naive math, every caveat is a flag.",
        icon: ClockIcon,
    },
] satisfies readonly DrawerItem<InsightTab>[];

const UNIT_ECONOMICS_TABS: {
    id: InsightTab;
    label: string;
    note: string;
    icon: ComponentType<{ className?: string }>;
}[] = [
    {
        id: "vendors",
        label: "Providers",
        note: "Per-provider unit economics: the Models table rolled up one grain - retained pollen vs true cost from provider actuals, with credit share and break-even.",
        icon: GlobeIcon,
    },
    {
        id: "models",
        label: "Models",
        note: "Per-model economics: retained pollen (gross minus byop/model shares) vs true cost allocated from provider actuals.",
        icon: GenApiIcon,
    },
    {
        id: "gpu",
        label: "GPUs",
        note: "GPU unit economics from OP Cloud GPU burn and OP Pollen demand: rent, paid and quest Pollen, coverage, efficiency, and break-even.",
        icon: RocketIcon,
    },
] satisfies readonly DrawerItem<InsightTab>[];

const ALL_INSIGHT_TABS = [
    ...INSIGHT_TABS,
    ...UNIT_ECONOMICS_TABS,
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
        id: "data-quality",
        label: "Data Quality",
        codes: ["WISE", "API", "CLI", "BQ", "HC", "TB"],
        pipe: "op_transactions_api + op_cloud_api + op_pollen_api",
        note: "OP row quality by vendor and month: OP Transactions, OP Cloud burn, and OP Pollen metering - missing witnesses and calibration drift sort first.",
        icon: EyeIcon,
        rows: (data) => vendorPlanes(data).length,
    },
    {
        id: "op-transactions",
        label: "Transactions",
        codes: ["WISE"],
        pipe: "op_transactions_api",
        note: "New signed Wise cash ledger: money in is positive, money out is negative. Construction comments mark unmatched vendors.",
        icon: DatabaseIcon,
        rows: (data) => data.opTransactions?.length ?? 0,
    },
    {
        id: "op-pollen",
        label: "Pollen",
        codes: ["TB"],
        pipe: "op_pollen_api",
        note: "New Pollen usage table with paid/quest money splits and paid/quest request counts.",
        icon: DatabaseIcon,
        rows: (data) => data.opPollen?.length ?? 0,
    },
    {
        id: "op-cloud",
        label: "Cloud",
        codes: ["API", "CLI", "BQ", "HC"],
        pipe: "op_cloud_api",
        note: "New cloud ledger combining provider usage, GPU resources, infrastructure, and grants as signed cloud facts.",
        icon: DatabaseIcon,
        rows: (data) => data.opCloud?.length ?? 0,
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
    section: TreasurySection;
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
            <DrawerGroup label="Unit Economics">
                {UNIT_ECONOMICS_TABS.map((item) => (
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
    section: TreasurySection;
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
            <div className="hidden shrink-0 border-b border-theme-text-strong/10 px-1 pb-4 text-theme-text-strong md:block">
                <TreezoryBrand size="desktop" />
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
    section: TreasurySection;
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
                    <div className="flex shrink-0 items-center justify-between gap-3 border-b border-theme-text-strong/10 px-4 py-3 text-theme-text-strong">
                        <TreezoryBrand size="drawer" />
                        <button
                            type="button"
                            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-opaque/70 text-theme-text-strong hover:bg-surface-opaque"
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
                <ScrollArea
                    axis="y"
                    className={cn(
                        "min-h-0 flex-1",
                        isOpTableViewId(section, tab) && "overflow-hidden",
                    )}
                >
                    {children}
                </ScrollArea>
            </div>
        </div>
    );
}

function TreezoryBrand({ size }: { size: "desktop" | "drawer" }) {
    return (
        <div
            className={cn(
                "flex min-w-0 items-center",
                size === "desktop" ? "gap-3" : "gap-2.5",
            )}
        >
            <span className="sr-only">Treezory</span>
            <span
                aria-hidden="true"
                className={cn(
                    "block shrink-0 bg-current",
                    size === "desktop" ? "h-8 w-8" : "h-7 w-7",
                )}
                style={logoMask}
            />
            <span
                aria-hidden="true"
                className={cn(
                    "min-w-0 truncate font-subheading font-medium leading-none",
                    size === "desktop" ? "text-2xl" : "text-xl",
                )}
            >
                Treezory
            </span>
        </div>
    );
}

function activeViewTitle(
    section: TreasurySection,
    tab: Tab,
    insightTab: InsightTab,
) {
    if (section === "insights") {
        if (insightTab === "vendors") return "Providers";
        if (insightTab === "models") return "Models";
        return (
            ALL_INSIGHT_TABS.find((item) => item.id === insightTab)?.label ?? ""
        );
    }
    return TABS.find((item) => item.id === tab)?.label ?? "";
}

function InfoLine({ children }: { children: ReactNode }) {
    return <span className="block">• {children}</span>;
}

function viewInfoContent(
    section: TreasurySection,
    tab: Tab,
    insightTab: InsightTab,
) {
    if (section === "raw") {
        if (tab === "data-quality") {
            return (
                <span className="block max-w-72">
                    <strong>Data Quality</strong>
                    <InfoLine>One row per vendor-month.</InfoLine>
                    <InfoLine>
                        Compares OP Transactions payment witnesses, OP Cloud
                        burn, and OP Pollen metering directly.
                    </InfoLine>
                    <InfoLine>
                        Missing witnesses and calibration drift sort first.
                    </InfoLine>
                </span>
            );
        }
        const active = TABS.find((item) => item.id === tab);
        if (!active) return null;
        return (
            <span className="block max-w-72">
                <strong>{active.label}</strong>
                <InfoLine>{active.note}</InfoLine>
                <InfoLine>
                    Source: <strong>{active.pipe}</strong>
                </InfoLine>
            </span>
        );
    }

    if (insightTab === "vendors") {
        return (
            <span className="block max-w-72">
                <strong>Providers</strong>
                <InfoLine>Models rolled up by provider.</InfoLine>
                <InfoLine>
                    Compare retained paid pollen against true provider cost.
                </InfoLine>
                <InfoLine>
                    Open <strong>Models</strong> to inspect each model per
                    provider.
                </InfoLine>
            </span>
        );
    }
    if (insightTab === "models") {
        return (
            <span className="block max-w-72">
                <strong>Models</strong>
                <InfoLine>One row per model per provider.</InfoLine>
                <InfoLine>
                    True cost uses provider calibration, then compares against
                    retained paid pollen.
                </InfoLine>
                <InfoLine>
                    Quest burn is shown separately from paid margin.
                </InfoLine>
            </span>
        );
    }
    if (insightTab === "credits") {
        return (
            <span className="block max-w-72">
                <strong>Credits</strong>
                <InfoLine>Current grant runway, not a period view.</InfoLine>
                <InfoLine>
                    Remaining is granted minus witnessed credit burn.
                </InfoLine>
                <InfoLine>
                    Depletion is the earlier of burn-out or expiry.
                </InfoLine>
            </span>
        );
    }
    if (insightTab === "pnl") {
        return (
            <span className="block max-w-72">
                <strong>P&amp;L</strong>
                <InfoLine>
                    OP Transaction revenue minus non-revenue cash spend.
                </InfoLine>
                <InfoLine>
                    Revenue is category=revenue; spend is the operational
                    category set.
                </InfoLine>
            </span>
        );
    }
    if (insightTab === "gpu") {
        return (
            <span className="block max-w-72">
                <strong>GPU Economics</strong>
                <InfoLine>
                    One row per GPU, provider, and model from OP Cloud GPU burn.
                </InfoLine>
                <InfoLine>
                    OP Pollen adds requests, paid Pollen, and quest Pollen by
                    vendor and model.
                </InfoLine>
                <InfoLine>
                    Flags mark missing model, unknown GPU, or no matching
                    Pollen.
                </InfoLine>
            </span>
        );
    }
    return null;
}

function vendorOptionsForTab(data: Data | null, tab: Tab) {
    if (!data) return ["all"];

    const vendors = new Set<string>();
    const add = (value: string) => {
        const vendor = value.trim();
        if (vendor) vendors.add(vendor);
    };

    if (tab === "data-quality") {
        return insightVendorOptions(data);
    }
    if (tab === "op-transactions") {
        for (const row of data.opTransactions ?? []) add(row.vendor);
    } else if (tab === "op-pollen") {
        for (const row of data.opPollen ?? []) add(row.vendor);
    } else if (tab === "op-cloud") {
        for (const row of data.opCloud ?? []) add(row.vendor);
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
    const [tab, setTab] = useState<Tab>("op-transactions");
    const [section, setSection] = useState<TreasurySection>("insights");
    const [insightTab, setInsightTab] = useState<InsightTab>("pnl");
    // Open on the full current audit year by default.
    const [month, setMonth] = useState("2026");
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
            ? insightTab !== "pnl" &&
              insightTab !== "credits" &&
              insightVendors.length > 1
            : vendorOptions.length > 1;
    const activeVendorOptions =
        section === "insights" ? insightVendors : vendorOptions;
    const showPeriodFilter =
        (section === "insights" && insightTab !== "credits") ||
        section === "raw";
    const showCategoryFilter = section === "raw" && tab === "op-transactions";
    const showTypeFilter = section === "raw" && tab === "op-cloud";
    const hasFilters =
        showPeriodFilter ||
        showVendorFilter ||
        showCategoryFilter ||
        showTypeFilter;
    const categoryOptions = useMemo(() => {
        const categories = new Set<string>();
        for (const row of data?.opTransactions ?? []) {
            if (row.category) categories.add(row.category);
        }
        return ["all", ...[...categories].sort((a, b) => a.localeCompare(b))];
    }, [data]);
    const typeOptions = useMemo(() => {
        const types = new Set<string>();
        for (const row of data?.opCloud ?? []) {
            if (row.type) types.add(row.type);
        }
        return ["all", ...[...types].sort((a, b) => a.localeCompare(b))];
    }, [data]);
    const [category, setCategory] = useState("all");
    const [cloudType, setCloudType] = useState("all");

    useEffect(() => {
        if (vendor !== "all" && !activeVendorOptions.includes(vendor)) {
            setVendor("all");
        }
    }, [vendor, activeVendorOptions]);
    useEffect(() => {
        if (category !== "all" && !categoryOptions.includes(category)) {
            setCategory("all");
        }
    }, [category, categoryOptions]);
    useEffect(() => {
        if (cloudType !== "all" && !typeOptions.includes(cloudType)) {
            setCloudType("all");
        }
    }, [cloudType, typeOptions]);

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
                <span />
                <ColorModeToggle />
            </div>
        </>
    );
    const viewTitle = activeViewTitle(section, tab, insightTab);
    const viewInfo = viewInfoContent(section, tab, insightTab);
    const isOpTableView = isOpTableViewId(section, tab);
    const isCompactInsight = isCompactInsightView(section, insightTab, tab);
    const filters = hasFilters ? (
        <FilterBar>
            {showPeriodFilter && (
                <MonthFilter
                    months={months}
                    value={activeMonth}
                    onChange={setMonth}
                />
            )}
            <div className="flex flex-wrap items-center gap-3">
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
                {showTypeFilter && (
                    <FilterSelect
                        label="type"
                        value={cloudType}
                        onChange={setCloudType}
                        options={typeOptions}
                    />
                )}
            </div>
        </FilterBar>
    ) : null;
    const content = (
        <>
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
                resetKey={`${section}:${tab}:${insightTab}:${month}:${vendor}:${category}:${cloudType}`}
            >
                {data && section === "raw" && tab === "data-quality" && (
                    <DataQualityTab
                        data={data}
                        month={activeMonth}
                        vendor={vendor}
                    />
                )}
                {data && section === "raw" && tab === "op-transactions" && (
                    <OpTransactionsTab
                        category={category}
                        data={data}
                        month={activeMonth}
                        vendor={vendor}
                    />
                )}
                {data && section === "raw" && tab === "op-pollen" && (
                    <OpPollenTab
                        data={data}
                        month={activeMonth}
                        vendor={vendor}
                    />
                )}
                {data && section === "raw" && tab === "op-cloud" && (
                    <OpCloudTab
                        data={data}
                        month={activeMonth}
                        type={cloudType}
                        vendor={vendor}
                    />
                )}
                {data && section === "insights" && insightTab === "pnl" && (
                    <PnlTab data={data} month={activeMonth} />
                )}
                {data && section === "insights" && insightTab === "vendors" && (
                    <VendorsTab
                        data={data}
                        month={activeMonth}
                        vendor={vendor}
                    />
                )}
                {data && section === "insights" && insightTab === "models" && (
                    <ModelsTab
                        data={data}
                        month={activeMonth}
                        vendor={vendor}
                    />
                )}
                {data && section === "insights" && insightTab === "credits" && (
                    <CreditsTab data={data} />
                )}
                {data && section === "insights" && insightTab === "gpu" && (
                    <GpuTab data={data} month={activeMonth} vendor={vendor} />
                )}
            </ErrorBoundary>
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
            <main
                className={cn(
                    "flex w-full flex-col",
                    isOpTableView
                        ? "h-full min-h-0 gap-0 overflow-hidden px-0 py-0 pb-0"
                        : "gap-6 px-4 py-14 pb-32 sm:px-6 sm:py-10 sm:pb-32 md:py-8 lg:px-8",
                )}
            >
                {staleHours !== null && staleHours > STALE_AFTER_HOURS && (
                    <Alert intent="warning" title="Stale data">
                        Last ingest run was {Math.round(staleHours)}h ago. Run{" "}
                        <code>python3 -m ingest.run</code> for fresh numbers.
                    </Alert>
                )}

                {isOpTableView || isCompactInsight ? (
                    <section
                        className={cn(
                            "flex flex-col",
                            isOpTableView
                                ? "min-h-0 flex-1 overflow-hidden"
                                : "gap-5",
                        )}
                    >
                        <header
                            className={cn(
                                "shrink-0",
                                isOpTableView
                                    ? "bg-app-bg/85 px-4 py-4 backdrop-blur-xl sm:px-6 lg:px-8"
                                    : "px-1",
                            )}
                        >
                            <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
                                <div className="min-w-0 flex-1">{filters}</div>
                                <div className="ml-auto flex min-w-0 shrink-0 items-center gap-2">
                                    <Heading
                                        as="h2"
                                        size="section"
                                        className="truncate text-left"
                                    >
                                        {viewTitle}
                                    </Heading>
                                    {viewInfo && (
                                        <InfoTip
                                            content={viewInfo}
                                            label={`${viewTitle} info`}
                                        />
                                    )}
                                </div>
                            </div>
                        </header>
                        <div
                            className={cn(
                                "flex flex-col",
                                isOpTableView ? "min-h-0 flex-1" : "gap-5",
                            )}
                        >
                            {content}
                        </div>
                    </section>
                ) : (
                    <Section
                        title={viewTitle}
                        action={
                            viewInfo ? (
                                <InfoTip
                                    content={viewInfo}
                                    label={`${viewTitle} info`}
                                />
                            ) : null
                        }
                        actionClassName="mr-auto"
                        framed
                        panelClassName="gap-5"
                    >
                        {filters}
                        {content}
                    </Section>
                )}
            </main>
        </TreasuryShell>
    );
}
