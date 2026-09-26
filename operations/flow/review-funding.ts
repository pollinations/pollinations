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
): Pick<ReviewCase, "conditions" | "steps" | "expected" | "note"> {
    const badge = { selector: '[aria-label="No Pollen"]' };
    return {
        conditions: { account: "signed-in", pollen: situation.pollen },
        note:
            situation.id === "paid-required"
                ? "The real picker selects only paid models while the wallet has Quest Pollen and no Paid Pollen. Main shows the two balances, but no paid-model warning or top-up badge for this combination."
                : "An empty wallet shows the real No Pollen badge and its top-up link back to this authorization request.",
        steps: [
            ...(situation.id === "paid-required"
                ? ([
                      {
                          selector: 'button[aria-label="Choose models"]',
                          action: "click",
                      },
                      {
                          selector: '[aria-label="Model categories"] button',
                          text: "All",
                          action: "click",
                      },
                      {
                          selector: "button",
                          text: "Clear shown",
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
                          text: "Select all shown",
                          action: "click",
                      },
                      {
                          selector:
                              '[aria-label="Requested models"]:has(button[aria-pressed="true"]):not(:has(button[aria-pressed="false"]))',
                          action: "wait",
                      },
                      {
                          selector:
                              'button[aria-label="Collapse model selector"]',
                          action: "click",
                      },
                  ] as const)
                : []),
            ...(situation.id === "no-pollen"
                ? [{ ...badge, action: "wait" as const }]
                : []),
        ],
        expected:
            situation.id === "no-pollen"
                ? [
                      badge,
                      {
                          selector:
                              'a[href^="/top-up?redirect="][aria-label="No Pollen. Top up"]',
                      },
                  ]
                : [
                      {
                          selector: 'span:has(> span:text-is("Paid Pollen:"))',
                          text: "0",
                      },
                      { selector: 'span:text-is("Quest Pollen:")' },
                      {
                          selector:
                              'body:not(:has([role="alert"])):not(:has(a[aria-label="No Pollen. Top up"])) button:enabled:text-is("Allow access")',
                      },
                  ],
    };
}
