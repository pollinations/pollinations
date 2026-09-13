import { loginErrors } from "@shared/auth/login-errors.ts";
import type { CanvasScreen } from "./pollen-connect-canvas-data";
import { dashboardSections } from "./pollen-connect-dashboard";
import { appLoginReviewCases, type ReviewCase } from "./review-cases";
import {
    appTopupReviewCases,
    dashboardReviewCasesForSection,
} from "./review-dashboard";
import {
    adminReviewCases,
    deviceReviewCasesForSection,
} from "./review-device-admin";

// Screens, Map, Journey and the capture service consume this same inventory.
export const reviewFlows = [
    { flow: "app", section: "main", cases: appLoginReviewCases },
    { flow: "app", section: "topup", cases: appTopupReviewCases },
    ...(["main", "link"] as const).map((section) => ({
        flow: "device",
        section,
        cases: deviceReviewCasesForSection(section),
    })),
    ...dashboardSections.map(({ id: section }) => ({
        flow: "account",
        section,
        cases: dashboardReviewCasesForSection(section),
    })),
    { flow: "admin", section: "main", cases: adminReviewCases },
];

export function reviewCasesForFlow(
    flow: string,
    section: string,
): ReviewCase[] {
    return (
        reviewFlows.find(
            (entry) => entry.flow === flow && entry.section === section,
        )?.cases ?? []
    );
}

export function reviewCaseForScreen(
    cases: ReviewCase[],
    entry: CanvasScreen,
    choices: Record<string, string>,
    family?: string,
): ReviewCase | undefined {
    // Gallery groups by page; Map groups by branch. An exact recipe id may
    // also be a page id, so it must not bypass that page's selected situation.
    const candidates = cases.filter((recipe) =>
        family === undefined
            ? recipe.pageId === entry.id
            : recipe.family === family,
    );
    return (
        candidates.find((recipe) => choices[recipe.pageId] === recipe.id) ??
        candidates[0]
    );
}

export function situationLabel(
    recipe: ReviewCase,
    screen: CanvasScreen,
): string {
    return recipe.title.startsWith(`${screen.title} · `)
        ? recipe.title.slice(screen.title.length + 3)
        : recipe.title === screen.title
          ? "Ready"
          : recipe.title;
}

// Observe the product's page identifier; never derive navigation from a click.
export function reviewCaseForNode(cases: ReviewCase[], node: string) {
    return (
        cases.find((item) => item.id === node) ??
        cases.find((item) => item.family === node || item.pageId === node) ??
        cases.find((item) => item.query.screen === node) ??
        (node === loginErrors.default.id
            ? cases.find(
                  (item) =>
                      item.action?.type === "sign-in" &&
                      item.action.outcome === "provider-error",
              )
            : undefined)
    );
}
