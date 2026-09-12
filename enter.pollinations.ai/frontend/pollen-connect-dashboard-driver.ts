// Exercise real controls for requested preview states; no production behavior is simulated here.
export function installDashboardDriver(screen: string, query: URLSearchParams) {
    const section = screen.split("-")[1];
    const operation = screen.split("-").at(-1);
    const deployment = ["models", "agents"].includes(section);
    const button = (label: string) =>
        [...document.querySelectorAll<HTMLButtonElement>("button")]
            .sort(
                (a, b) =>
                    Number(Boolean(b.closest('[role="dialog"]'))) -
                    Number(Boolean(a.closest('[role="dialog"]'))),
            )
            .find(
                (b) =>
                    b.getClientRects().length &&
                    [
                        b.title,
                        b.getAttribute("aria-label"),
                        b.textContent?.trim(),
                    ].includes(label),
            );
    if (["create", "edit", "delete", "visibility"].includes(operation ?? "")) {
        const add: Record<string, string> = {
            keys: "Add Key",
            apps: "Add App",
            models: "Add Model",
            agents: "Add Agent",
        };
        const title =
            operation === "create"
                ? add[section]
                : operation === "edit"
                  ? section === "agents"
                      ? "Edit agent"
                      : section === "models"
                        ? "Edit model"
                        : "Edit key"
                  : operation === "delete"
                    ? section === "account"
                        ? "Delete account"
                        : deployment
                          ? section === "agents"
                              ? "Delete agent"
                              : "Delete model"
                          : "Delete key"
                    : query.get("hidden") === "1"
                      ? "Relist"
                      : "Hide";
        const reveal = setInterval(() => {
            const target = button(title);
            if (target) {
                clearInterval(reveal);
                target.click();
            }
        }, 100);
        setTimeout(() => clearInterval(reveal), 10000);
    }
    const action = query.get("action");
    const publicCreate =
        deployment && operation === "create" && query.get("publisher") === "1";
    if (!action && !publicCreate) return;
    let filled = false;
    let baseModelFilled = false;
    const run = setInterval(() => {
        const dialog = [...document.querySelectorAll('[role="dialog"]')].find(
            (el) => el.getClientRects().length,
        );
        if (
            ["confirm-account", "delete-account"].includes(action ?? "") &&
            dialog &&
            !filled
        ) {
            const input = dialog.querySelector<HTMLInputElement>("input");
            if (!input) return;
            Object.getOwnPropertyDescriptor(
                HTMLInputElement.prototype,
                "value",
            )?.set?.call(input, "DELETE");
            input.dispatchEvent(new Event("input", { bubbles: true }));
            filled = true;
            if (action === "confirm-account") clearInterval(run);
            return;
        }
        if (publicCreate && dialog) {
            const target = button("Public");
            if (target && !target.disabled) {
                target.click();
                clearInterval(run);
            }
            return;
        }
        if (
            deployment &&
            ["create", "test"].includes(action ?? "") &&
            dialog?.querySelector('[name="community-model-name"]') &&
            !filled
        ) {
            filled = true;
            const values: Record<string, string> = {
                "community-model-name": "preview-created",
                "community-model-title": "Preview created",
                "community-endpoint-url":
                    "https://provider.example/v1/chat/completions",
                "community-upstream-id": "example-model",
                "community-api-bearer-token": "preview-only-not-a-credential",
                "prompt-agent-system-prompt": "You are a helpful assistant.",
            };
            for (const [name, value] of Object.entries(values)) {
                if (action === "test" && name !== "community-api-bearer-token")
                    continue;
                const input = dialog.querySelector<
                    HTMLInputElement | HTMLTextAreaElement
                >(`[name="${name}"]`);
                if (!input) continue;
                const proto =
                    input instanceof HTMLTextAreaElement
                        ? HTMLTextAreaElement.prototype
                        : HTMLInputElement.prototype;
                Object.getOwnPropertyDescriptor(proto, "value")?.set?.call(
                    input,
                    value,
                );
                input.dispatchEvent(new Event("input", { bubbles: true }));
            }
            return;
        }
        if (
            section === "agents" &&
            action === "create" &&
            filled &&
            !baseModelFilled
        ) {
            const input = dialog?.querySelector<HTMLInputElement>(
                '[name="prompt-agent-base-model"]',
            );
            if (!input) return;
            input.focus();
            Object.getOwnPropertyDescriptor(
                HTMLInputElement.prototype,
                "value",
            )?.set?.call(input, "openai");
            input.dispatchEvent(new Event("input", { bubbles: true }));
            baseModelFilled = true;
            return;
        }
        const labels: Record<string, string[]> = {
            create: deployment
                ? [
                      "Add Private Model",
                      "Publish Model",
                      "Add Private Agent",
                      "Publish Agent",
                  ]
                : ["Create key"],
            save: deployment ? ["Save Model", "Save Agent"] : ["Save"],
            delete: ["Delete"],
            test: ["Test endpoint", "Test Endpoint", "Test"],
            "sign-in": ["Sign in with GitHub"],
            claim: ["Claim"],
            visibility: ["Hide", "Relist"],
            "delete-account": ["Delete account"],
            "link-discord": ["Connect Discord"],
            "unlink-discord": ["Disconnect Discord"],
            "link-integration": ["Connect Example app"],
            "unlink-integration": ["Disconnect Example app"],
        };
        const target = (labels[action ?? ""] ?? [])
            .map(button)
            .find((b) => b && !b.disabled);
        if (target) {
            clearInterval(run);
            // Inspector frames block trusted browser actions. Dispatch the
            // fixture submission explicitly so the real React form can render
            // its pending/error state there as well as in Journey.
            if (target.type === "submit" && target.form)
                target.form.dispatchEvent(
                    new Event("submit", { bubbles: true, cancelable: true }),
                );
            else target.click();
        }
    }, 100);
    setTimeout(() => clearInterval(run), 10000);
}
