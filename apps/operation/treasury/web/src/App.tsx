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
import {
    FilterBar,
    FilterMultiSelect,
    MonthFilter,
} from "./components/Filters";
import type { ProvenanceCode } from "./components/Provenance";
import { insightVendorOptions, vendorPlanes } from "./lib/insights";
import { collectMonths, type MonthFilterValue } from "./lib/months";
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
type RefreshableRawTab = "op-transactions" | "op-pollen";
type RefreshState = {
    target: RefreshableRawTab | null;
    message: string | null;
    error: string | null;
};

function isCompactInsightView(
    section: TreasurySection,
    insightTab: InsightTab,
) {
    return (
        section === "raw" ||
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
        label: "Credit",
        note: "Credit burn rate and runway per vendor: credit pooled vs witnessed credit burn, current burn rate, and the earlier of exhaustion or expiry - naive math, every caveat is a flag.",
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
        note: "Per-provider unit economics: the Models table rolled up one grain - retained pollen vs provider cash, with credit shown separately.",
        icon: GlobeIcon,
    },
    {
        id: "models",
        label: "Models",
        note: "Per-model economics: retained pollen (gross minus byop/model shares) vs provider cash, with credit shown separately.",
        icon: GenApiIcon,
    },
    {
        id: "gpu",
        label: "GPUs",
        note: "GPU unit economics from OP Cloud GPU burn and OP Pollen demand: rent, paid and quest, margin, efficiency, and break-even.",
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
        note: "New cloud ledger combining provider usage, GPU resources, infrastructure, and credit as signed cloud facts.",
        icon: DatabaseIcon,
        rows: (data) => data.opCloud?.length ?? 0,
    },
];

function codesLabel(codes: readonly ProvenanceCode[]) {
    return codes.length ? `${codes.join(", ")} · ` : "";
}

function isRefreshableRawTab(id: Tab): id is RefreshableRawTab {
    return id === "op-transactions" || id === "op-pollen";
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
    refresh,
    section,
    tab,
    onInsightTabChange,
    onRawTabChange,
    onRefresh,
}: {
    data: Data | null;
    insightTab: InsightTab;
    refresh: RefreshState;
    section: TreasurySection;
    tab: Tab;
    onInsightTabChange: (value: InsightTab) => void;
    onRawTabChange: (value: Tab) => void;
    onRefresh: (value: RefreshableRawTab) => void;
}) {
    const rawItem = (item: (typeof TABS)[number]) => {
        const count = data ? item.rows(data) : null;
        const title = `${codesLabel(item.codes)}${item.pipe}${data ? ` · ${count} rows` : ""}\n${item.note}`;

        if (isRefreshableRawTab(item.id)) {
            const refreshId = item.id;
            const refreshing = refresh.target === item.id;
            return (
                <div key={item.id} className="flex items-center gap-1">
                    <NavItem
                        type="button"
                        data-theme="accent"
                        icon={item.icon}
                        active={section === "raw" && tab === item.id}
                        title={title}
                        onClick={() => onRawTabChange(item.id)}
                        className="min-w-0 flex-1"
                    >
                        <span className="min-w-0 flex-1 truncate">
                            {item.label}
                        </span>
                    </NavItem>
                    {count == null ? null : (
                        <Button
                            type="button"
                            size="sm"
                            data-theme="neutral"
                            disabled={refreshing}
                            title={`Update ${item.label} for the active month`}
                            aria-label={`Update ${item.label}`}
                            onClick={() => onRefresh(refreshId)}
                            className="h-7 min-w-10 shrink-0 px-2 text-xs text-theme-text-soft"
                        >
                            {refreshing ? "..." : count}
                        </Button>
                    )}
                </div>
            );
        }

        return (
            <NavItem
                key={item.id}
                type="button"
                data-theme="accent"
                icon={item.icon}
                active={section === "raw" && tab === item.id}
                title={title}
                onClick={() => onRawTabChange(item.id)}
            >
                <span className="min-w-0 flex-1 truncate">{item.label}</span>
                {count == null ? null : (
                    <Chip
                        data-theme="neutral"
                        intent="neutral"
                        size="sm"
                        className="ml-auto bg-transparent text-theme-text-soft"
                    >
                        {count}
                    </Chip>
                )}
            </NavItem>
        );
    };

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
            <DrawerGroup label="Raw">{TABS.map(rawItem)}</DrawerGroup>
        </nav>
    );
}

function TreasuryDrawer({
    data,
    footer,
    insightTab,
    refresh,
    section,
    tab,
    onInsightTabChange,
    onRawTabChange,
    onRefresh,
}: {
    data: Data | null;
    footer: ReactNode;
    insightTab: InsightTab;
    refresh: RefreshState;
    section: TreasurySection;
    tab: Tab;
    onInsightTabChange: (value: InsightTab) => void;
    onRawTabChange: (value: Tab) => void;
    onRefresh: (value: RefreshableRawTab) => void;
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
                    refresh={refresh}
                    onRawTabChange={onRawTabChange}
                    onInsightTabChange={onInsightTabChange}
                    onRefresh={onRefresh}
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
    refresh,
    section,
    tab,
    onInsightTabChange,
    onRawTabChange,
    onRefresh,
}: {
    children: ReactNode;
    data: Data | null;
    footer: ReactNode;
    insightTab: InsightTab;
    refresh: RefreshState;
    section: TreasurySection;
    tab: Tab;
    onInsightTabChange: (value: InsightTab) => void;
    onRawTabChange: (value: Tab) => void;
    onRefresh: (value: RefreshableRawTab) => void;
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
            refresh={refresh}
            onRawTabChange={handleRawTabChange}
            onInsightTabChange={handleInsightTabChange}
            onRefresh={onRefresh}
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
                <ScrollArea axis="y" className="min-h-0 flex-1">
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
                    Compare retained paid pollen against provider cash.
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
                    Provider calibration gives usage; credit is shown separately
                    from provider cash.
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
                <strong>Credit</strong>
                <InfoLine>Current credit runway, not a period view.</InfoLine>
                <InfoLine>
                    Remaining is credited amount minus witnessed credit burn.
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
                    OP Pollen adds requests, paid, and quest by vendor and
                    model.
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

function currentMonth() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function refreshMonth(month: string) {
    return /^\d{4}-\d{2}$/.test(month) ? month : currentMonth();
}

function activeMonthFilter(selected: readonly string[]): MonthFilterValue {
    if (selected.length === 0) return "";
    return selected.length === 1 ? selected[0] : selected;
}

async function refreshRawTable(target: RefreshableRawTab, month: string) {
    const res = await fetch(`/api/refresh/${target}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ month }),
    });
    const body = (await res.json().catch(() => ({}))) as {
        message?: string;
        error?: string;
    };
    if (!res.ok) {
        throw new Error(body.error ?? "Refresh failed");
    }
    return body.message ?? "Updated";
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
    const [selectedMonths, setSelectedMonths] = useState<string[]>([]);
    const [selectedVendors, setSelectedVendors] = useState<string[]>([]);
    const [attempt, setAttempt] = useState(0);
    const [refresh, setRefresh] = useState<RefreshState>({
        target: null,
        message: null,
        error: null,
    });
    const monthFilterInitialized = useRef(false);
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

    const months = useMemo(() => (data ? collectMonths(data) : []), [data]);
    const monthFilter = useMemo(
        () => activeMonthFilter(selectedMonths),
        [selectedMonths],
    );
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
    const selectableVendorOptions = useMemo(
        () => activeVendorOptions.filter((option) => option !== "all"),
        [activeVendorOptions],
    );
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
        return [...categories].sort((a, b) => a.localeCompare(b));
    }, [data]);
    const typeOptions = useMemo(() => {
        const types = new Set<string>();
        for (const row of data?.opCloud ?? []) {
            if (row.type) types.add(row.type);
        }
        return [...types].sort((a, b) => a.localeCompare(b));
    }, [data]);
    const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
    const [selectedTypes, setSelectedTypes] = useState<string[]>([]);
    const handleRawRefresh = useCallback(
        (target: RefreshableRawTab) => {
            if (fixtures || refresh.target) return;
            const monthToRefresh = refreshMonth(
                selectedMonths.length === 1 ? selectedMonths[0] : "",
            );
            setRefresh({
                target,
                message: null,
                error: null,
            });
            refreshRawTable(target, monthToRefresh)
                .then((message) => {
                    setRefresh({ target: null, message, error: null });
                    setAttempt((current) => current + 1);
                })
                .catch((caught: unknown) => {
                    setRefresh({
                        target: null,
                        message: null,
                        error:
                            caught instanceof Error
                                ? caught.message
                                : String(caught),
                    });
                });
        },
        [fixtures, refresh.target, selectedMonths],
    );

    useEffect(() => {
        if (!monthFilterInitialized.current && months.length > 0) {
            monthFilterInitialized.current = true;
            setSelectedMonths([months[months.length - 1]]);
            return;
        }
        setSelectedMonths((current) =>
            current.filter((month) => months.includes(month)),
        );
    }, [months]);
    useEffect(() => {
        setSelectedVendors((current) =>
            current.filter((vendor) =>
                selectableVendorOptions.includes(vendor),
            ),
        );
    }, [selectableVendorOptions]);
    useEffect(() => {
        setSelectedCategories((current) =>
            current.filter((category) => categoryOptions.includes(category)),
        );
    }, [categoryOptions]);
    useEffect(() => {
        setSelectedTypes((current) =>
            current.filter((type) => typeOptions.includes(type)),
        );
    }, [typeOptions]);

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
                {refresh.message && (
                    <Chip intent="neutral" title={refresh.message}>
                        updated
                    </Chip>
                )}
                {refresh.error && (
                    <Chip intent="warning" title={refresh.error}>
                        update failed
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
    const isCompactInsight = isCompactInsightView(section, insightTab);
    const filters = hasFilters ? (
        <FilterBar>
            {showPeriodFilter && (
                <MonthFilter
                    months={months}
                    value={selectedMonths}
                    onChange={setSelectedMonths}
                />
            )}
            <div className="flex flex-wrap items-center gap-3">
                {showVendorFilter && (
                    <FilterMultiSelect
                        label="vendor"
                        value={selectedVendors}
                        onChange={setSelectedVendors}
                        options={selectableVendorOptions}
                        placeholder="All vendors"
                    />
                )}
                {showCategoryFilter && (
                    <FilterMultiSelect
                        label="category"
                        value={selectedCategories}
                        onChange={setSelectedCategories}
                        options={categoryOptions}
                        placeholder="All categories"
                    />
                )}
                {showTypeFilter && (
                    <FilterMultiSelect
                        label="type"
                        value={selectedTypes}
                        onChange={setSelectedTypes}
                        options={typeOptions}
                        placeholder="All types"
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
                resetKey={`${section}:${tab}:${insightTab}:${selectedMonths.join(",")}:${selectedVendors.join(",")}:${selectedCategories.join(",")}:${selectedTypes.join(",")}`}
            >
                {data && section === "raw" && tab === "data-quality" && (
                    <DataQualityTab
                        data={data}
                        month={monthFilter}
                        vendor={selectedVendors}
                    />
                )}
                {data && section === "raw" && tab === "op-transactions" && (
                    <OpTransactionsTab
                        category={selectedCategories}
                        data={data}
                        month={monthFilter}
                        vendor={selectedVendors}
                    />
                )}
                {data && section === "raw" && tab === "op-pollen" && (
                    <OpPollenTab
                        data={data}
                        month={monthFilter}
                        vendor={selectedVendors}
                    />
                )}
                {data && section === "raw" && tab === "op-cloud" && (
                    <OpCloudTab
                        data={data}
                        month={monthFilter}
                        type={selectedTypes}
                        vendor={selectedVendors}
                    />
                )}
                {data && section === "insights" && insightTab === "pnl" && (
                    <PnlTab data={data} month={monthFilter} />
                )}
                {data && section === "insights" && insightTab === "vendors" && (
                    <VendorsTab
                        data={data}
                        month={monthFilter}
                        vendor={selectedVendors}
                    />
                )}
                {data && section === "insights" && insightTab === "models" && (
                    <ModelsTab
                        data={data}
                        month={monthFilter}
                        vendor={selectedVendors}
                    />
                )}
                {data && section === "insights" && insightTab === "credits" && (
                    <CreditsTab data={data} />
                )}
                {data && section === "insights" && insightTab === "gpu" && (
                    <GpuTab
                        data={data}
                        month={monthFilter}
                        vendor={selectedVendors}
                    />
                )}
            </ErrorBoundary>
        </>
    );

    return (
        <TreasuryShell
            data={data}
            footer={drawerFooter}
            refresh={refresh}
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
            onRefresh={handleRawRefresh}
        >
            <main className="flex w-full flex-col gap-6 px-4 py-14 pb-32 sm:px-6 sm:py-10 sm:pb-32 md:py-8 lg:px-8">
                {isCompactInsight ? (
                    <section className="flex flex-col gap-5">
                        <header className="shrink-0 px-1">
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
                        <div className="flex flex-col gap-5">{content}</div>
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
