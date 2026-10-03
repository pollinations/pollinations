import { getOutputMode } from "./output.js";

export async function notifyUpdate(pkg: { name: string; version: string }) {
    if (
        !process.stdout.isTTY ||
        !process.stderr.isTTY ||
        getOutputMode() === "json" ||
        "NO_UPDATE_NOTIFIER" in process.env ||
        process.env.CI
    )
        return;

    try {
        // Cached daily; the library checks in a detached process, never delaying exit.
        const { default: updateNotifier } = await import("update-notifier");
        updateNotifier({ pkg }).notify({
            message:
                "Update available: {currentVersion} → {latestVersion}. Run `polli update`.",
        });
    } catch {
        // Optional notices must never fail an otherwise successful command.
    }
}
