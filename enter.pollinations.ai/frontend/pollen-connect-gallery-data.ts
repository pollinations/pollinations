import {
    appReturnVariants,
    type CanvasScreen,
    canvasGroups,
    enterLoginErrorScreens,
    type ScreenVariant,
} from "./pollen-connect-canvas-data";
import { getDeviceFlow } from "./pollen-connect-device";
import type {
    JourneyEntrance,
    JourneySection,
} from "./pollen-connect-journey-state";

const loginErrorIds = enterLoginErrorScreens.map((screen) => screen.id);

// Full inventory; subsections below separate authentication from signed-in top-up.
export const galleryFlowScreens: Record<JourneyEntrance, readonly string[]> = {
    app: [
        "app-connect",
        "sign-in",
        "github-handoff",
        "connection-link",
        "loading",
        ...loginErrorIds,
        "consent",
        "add-pollen-amount",
        "add-pollen-pending",
        "app-connected",
    ],
    device: getDeviceFlow().galleryScreens.map((entry) => entry.id),
    account: [
        "enter-signed-out",
        ...loginErrorIds,
        "enter-connected",
        "keys",
        "api-key",
        "key-edit",
        "key-delete",
        "app-key",
    ],
    admin: [
        "identity",
        "loading",
        ...loginErrorIds,
        "dashboard-sign-in",
        "dashboard-connected",
    ],
};

export function galleryScreensForFlow(
    flow: JourneyEntrance,
    section?: JourneySection,
): CanvasScreen[] {
    if (flow === "device") return getDeviceFlow(section).galleryScreens;
    const entries = canvasGroups.flatMap((group) => group.screens);
    let ids = galleryFlowScreens[flow];
    if (flow === "app" && section === "main")
        ids = ids.filter((id) => !id.startsWith("add-pollen-"));
    if (flow === "app" && section === "topup")
        ids = [
            "app-connect",
            "app-connected",
            "add-pollen-amount",
            "add-pollen-pending",
        ];
    if (flow === "account" && section === "topup") ids = ["enter-connected"];
    return ids.flatMap((id) => {
        const source = entries.find((entry) => entry.id === id);
        if (!source) throw new Error(`Missing gallery screen: ${id}`);
        // These two existing developer-app previews demonstrate our reusable
        // components; billing scenarios remain in the separate Top up view.
        let entry =
            id === "app-connected"
                ? {
                      ...source,
                      title:
                          section === "topup"
                              ? "App"
                              : "App · Connection status",
                      variants:
                          section === "topup"
                              ? [
                                    { label: "Connected" },
                                    {
                                        label: "Account menu",
                                        params: { app_menu: "open" },
                                    },
                                ]
                              : appReturnVariants,
                  }
                : source;
        if (flow === "app" && id === "connection-link") {
            entry = { ...source, title: "Connection blocked" };
        }
        if (id === "login-failed")
            entry = {
                ...entry,
                variants: entry.variants?.map((variant) => ({
                    ...variant,
                    label:
                        flow === "app"
                            ? "Returning from GitHub"
                            : variant.label,
                    params: { ...variant.params, login_flow: flow },
                })),
            };
        if (section === "topup" && id === "add-pollen-amount")
            entry = {
                ...source,
                variants: source.variants?.filter(
                    (variant) => variant.params?.topup_case !== "sign-in-error",
                ),
            };
        if (
            flow === "account" &&
            section === "topup" &&
            id === "enter-connected"
        )
            entry = {
                ...source,
                title: "Account top-up",
                variants: source.variants?.map((variant) => ({
                    ...variant,
                    label:
                        variant.label === "Account" ? "Top up" : variant.label,
                    params: { ...variant.params, drawer: "closed" },
                })),
            };
        if (flow === "app" && id === "sign-in") {
            entry = {
                ...source,
                variants: source.variants?.filter(
                    (variant) =>
                        !variant.screen?.startsWith("device") &&
                        // Both cases render the same signed-out Authorize UI as OAuth.
                        !["Simple BYOP", "New account"].includes(variant.label),
                ),
            };
        }
        if (id === "consent")
            entry = {
                ...entry,
                variants: entry.variants?.filter(
                    (variant) =>
                        variant.label !== "App example" &&
                        !(flow === "app" && variant.params?.request_error),
                ),
            };
        const errors = entry.variants?.filter((variant) => variant.error) ?? [];
        if (!errors.length) return [entry];
        if (id === "dashboard-sign-in")
            errors.sort(
                (a, b) =>
                    Number(b.params?.auth_error === "admin_required") -
                    Number(a.params?.auth_error === "admin_required"),
            );
        const normal =
            entry.variants?.filter((variant) => !variant.error) ?? [];
        return [
            ...(normal.length ? [{ ...entry, variants: normal }] : []),
            {
                ...entry,
                id: `${entry.id}-errors`,
                title: `${entry.title} errors`,
                variants: errors,
            },
        ];
    });
}

// Screens is an exhaustive visual inventory; the map still groups states by step.
export function galleryPagesForFlow(
    flow: JourneyEntrance,
    section?: JourneySection,
): CanvasScreen[] {
    return galleryScreensForFlow(flow, section).flatMap((entry) => {
        if (!entry.variants?.length) return [entry];
        return entry.variants.map((variant, index) => ({
            ...entry,
            id: `${entry.id}--${index}`,
            title:
                variant.label === entry.title || variant.label === "Default"
                    ? entry.title
                    : `${entry.title.replace(/ errors$/, "")} · ${variant.label}`,
            variants: [variant],
        }));
    });
}

function isInlineVariant(entry: CanvasScreen, variant: ScreenVariant) {
    const params = variant.params ?? {};
    return (
        ["consent", "add-pollen-amount", "key-edit", "sign-in"].includes(
            entry.id,
        ) &&
        !variant.error &&
        !params.result &&
        !params.session &&
        (!params.app_loading || ["sign-in", "consent"].includes(entry.id)) &&
        (!params.topup_case || params.topup_case === "covered") &&
        (!variant.screen ||
            variant.screen === entry.screen ||
            (entry.id === "consent" && variant.screen === "direct"))
    );
}

// Group matching layouts at the same point in the flow. App lookup is a busy
// state of sign-in or consent; submission failures remain separate.
function errorGroup(
    entry: CanvasScreen,
    variant: ScreenVariant,
): string | undefined {
    if (!variant.error) return;
    if (entry.id === "connection-link-errors") return "Connection blocked";
    if (entry.id === "consent-errors") {
        const reason = variant.params?.request_error;
        if (reason) return "App could not be verified";
        if (variant.params?.action === "authorize") return "Connection failed";
    }
    return undefined;
}

// A card represents a distinct UI state; settings for that state live in focus controls.
export function galleryCardsForFlow(
    flow: JourneyEntrance,
    section?: JourneySection,
): CanvasScreen[] {
    if (flow === "device") return getDeviceFlow(section).galleryScreens;
    const pages = new Map(
        galleryPagesForFlow(flow, section).map((page) => [page.id, page]),
    );
    const cards = galleryScreensForFlow(flow, section).flatMap((entry) => {
        if (
            !entry.variants?.length ||
            (entry.id === "app-connected" && section !== "topup")
        )
            return [entry];
        const inlineVariants = entry.variants.filter((variant) =>
            isInlineVariant(entry, variant),
        );
        const first = entry.variants.findIndex((variant) =>
            isInlineVariant(entry, variant),
        );
        const errorGroups = new Map<string, ScreenVariant[]>();
        for (const variant of entry.variants) {
            const title = errorGroup(entry, variant);
            if (title)
                errorGroups.set(title, [
                    ...(errorGroups.get(title) ?? []),
                    variant,
                ]);
        }
        return entry.variants.flatMap((variant, index) => {
            const title = errorGroup(entry, variant);
            if (title) {
                const variants = errorGroups.get(title) ?? [];
                return variants[0] === variant
                    ? [
                          {
                              ...entry,
                              id: `${entry.id}--${index}`,
                              title,
                              variants,
                          },
                      ]
                    : [];
            }
            if (
                (inlineVariants.length > 1 || entry.id === "consent") &&
                isInlineVariant(entry, variant)
            )
                return index === first
                    ? [
                          {
                              ...entry,
                              id:
                                  entry.id === "sign-in"
                                      ? `${entry.id}--${first}`
                                      : entry.id,
                              variants: inlineVariants,
                          },
                      ]
                    : [];
            const page = pages.get(`${entry.id}--${index}`);
            return page ? [page] : [];
        });
    });
    if (flow !== "app" || section === "topup") return cards;
    // Group by UI family while retaining every source variant and route.
    const families = new Map<string, CanvasScreen>();
    for (const entry of cards) {
        const family =
            entry.id.startsWith("sign-in--") || entry.id.startsWith("loading--")
                ? "Sign in to Pollinations"
                : entry.id === "consent" || entry.id.startsWith("consent--")
                  ? "Allow access"
                  : entry.id.startsWith("sign-in-errors") ||
                      loginErrorIds.some((id) => entry.id.startsWith(`${id}--`))
                    ? "Pollinations sign-in error"
                    : entry.id.startsWith("connection-link") ||
                        entry.id.startsWith("consent-errors")
                      ? "App connection error"
                      : entry.id;
        const existing = families.get(family);
        const variants = (entry.variants ?? []).map((variant) => ({
            ...(existing && entry.screen !== existing.screen
                ? { screen: entry.screen }
                : {}),
            ...variant,
            label: entry.id.startsWith("sign-in-errors")
                ? "Starting sign-in"
                : entry.id.startsWith("loading--")
                  ? "Checking account"
                  : variant.label,
        }));
        if (existing) {
            if (entry.screen === "login-failed")
                existing.variants?.splice(1, 0, ...variants);
            else
                existing.variants = [...(existing.variants ?? []), ...variants];
        } else
            families.set(family, {
                ...entry,
                title: family === entry.id ? entry.title : family,
                variants: variants.length ? variants : undefined,
            });
    }
    return [...families.values()];
}
