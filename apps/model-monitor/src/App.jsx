import {
    Alert,
    AppHeader,
    Button,
    Chip,
    ColorModeToggle,
    cn,
    DiscordIcon,
    ExternalLinkIcon,
    GitHubIcon,
    Heading,
    ScrollArea,
    Surface,
    TabButton,
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeaderCell,
    TableRow,
} from "@pollinations/ui";
import { ModalityChip } from "@pollinations/ui/gen";
import { useRef, useState } from "react";
import { useModelMonitor } from "./hooks/useModelMonitor";

const WINDOW_OPTIONS = [
    { key: "7d", label: "7d" },
    { key: "24h", label: "24h" },
    { key: "4h", label: "4h" },
    { key: "60m", label: "1h" },
    { key: "5m", label: "5m" },
];

const MODEL_TYPES = [
    { key: "image", title: "Image" },
    { key: "video", title: "Video" },
    { key: "audio", title: "Audio" },
    { key: "realtime", title: "Realtime" },
    { key: "text", title: "Text" },
    { key: "embedding", title: "Embedding" },
];

const EXTERNAL_LINKS = [
    {
        href: "https://enter.pollinations.ai",
        label: "Log In",
        icon: <ExternalLinkIcon className="h-4 w-4" />,
        showLabel: true,
    },
    {
        href: "https://discord.gg/pollinations-ai-885844321461485618",
        label: "Discord",
        icon: <DiscordIcon className="h-4 w-4" />,
    },
    {
        href: "https://github.com/pollinations/pollinations",
        label: "GitHub",
        icon: <GitHubIcon className="h-4 w-4" />,
    },
];

function isAdminPath() {
    if (typeof window === "undefined") return false;
    const path = window.location.pathname.replace(/\/+$/, "");
    return path === "/debug" || path.endsWith("/debug");
}

function statusSeverity(model) {
    const health = computeHealthStatus(model.stats);
    if (health === "off") return 6;
    if (health === "degraded") return 5;
    if (model.catalogStatus === "unregistered") return 4;
    if (model.catalogStatus === "anomaly") return 3;
    if (model.catalogStatus === "catalog-unavailable") return 2;
    if (model.catalogStatus === "registry-only") return 1;
    if (model.catalogStatus === "hidden") return 0.5;
    return 0;
}

function formatPercent(count, total, showZero = false) {
    if (!total || total === 0) return "-";
    const pct = (count / total) * 100;
    if (pct === 0) return showZero ? "0%" : "-";
    return `${pct.toFixed(1)}%`;
}

function get2xxColor(ok2xx, total) {
    if (!total || total <= 0) return "text-theme-text-muted";
    if (ok2xx === 0) return "text-intent-danger-text font-semibold";
    const pct = (ok2xx / total) * 100;
    if (pct > 95) return "text-intent-success-text font-semibold";
    if (pct > 80) return "text-intent-success-text";
    if (pct > 50) return "text-theme-text-muted";
    return "text-intent-danger-text font-semibold";
}

function getLatencyColor(latencySec) {
    if (latencySec < 2) return "text-theme-text-soft font-semibold";
    if (latencySec < 5) return "text-intent-success-text";
    if (latencySec < 10) return "text-theme-text-muted";
    return "text-intent-warning-text font-semibold";
}

function computeHealthStatus(stats) {
    if (!stats || !stats.total_requests) return "on";
    const success = stats.status_2xx || 0;
    const total5xx = stats.errors_5xx || 0;
    const modelRequests = success + total5xx;
    if (modelRequests < 3) return "on";
    const pct5xx = (total5xx / modelRequests) * 100;
    if (pct5xx >= 50) return "off";
    if (pct5xx >= 10) return "degraded";
    return "on";
}

function healthIntent(status) {
    if (status === "off") return "danger";
    if (status === "degraded") return "warning";
    return "success";
}

function rowIntent(status) {
    if (status === "off") return "danger";
    if (status === "degraded") return "warning";
    return "default";
}

function calcGroupStats(group) {
    let total2xx = 0;
    let total5xx = 0;
    let countOn = 0;
    let countDegraded = 0;
    let countOff = 0;

    for (const model of group) {
        const stats = model.stats;
        if (!stats) continue;
        total2xx += stats.status_2xx || 0;
        total5xx += stats.errors_5xx || 0;
        const status = computeHealthStatus(stats);
        if (status === "on") countOn++;
        else if (status === "degraded") countDegraded++;
        else countOff++;
    }

    const modelRequests = total2xx + total5xx;
    const successRate =
        modelRequests > 0 ? (total2xx / modelRequests) * 100 : 100;

    return {
        successRate,
        countOn,
        countDegraded,
        countOff,
        totalModels: group.length,
    };
}

// Compact, non-clickable per-category health overview. Filtering lives in the
// separate CategoryTabs selector below it.
function CategoryStats({ models }) {
    if (models.length === 0) return null;

    const groups = MODEL_TYPES.map(({ key, title }) => ({
        key,
        title,
        group: models.filter((model) => model.type === key),
    })).filter(({ group }) => group.length > 0);
    if (groups.length === 0) return null;

    return (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
            {groups.map(({ key, title, group }) => {
                const stats = calcGroupStats(group);
                return (
                    <Surface
                        key={key}
                        variant="card"
                        className="flex min-w-0 flex-col items-center gap-1.5 p-3 text-center"
                    >
                        <div className="flex min-w-0 items-center justify-center gap-1.5">
                            <span className="truncate text-sm font-semibold text-theme-text-strong">
                                {title}
                            </span>
                            <span className="shrink-0 text-xs tabular-nums text-theme-text-muted">
                                {stats.totalModels}
                            </span>
                        </div>
                        <span className="text-xl font-bold leading-none tabular-nums text-theme-text-strong">
                            {stats.successRate.toFixed(1)}%
                        </span>
                        <div className="flex flex-wrap justify-center gap-1">
                            {stats.countOff > 0 && (
                                <Chip intent="danger" size="sm">
                                    {stats.countOff} off
                                </Chip>
                            )}
                            {stats.countDegraded > 0 && (
                                <Chip intent="warning" size="sm">
                                    {stats.countDegraded} degraded
                                </Chip>
                            )}
                            {stats.countOff === 0 &&
                                stats.countDegraded === 0 && (
                                    <Chip intent="success" size="sm">
                                        healthy
                                    </Chip>
                                )}
                        </div>
                    </Surface>
                );
            })}
        </div>
    );
}

// Category filter — the shared soft TabButton, same selector as the Window
// picker. "All" clears the filter; only categories with models are shown.
function CategoryTabs({ models, value, onChange }) {
    const available = MODEL_TYPES.filter(({ key }) =>
        models.some((model) => model.type === key),
    );
    if (available.length === 0) return null;

    return (
        <div className="flex flex-wrap gap-1.5">
            <TabButton
                active={value === null}
                onClick={() => onChange(null)}
                size="sm"
            >
                All
            </TabButton>
            {available.map(({ key, title }) => (
                <TabButton
                    key={key}
                    active={value === key}
                    onClick={() => onChange(key)}
                    size="sm"
                >
                    {title}
                </TabButton>
            ))}
        </div>
    );
}

function StatusBadge({ stats }) {
    const status = computeHealthStatus(stats);
    if (status === "on") return null;

    return (
        <Chip
            intent={healthIntent(status)}
            size="sm"
            className={status === "off" ? "animate-pulse" : undefined}
        >
            {status === "off" ? "Off" : "Degraded"}
        </Chip>
    );
}

function CatalogStatusBadge({ status }) {
    if (!status || status === "visible" || status === "endpoint-fallback") {
        return null;
    }

    const variants = {
        hidden: { label: "hidden", intent: "neutral" },
        anomaly: { label: "anomaly", intent: "warning" },
        unregistered: { label: "unknown", intent: "warning" },
        "catalog-unavailable": { label: "unverified", intent: "neutral" },
        "registry-only": { label: "registry", intent: "neutral" },
    };

    const variant = variants[status];
    if (!variant) return null;

    return (
        <Chip intent={variant.intent} size="sm">
            {variant.label}
        </Chip>
    );
}

function SortableTh({ label, sortKey, currentSort, onSort, align = "left" }) {
    const isActive = currentSort.key === sortKey;

    return (
        <TableHeaderCell
            align={align}
            active={isActive}
            sortDirection={
                isActive ? (currentSort.asc ? "asc" : "desc") : undefined
            }
            onSort={() => onSort(sortKey)}
        >
            {label}
        </TableHeaderCell>
    );
}

function HeaderLink({ href, label, icon, showLabel = false }) {
    return (
        <Button
            as="a"
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            title={label}
            size="sm"
            className={cn(
                "h-9 gap-2 py-0",
                showLabel ? "w-auto px-3" : "w-9 px-0",
            )}
            aria-label={label}
        >
            {icon}
            {showLabel && <span>{label}</span>}
        </Button>
    );
}

function WindowTabs({ value, onChange }) {
    return (
        <div className="flex w-fit max-w-full flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-wide text-theme-text-strong">
            <span>Window</span>
            <span className="inline-flex flex-wrap gap-1">
                {WINDOW_OPTIONS.map(({ key, label }) => (
                    <TabButton
                        key={key}
                        active={value === key}
                        onClick={() => onChange(key)}
                        size="sm"
                    >
                        {label}
                    </TabButton>
                ))}
            </span>
        </div>
    );
}

function App() {
    const [aggregationWindow, setAggregationWindow] = useState("60m");
    const [adminMode] = useState(isAdminPath);
    const { models, lastUpdated, error, tinybirdConfigured, endpointStatus } =
        useModelMonitor(aggregationWindow);

    const [sort, setSort] = useState({ key: "requests", asc: false });
    const [typeFilter, setTypeFilter] = useState(null);
    const scrollAreaRef = useRef(null);
    const failedCatalogEndpoints = Object.entries(endpointStatus)
        .filter(([, ok]) => ok === false)
        .map(([name]) => name);

    const handleSort = (key) => {
        setSort((prev) => ({
            key,
            asc:
                prev.key === key ? !prev.asc : key === "name" || key === "type",
        }));
    };

    const sortedModels = [...models].sort((a, b) => {
        const aHasData = (a.stats?.total_requests || 0) > 0;
        const bHasData = (b.stats?.total_requests || 0) > 0;
        if (aHasData !== bHasData) return aHasData ? -1 : 1;

        const dir = sort.asc ? 1 : -1;
        switch (sort.key) {
            case "type":
                return dir * (a.type || "").localeCompare(b.type || "");
            case "name":
                return dir * (a.name || "").localeCompare(b.name || "");
            case "requests":
            case "share": {
                const aReqs =
                    (a.stats?.total_requests || 0) - (a.stats?.errors_4xx || 0);
                const bReqs =
                    (b.stats?.total_requests || 0) - (b.stats?.errors_4xx || 0);
                if (aReqs === bReqs) {
                    return (
                        dir *
                        ((a.stats?.total_requests || 0) -
                            (b.stats?.total_requests || 0))
                    );
                }
                return dir * (aReqs - bReqs);
            }
            case "ok2xx": {
                const aTotal2 =
                    (a.stats?.total_requests || 0) - (a.stats?.errors_4xx || 0);
                const bTotal2 =
                    (b.stats?.total_requests || 0) - (b.stats?.errors_4xx || 0);
                const aHasModelHealth = aTotal2 > 0;
                const bHasModelHealth = bTotal2 > 0;

                if (aHasModelHealth !== bHasModelHealth) {
                    return aHasModelHealth ? -1 : 1;
                }

                if (!aHasModelHealth && !bHasModelHealth) {
                    return (
                        (b.stats?.total_requests || 0) -
                        (a.stats?.total_requests || 0)
                    );
                }

                const aPct2 =
                    aTotal2 > 0 ? (a.stats?.status_2xx || 0) / aTotal2 : 0;
                const bPct2 =
                    bTotal2 > 0 ? (b.stats?.status_2xx || 0) / bTotal2 : 0;
                if (aPct2 === bPct2) {
                    return bTotal2 - aTotal2;
                }
                return dir * (aPct2 - bPct2);
            }
            case "errors":
                return (
                    dir *
                    ((a.stats?.errors_5xx || 0) - (b.stats?.errors_5xx || 0))
                );
            case "lastError": {
                const aTime =
                    a.stats?.last_error_at &&
                    a.stats.last_error_at !== "1970-01-01 00:00:00"
                        ? new Date(`${a.stats.last_error_at}Z`).getTime()
                        : 0;
                const bTime =
                    b.stats?.last_error_at &&
                    b.stats.last_error_at !== "1970-01-01 00:00:00"
                        ? new Date(`${b.stats.last_error_at}Z`).getTime()
                        : 0;
                return dir * (aTime - bTime);
            }
            case "p50":
                return (
                    dir *
                    ((a.stats?.latency_p50_ms || 0) -
                        (b.stats?.latency_p50_ms || 0))
                );
            case "avg":
                return (
                    dir *
                    ((a.stats?.avg_latency_ms || 0) -
                        (b.stats?.avg_latency_ms || 0))
                );
            case "p95":
                return (
                    dir *
                    ((a.stats?.latency_p95_ms || 0) -
                        (b.stats?.latency_p95_ms || 0))
                );
            case "user4xx": {
                const aTotal = a.stats?.total_requests || 1;
                const bTotal = b.stats?.total_requests || 1;
                const aPct = (a.stats?.errors_4xx || 0) / aTotal;
                const bPct = (b.stats?.errors_4xx || 0) / bTotal;
                return dir * (aPct - bPct);
            }
            case "status":
                return dir * (statusSeverity(a) - statusSeverity(b));
            case "provider":
                return dir * (a.provider || "").localeCompare(b.provider || "");
            default:
                return 0;
        }
    });

    const filteredModels = typeFilter
        ? sortedModels.filter((model) => model.type === typeFilter)
        : sortedModels;

    return (
        <div className="h-dvh bg-app-bg text-theme-text-base">
            <ScrollArea ref={scrollAreaRef} axis="y" className="h-full">
                <AppHeader
                    navLabel="Model Monitor links"
                    autoHide
                    scrollTargetRef={scrollAreaRef}
                    innerClassName={adminMode ? "polli:max-w-6xl" : undefined}
                >
                    {EXTERNAL_LINKS.map((link) => (
                        <HeaderLink key={link.href} {...link} />
                    ))}
                    <ColorModeToggle />
                </AppHeader>
                <main
                    className={cn(
                        "mx-auto flex min-h-full w-full min-w-0 flex-col gap-4 px-4 py-5 sm:px-6 md:py-7",
                        adminMode ? "max-w-6xl" : "max-w-5xl",
                    )}
                >
                    <section className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                        <div className="flex min-w-0 flex-col gap-1">
                            <Heading
                                as="h1"
                                size="title"
                                className="polli-model-monitor-title polli:m-0 polli:text-theme-text-strong"
                            >
                                Model Monitor
                            </Heading>
                            <p className="m-0 max-w-3xl text-base leading-relaxed text-theme-text-base">
                                Real-time health monitoring for Pollinations AI
                                models.
                            </p>
                            {!tinybirdConfigured && (
                                <div className="mt-2">
                                    <Chip intent="warning" size="sm">
                                        Tinybird not configured
                                    </Chip>
                                </div>
                            )}
                        </div>
                        <div className="flex flex-col items-start gap-2 sm:items-end">
                            <WindowTabs
                                value={aggregationWindow}
                                onChange={setAggregationWindow}
                            />
                            <p className="m-0 text-xs leading-normal text-theme-text-soft">
                                Last update:{" "}
                                {lastUpdated?.toLocaleTimeString("en-GB", {
                                    timeZone: "UTC",
                                    hour: "2-digit",
                                    minute: "2-digit",
                                    second: "2-digit",
                                }) || "-"}{" "}
                                UTC
                            </p>
                        </div>
                    </section>

                    {error && (
                        <Alert intent="danger" title="Monitor error">
                            {error}
                        </Alert>
                    )}

                    {failedCatalogEndpoints.length > 0 && (
                        <Alert intent="warning" title="Catalog fallback">
                            Fallback active for{" "}
                            {failedCatalogEndpoints.join(", ")} model
                            {failedCatalogEndpoints.length > 1
                                ? " endpoints"
                                : " endpoint"}
                            ; using bundled registry metadata.
                        </Alert>
                    )}

                    <CategoryStats models={models} />

                    <CategoryTabs
                        models={models}
                        value={typeFilter}
                        onChange={setTypeFilter}
                    />

                    <Surface variant="card" className="overflow-hidden p-0">
                        <ScrollArea axis="x">
                            <Table className="min-w-[960px]">
                                <TableHead>
                                    <tr>
                                        <SortableTh
                                            label="Type"
                                            sortKey="type"
                                            currentSort={sort}
                                            onSort={handleSort}
                                        />
                                        <SortableTh
                                            label="Model"
                                            sortKey="name"
                                            currentSort={sort}
                                            onSort={handleSort}
                                        />
                                        <SortableTh
                                            label="Status"
                                            sortKey="status"
                                            currentSort={sort}
                                            onSort={handleSort}
                                        />
                                        {adminMode && (
                                            <SortableTh
                                                label="Provider"
                                                sortKey="provider"
                                                currentSort={sort}
                                                onSort={handleSort}
                                            />
                                        )}
                                        <SortableTh
                                            label="Reqs (+4xx)"
                                            sortKey="requests"
                                            currentSort={sort}
                                            onSort={handleSort}
                                            align="right"
                                        />
                                        <SortableTh
                                            label="Success"
                                            sortKey="ok2xx"
                                            currentSort={sort}
                                            onSort={handleSort}
                                            align="right"
                                        />
                                        <SortableTh
                                            label="5xx"
                                            sortKey="errors"
                                            currentSort={sort}
                                            onSort={handleSort}
                                            align="right"
                                        />
                                        <SortableTh
                                            label="4xx"
                                            sortKey="user4xx"
                                            currentSort={sort}
                                            onSort={handleSort}
                                            align="right"
                                        />
                                        <SortableTh
                                            label="Avg"
                                            sortKey="avg"
                                            currentSort={sort}
                                            onSort={handleSort}
                                            align="right"
                                        />
                                        <SortableTh
                                            label="P95"
                                            sortKey="p95"
                                            currentSort={sort}
                                            onSort={handleSort}
                                            align="right"
                                        />
                                    </tr>
                                </TableHead>
                                <TableBody>
                                    {filteredModels.length === 0 ? (
                                        <TableRow>
                                            <TableCell
                                                colSpan={adminMode ? 10 : 9}
                                                align="center"
                                                className="py-8 text-theme-text-muted"
                                            >
                                                {lastUpdated
                                                    ? "No models found"
                                                    : "Loading models..."}
                                            </TableCell>
                                        </TableRow>
                                    ) : (
                                        filteredModels.map((model) => {
                                            const stats = model.stats;
                                            const total =
                                                stats?.total_requests || 0;
                                            const total5xx =
                                                stats?.errors_5xx || 0;
                                            const total4xx =
                                                stats?.errors_4xx || 0;
                                            const nonUserErrorTotal =
                                                total - total4xx;
                                            const pct4xx =
                                                total > 0
                                                    ? (total4xx / total) * 100
                                                    : 0;
                                            const avgSec = stats?.avg_latency_ms
                                                ? stats.avg_latency_ms / 1000
                                                : null;
                                            const p95Sec = stats?.latency_p95_ms
                                                ? stats.latency_p95_ms / 1000
                                                : null;
                                            const health =
                                                computeHealthStatus(stats);

                                            return (
                                                <TableRow
                                                    key={`${model.type}-${model.name}`}
                                                    intent={rowIntent(health)}
                                                >
                                                    <TableCell>
                                                        <ModalityChip
                                                            modality={
                                                                model.type
                                                            }
                                                            size="sm"
                                                            className="text-micro font-bold uppercase tracking-wide"
                                                        >
                                                            {model.type}
                                                        </ModalityChip>
                                                    </TableCell>
                                                    <TableCell>
                                                        <div className="flex items-center gap-2">
                                                            <span className="font-medium text-theme-text-strong">
                                                                {model.name}
                                                            </span>
                                                            {model.title && (
                                                                <span className="max-w-[24rem] truncate text-xs text-theme-text-muted">
                                                                    {
                                                                        model.title
                                                                    }
                                                                </span>
                                                            )}
                                                        </div>
                                                    </TableCell>
                                                    <TableCell>
                                                        <div className="flex flex-wrap items-center gap-1">
                                                            <StatusBadge
                                                                stats={stats}
                                                            />
                                                            <CatalogStatusBadge
                                                                status={
                                                                    model.catalogStatus
                                                                }
                                                            />
                                                        </div>
                                                    </TableCell>
                                                    {adminMode && (
                                                        <TableCell muted>
                                                            {model.provider ||
                                                                "-"}
                                                        </TableCell>
                                                    )}
                                                    <TableCell
                                                        align="right"
                                                        numeric
                                                        muted
                                                    >
                                                        {total > 0 ? (
                                                            <>
                                                                {nonUserErrorTotal.toLocaleString()}
                                                                {total4xx >
                                                                    0 && (
                                                                    <span className="ml-1 text-xs text-theme-text-muted">
                                                                        (
                                                                        {total.toLocaleString()}
                                                                        )
                                                                    </span>
                                                                )}
                                                            </>
                                                        ) : (
                                                            "-"
                                                        )}
                                                    </TableCell>
                                                    <TableCell
                                                        align="right"
                                                        numeric
                                                        className={get2xxColor(
                                                            stats?.status_2xx ||
                                                                0,
                                                            nonUserErrorTotal,
                                                        )}
                                                    >
                                                        {formatPercent(
                                                            stats?.status_2xx ||
                                                                0,
                                                            nonUserErrorTotal,
                                                            true,
                                                        )}
                                                    </TableCell>
                                                    <TableCell
                                                        align="right"
                                                        numeric
                                                    >
                                                        {total5xx > 0 ? (
                                                            <span className="font-semibold text-intent-danger-text">
                                                                {total5xx}
                                                            </span>
                                                        ) : (
                                                            <span className="text-theme-text-muted">
                                                                -
                                                            </span>
                                                        )}
                                                    </TableCell>
                                                    <TableCell
                                                        align="right"
                                                        numeric
                                                        muted
                                                    >
                                                        {pct4xx > 0
                                                            ? pct4xx < 1
                                                                ? `${pct4xx.toFixed(1)}%`
                                                                : `${Math.round(pct4xx)}%`
                                                            : "-"}
                                                    </TableCell>
                                                    <TableCell
                                                        align="right"
                                                        numeric
                                                        className={
                                                            avgSec
                                                                ? getLatencyColor(
                                                                      avgSec,
                                                                  )
                                                                : "text-theme-text-muted"
                                                        }
                                                    >
                                                        {avgSec
                                                            ? `${avgSec.toFixed(1)}s`
                                                            : "-"}
                                                    </TableCell>
                                                    <TableCell
                                                        align="right"
                                                        numeric
                                                        className={
                                                            p95Sec
                                                                ? getLatencyColor(
                                                                      p95Sec,
                                                                  )
                                                                : "text-theme-text-muted"
                                                        }
                                                    >
                                                        {p95Sec
                                                            ? `${p95Sec.toFixed(1)}s`
                                                            : "-"}
                                                    </TableCell>
                                                </TableRow>
                                            );
                                        })
                                    )}
                                </TableBody>
                            </Table>
                        </ScrollArea>
                    </Surface>
                </main>
            </ScrollArea>
        </div>
    );
}

export default App;
