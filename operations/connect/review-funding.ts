import type { ReviewCase } from "./review-cases";

// Shared account conditions and real form actions for App and Device consent.
// The product's model catalog and AccountPollen decide which badge appears.
export const fundingSituations = [
    { id: "no-pollen", label: "No Pollen", pollen: "empty" },
    { id: "paid-required", label: "Paid required", pollen: "quest" },
] as const;

export const fundingVariants = fundingSituations.map(({ id, label }) => ({
    label,
    params: { funding: id },
}));

export function fundingReview(
    situation: (typeof fundingSituations)[number],
): Pick<ReviewCase, "conditions" | "steps" | "expected"> {
    const badge = {
        selector: `[aria-label="${situation.id === "paid-required" ? "Paid: " : ""}${situation.label}"]`,
    };
    return {
        conditions: { account: "signed-in", pollen: situation.pollen },
        steps: [
            ...(situation.id === "paid-required"
                ? ([
                      {
                          selector: 'button[aria-expanded="false"]',
                          action: "click",
                      },
                      {
                          selector: "button",
                          text: "Clear all",
                          action: "click",
                      },
                      {
                          selector:
                              '[aria-label="Requested models"]:not(:has(button[aria-pressed="true"]))',
                          action: "wait",
                      },
                      {
                          selector:
                              'input[aria-label="Search and filter models"]',
                          value: "access:paid ",
                          action: "fill",
                      },
                      {
                          selector: '[aria-label="Change Access filter: paid"]',
                          action: "wait",
                      },
                      {
                          selector: "button",
                          text: "Select all",
                          action: "click",
                      },
                      { ...badge, action: "wait" },
                      {
                          selector: 'button[aria-expanded="true"]',
                          action: "click",
                      },
                  ] as const)
                : []),
            { ...badge, action: "wait" },
        ],
        expected: [
            badge,
            {
                selector: `a[data-pollinations-action="fund-account"][href="/top-up"][aria-label="${situation.label}. Top up (opens in a new tab)"]`,
            },
        ],
    };
}
