import type { ReviewCase } from "./review-cases";

// Assert the real permission form, not a Flow-rendered copy of consent.
export function consentExpected(
    mode: "app" | "device",
    checkingApp = false,
): ReviewCase["expected"] {
    return [
        {
            selector: "h1",
            text: mode === "app" ? "Allow this app" : "Allow your device",
        },
        { selector: "#authorize-permissions", text: "Username and picture" },
        ...(mode === "app" && !checkingApp
            ? [{ selector: "body", text: "App example" }]
            : []),
        ...[
            "See your name and email.",
            "View balance, usage, earnings and quests.",
            ...(mode === "app" ? ["Manage keys, agents and models."] : []),
            "Generate",
        ].map((text) => ({
            selector: `#authorize-permissions label:has(input[type="checkbox"]:checked):has-text("${text}")`,
            text,
        })),
        ...(mode === "device"
            ? [
                  {
                      selector:
                          '#authorize-permissions:not(:has(label:has-text("Manage keys, agents and models.")))',
                  },
              ]
            : []),
        { selector: 'input[name="pollen-budget"][value="5"]' },
        { selector: 'input[name="expiry-days"][value="7"]' },
    ];
}
