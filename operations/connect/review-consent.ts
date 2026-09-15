import type { ReviewCase } from "./review-cases";

// Expected content of the actual local App and Device requests. These are
// capture assertions, not UI: a different identity or grant must fail review.
export function consentExpected(
    mode: "app" | "device",
    checkingApp = false,
): ReviewCase["expected"] {
    return [
        {
            selector: "#authorize-dialog-title",
            text: checkingApp ? "This app" : "App example",
        },
        {
            selector:
                'label:has(input[type="checkbox"]:checked:disabled):has-text("Required")',
            text: "ID, username and picture.",
        },
        ...[
            ["Share display name and email", "Display name and email."],
            [
                "Share account activity",
                "Balance, usage, earnings and quest status.",
            ],
            ...(mode === "app"
                ? [
                      [
                          "Allow account management",
                          "API keys, agents, models and connected apps.",
                      ],
                  ]
                : []),
            ["Allow AI generation", "AI generation"],
        ].map(([label, text]) => ({
            selector: `label:has(input[aria-label="${label}"]:checked)`,
            text,
        })),
        ...(mode === "device"
            ? [
                  {
                      selector:
                          '[role="dialog"]:not(:has(input[aria-label="Allow account management"]))',
                  },
              ]
            : []),
        { selector: 'input[name="pollen-budget"][value="5"]' },
        { selector: 'input[name="expiry-days"][value="7"]' },
    ];
}
