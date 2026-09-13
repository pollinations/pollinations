import { isReviewControlVisible } from "./review-driver";
// Exercise real controls for requested preview states; no production behavior is simulated here.
export function installDashboardDriver(
    screen: string,
    _query: URLSearchParams,
) {
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
                    isReviewControlVisible(b) &&
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
                    : _query.get("listing") === "hidden"
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
}
