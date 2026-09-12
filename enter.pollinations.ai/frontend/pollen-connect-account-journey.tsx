import { Button, TabButton, useColorMode } from "@pollinations/ui";
import { useEffect, useRef, useState } from "react";
import { accountActionScreens } from "./pollen-connect-account-actions";
import { adminScreens, adminSelectionForPreview } from "./pollen-connect-admin";
import { canvasScreenUrl } from "./pollen-connect-canvas-data";
import {
    type DashboardPreviewSelection,
    type DashboardSection,
    dashboardScreens,
    dashboardSectionForScreen,
    getDashboardFlow,
} from "./pollen-connect-dashboard";
import type { JourneyLocation } from "./pollen-connect-journey-state";
import { JourneyPreview, ScreenOwnership } from "./pollen-connect-preview";

type PreviewTab = { id: number; src: string; screen: string };

// The journey navigates the same route fixtures as Screens and Map. A Wallet
// link opens a preview tab while the key-editor iframe stays mounted with its draft.
export function AccountJourney({
    desktop,
    active = true,
    onLocationChange,
    onOpenDashboard,
    dashboard,
    admin = false,
    onDashboardNavigate,
    selection,
    onPreviewChange,
    revision = 0,
}: {
    active?: boolean;
    dashboard?: DashboardSection;
    admin?: boolean;
    selection?: DashboardPreviewSelection;
    onPreviewChange?: (screen: string, variant?: number) => void;
    onDashboardNavigate?: (section: DashboardSection) => void;
    revision?: number;
    desktop: boolean;
    onLocationChange: (location: JourneyLocation) => void;
    onOpenDashboard: () => void;
}) {
    const { mode } = useColorMode();
    const activeRef = useRef(active);
    activeRef.current = active;
    const [signedIn, setSignedIn] = useState(dashboard !== "main");
    const [exitNote, setExitNote] = useState("");
    const managed = Boolean(dashboard || admin);
    const inventory = admin
        ? adminScreens
        : dashboard
          ? dashboardScreens
          : accountActionScreens;
    const [adminResult, setAdminResult] = useState("ready");
    const [adminSession, setAdminSession] = useState(false);
    const visibleScreens = dashboard
        ? getDashboardFlow(dashboard).screens
        : inventory;
    const [tabs, setTabs] = useState<PreviewTab[]>([]);
    const entry =
        inventory.find((entry) => entry.id === tabs.at(-1)?.screen) ??
        inventory[0];
    function open(id: string, variant = 0) {
        onPreviewChange?.(id, variant);
        const screen =
            inventory.find((entry) => entry.id === id) ?? inventory[0];
        setTabs([
            {
                id: Date.now(),
                screen: id,
                src: canvasScreenUrl(screen, variant, {
                    theme: mode,
                    journey: "1",
                    ...(admin
                        ? {
                              admin_preview: "1",
                              admin_result: adminResult,
                              admin_session: adminSession ? "1" : "0",
                          }
                        : dashboard
                          ? {
                                dashboard_preview: "1",
                                drawer: "closed",
                                preview_run: String(Date.now()),
                            }
                          : { account_action: "1" }),
                    owner_session: signedIn ? "signed-in" : "signed-out",
                }),
            },
        ]);
    }
    // Section tabs bump revision to start a fresh example. Following a link
    // changes the section without resetting the mounted route or dialog.
    // biome-ignore lint/correctness/useExhaustiveDependencies: revision controls explicit section changes; open captures the selected fixture settings.
    useEffect(() => {
        setExitNote("");
        open(
            admin
                ? adminScreens[0].id
                : dashboard
                  ? getDashboardFlow(dashboard).screens[0].id
                  : "account-app",
        );
    }, [mode, signedIn, revision, adminResult, adminSession]);
    // biome-ignore lint/correctness/useExhaustiveDependencies: only explicit cross-view selections request a fresh fixture.
    useEffect(() => {
        if (
            selection?.revision &&
            inventory.some((entry) => entry.id === selection.screen)
        )
            open(selection.screen, selection.variant);
    }, [selection?.revision]);
    // Returning from Map or Screens restores its selected fixture. Dialogs can
    // dismiss on iframe focus loss while the user operates the outer controls.
    // biome-ignore lint/correctness/useExhaustiveDependencies: this is an explicit view switch, not a runtime navigation.
    useEffect(() => {
        if (
            active &&
            selection &&
            inventory.some((entry) => entry.id === selection.screen)
        )
            open(selection.screen, selection.variant);
    }, [active]);
    useEffect(
        () =>
            onLocationChange({
                world: admin ? "admin" : dashboard ? "account" : "topup",
                node: entry.id,
            }),
        [entry.id, onLocationChange, dashboard, admin],
    );
    return (
        <section
            className="account-action-journey"
            data-preview-size={desktop ? "desktop" : "mobile"}
        >
            <div className="flex flex-wrap items-center gap-2">
                {managed
                    ? visibleScreens.length > 1 && (
                          <select
                              aria-label="Journey screen"
                              value={entry.id}
                              onChange={(event) => open(event.target.value)}
                          >
                              {visibleScreens.map((screen) => (
                                  <option key={screen.id} value={screen.id}>
                                      {screen.title}
                                  </option>
                              ))}
                          </select>
                      )
                    : inventory
                          .filter((entry) =>
                              [
                                  "account-app",
                                  "account-key",
                                  "account-wallet",
                              ].includes(entry.id),
                          )
                          .map((entry) => (
                              <TabButton
                                  key={entry.id}
                                  active={tabs.at(-1)?.screen === entry.id}
                                  onClick={() => open(entry.id)}
                              >
                                  {entry.title}
                              </TabButton>
                          ))}
                {admin && (
                    <>
                        <label className="flex gap-2 items-center">
                            <input
                                type="checkbox"
                                checked={adminSession}
                                onChange={(event) =>
                                    setAdminSession(event.target.checked)
                                }
                            />
                            Signed in to Pollinations
                        </label>
                        <select
                            aria-label="Admin sign-in result"
                            value={adminResult}
                            onChange={(event) =>
                                setAdminResult(event.target.value)
                            }
                        >
                            <option value="ready">Admin access verified</option>
                            {adminScreens
                                .flatMap((entry) => entry.variants ?? [])
                                .filter(
                                    (variant) =>
                                        variant.params?.login_error ||
                                        variant.params?.auth_error,
                                )
                                .map((variant) => (
                                    <option
                                        key={variant.label}
                                        value={
                                            variant.params?.login_error ??
                                            variant.params?.auth_error
                                        }
                                    >
                                        {variant.label}
                                    </option>
                                ))}
                        </select>
                    </>
                )}
                {!managed && (
                    <label className="ml-auto flex gap-2 items-center">
                        <input
                            type="checkbox"
                            checked={signedIn}
                            onChange={(event) =>
                                setSignedIn(event.target.checked)
                            }
                        />
                        Signed in on Pollinations
                    </label>
                )}
            </div>
            <div className="journey-screen-caption">
                <strong>{entry.title}</strong>
                <ScreenOwnership entry={entry} />
                {(entry.variants?.length ?? 0) > 1 && (
                    <select
                        key={entry.id}
                        aria-label="Preview state"
                        value={
                            selection?.screen === entry.id
                                ? selection.variant
                                : ""
                        }
                        onChange={(event) =>
                            open(entry.id, Number(event.target.value))
                        }
                    >
                        <option value="" disabled>
                            Choose a state
                        </option>
                        {entry.variants?.map((variant, index) => (
                            <option key={variant.label} value={index}>
                                {variant.label}
                            </option>
                        ))}
                    </select>
                )}
            </div>
            {tabs.length > 1 && (
                <Button
                    data-theme="neutral"
                    onClick={() => setTabs((tabs) => tabs.slice(0, -1))}
                >
                    Close tab · return to previous page
                </Button>
            )}
            <div className="account-action-frames">
                <JourneyPreview desktop={desktop}>
                    {tabs.map((tab, index) => (
                        <iframe
                            key={tab.id}
                            src={tab.src}
                            title={`${inventory.find((entry) => entry.id === tab.screen)?.title ?? "Account"} · journey`}
                            hidden={index !== tabs.length - 1}
                            sandbox="allow-scripts allow-same-origin allow-forms"
                            onLoad={(event) => {
                                const frame = event.currentTarget;
                                const doc = frame.contentDocument;
                                if (!doc || !frame.contentWindow) return;
                                const current = new URL(
                                    frame.contentWindow.location.href,
                                );
                                const screen =
                                    current.searchParams.get("screen");
                                const matches = (
                                    entry: (typeof inventory)[number],
                                ) =>
                                    entry.screen === screen ||
                                    entry.variants?.some(
                                        (v) => v.screen === screen,
                                    );
                                const entry =
                                    inventory.find(
                                        (entry) =>
                                            entry.id === tab.screen &&
                                            matches(entry),
                                    ) ??
                                    inventory.find(
                                        (entry) => entry.screen === screen,
                                    ) ??
                                    inventory.find((entry) =>
                                        entry.variants?.some(
                                            (variant) =>
                                                variant.screen === screen,
                                        ),
                                    );
                                if (entry) {
                                    if (activeRef.current) {
                                        const selected = admin
                                            ? adminSelectionForPreview(
                                                  current.searchParams,
                                              )
                                            : null;
                                        onPreviewChange?.(
                                            entry.id,
                                            selected?.variant,
                                        );
                                    }
                                    if (dashboard)
                                        onDashboardNavigate?.(
                                            dashboardSectionForScreen(entry.id),
                                        );
                                    setTabs((tabs) =>
                                        tabs.map((item) =>
                                            item.id === tab.id
                                                ? { ...item, screen: entry.id }
                                                : item,
                                        ),
                                    );
                                }
                                if (dashboard) {
                                    let initializing = true;
                                    const sync = () => {
                                        if (!activeRef.current) return;
                                        const node =
                                            doc.documentElement.dataset
                                                .dashboardNode;
                                        if (node) {
                                            if (
                                                initializing &&
                                                node !==
                                                    (entry?.id ?? tab.screen)
                                            )
                                                return;
                                            initializing = false;
                                            onPreviewChange?.(node);
                                            onDashboardNavigate?.(
                                                dashboardSectionForScreen(node),
                                            );
                                            setTabs((tabs) =>
                                                tabs.map((item) =>
                                                    item.id === tab.id &&
                                                    item.screen !== node
                                                        ? {
                                                              ...item,
                                                              screen: node,
                                                          }
                                                        : item,
                                                ),
                                            );
                                        }
                                    };
                                    doc.defaultView?.addEventListener(
                                        "dashboard-preview-location",
                                        sync,
                                    );
                                    doc.defaultView?.addEventListener(
                                        "dashboard-preview-exit",
                                        () =>
                                            setExitNote(
                                                doc.documentElement.dataset
                                                    .previewExit || "",
                                            ),
                                    );
                                    sync();
                                }
                                doc.defaultView?.addEventListener(
                                    "click",
                                    (event) => {
                                        const anchor = (
                                            event.target as Element
                                        )?.closest?.("a");
                                        if (
                                            !anchor ||
                                            anchor.target !== "_blank"
                                        )
                                            return;
                                        if (
                                            anchor.dataset
                                                .pollinationsAction ===
                                            "dashboard"
                                        ) {
                                            event.preventDefault();
                                            event.stopImmediatePropagation();
                                            onOpenDashboard();
                                            return;
                                        }
                                        const url = new URL(anchor.href);
                                        const next = new URL(current);
                                        if (
                                            url.pathname ===
                                            "/pollen-connect-screen.html"
                                        )
                                            next.search = url.search;
                                        else if (url.pathname === "/top-up") {
                                            next.searchParams.set(
                                                "screen",
                                                "account-wallet",
                                            );
                                            next.searchParams.delete("action");
                                            next.searchParams.delete(
                                                "account_case",
                                            );
                                        } else return;
                                        event.preventDefault();
                                        event.stopImmediatePropagation();
                                        next.searchParams.set(
                                            "account_action",
                                            "1",
                                        );
                                        const id =
                                            inventory.find(
                                                (entry) =>
                                                    entry.screen ===
                                                    next.searchParams.get(
                                                        "screen",
                                                    ),
                                            )?.id ?? "account-wallet";
                                        setTabs((tabs) => [
                                            ...tabs,
                                            {
                                                id: Date.now(),
                                                screen: id,
                                                src: next.href,
                                            },
                                        ]);
                                    },
                                    true,
                                );
                            }}
                        />
                    ))}
                </JourneyPreview>
            </div>
            {exitNote && <output className="text-sm">{exitNote}</output>}
            <p className="text-sm text-theme-text-muted">
                {admin
                    ? "Local preview: shared admin authentication and account menu. No live sign-in requests are sent."
                    : dashboard
                      ? "Local preview: the dashboard routes and dialogs use inert sample data."
                      : "Local preview only. Key edits change app allowance; payment changes the wallet. Wallet opens separately to preserve unsaved edits."}
            </p>
        </section>
    );
}
