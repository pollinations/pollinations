import "@pollinations/ui/app.css";
import {
    dashboardFetch,
    signIn,
    signOut,
    useDashboardSession,
} from "@pollinations/auth/react";
import {
    AppHeader,
    ChevronIcon,
    ColorModeToggle,
    Dropdown,
    DropdownItem,
    TabButton,
} from "@pollinations/ui";
import { DashboardAccountMenu, DashboardSignIn } from "@pollinations/ui/auth";
import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import {
    currentDashboards,
    type Dashboard,
    dashboardSrc,
    hasTrafficSelector,
    readDashboardUid,
    readTraffic,
    TRAFFIC,
} from "./dashboards.ts";

function useDashboards(): Dashboard[] {
    const [dashboards, setDashboards] = useState<Dashboard[]>([]);
    useEffect(() => {
        let active = true;
        dashboardFetch("/grafana/api/search?type=dash-db")
            .then((response) => (response.ok ? response.json() : []))
            .then((results) => {
                if (active) setDashboards(currentDashboards(results));
            })
            // The picker is an aid, not the dashboard. An unreachable list
            // leaves the embedded Grafana on its default dashboard.
            .catch(() => {});
        return () => {
            active = false;
        };
    }, []);
    return dashboards;
}

/** State kept in one URL search parameter, so links and back/forward work. */
function useUrlParam<T extends string>(
    name: string,
    read: (search: string) => T,
) {
    const [value, setValue] = useState(() => read(window.location.search));
    useEffect(() => {
        const sync = () => setValue(read(window.location.search));
        window.addEventListener("popstate", sync);
        return () => window.removeEventListener("popstate", sync);
    }, [read]);
    const select = (next: T) => {
        const url = new URL(window.location.href);
        url.searchParams.set(name, next);
        window.history.pushState(null, "", url);
        setValue(next);
    };
    return [value, select] as const;
}

function DashboardPicker({
    dashboards,
    selected,
    onSelect,
}: {
    dashboards: Dashboard[];
    selected: string;
    onSelect: (uid: string) => void;
}) {
    if (dashboards.length === 0) return null;
    const title =
        dashboards.find((dashboard) => dashboard.uid === selected)?.title ??
        "Dashboards";
    return (
        <Dropdown
            align="start"
            className="w-60 max-w-[calc(100vw-2rem)] p-1"
            trigger={(open) => (
                <TabButton
                    active={open}
                    size="sm"
                    ariaLabel={`Select dashboard, showing ${title}`}
                    className="gap-2"
                >
                    <span className="truncate">{title}</span>
                    <ChevronIcon expanded={open} />
                </TabButton>
            )}
        >
            {(close) =>
                dashboards.map((dashboard) => (
                    <DropdownItem
                        key={dashboard.uid}
                        aria-current={
                            dashboard.uid === selected ? "page" : undefined
                        }
                        onClick={() => {
                            onSelect(dashboard.uid);
                            close();
                        }}
                    >
                        {dashboard.title}
                    </DropdownItem>
                ))
            }
        </Dropdown>
    );
}

function Dashboards({
    user,
}: {
    user: NonNullable<ReturnType<typeof useDashboardSession>["user"]>;
}) {
    const dashboards = useDashboards();
    const [uid, select] = useUrlParam("d", readDashboardUid);
    const [traffic, selectTraffic] = useUrlParam("traffic", readTraffic);
    const src = dashboardSrc(uid, traffic);
    return (
        <div className="flex h-dvh flex-col bg-app-bg">
            <AppHeader navLabel="Observability links">
                <DashboardPicker
                    dashboards={dashboards}
                    selected={uid}
                    onSelect={select}
                />
                {hasTrafficSelector(uid) && (
                    <fieldset
                        aria-label="Traffic"
                        className="m-0 flex gap-1 border-0 p-0"
                    >
                        {TRAFFIC.map(({ value, label }) => (
                            <TabButton
                                key={value}
                                active={value === traffic}
                                size="sm"
                                variant="ghost"
                                onClick={() => selectTraffic(value)}
                            >
                                {label}
                            </TabButton>
                        ))}
                    </fieldset>
                )}
                <ColorModeToggle />
                <DashboardAccountMenu user={user} onSignOut={signOut} />
            </AppHeader>
            {/* Keyed so switching swaps the frame instead of navigating it,
                which would push a second entry onto the browser history. */}
            <iframe
                key={src}
                className="min-h-0 w-full flex-1 border-0"
                title="Observability dashboards"
                src={src}
            />
        </div>
    );
}

function App() {
    const { user, isPending, error } = useDashboardSession();
    if (isPending || error || !user)
        return (
            <DashboardSignIn
                appName="Observability"
                onSignIn={signIn}
                isPending={isPending}
                sessionError={error}
            />
        );
    return <Dashboards user={user} />;
}
const root = document.getElementById("root");
if (root) createRoot(root).render(<App />);
