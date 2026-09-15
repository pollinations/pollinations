import { readFileSync } from "node:fs";
import { Command } from "commander";
import {
    printInfo,
    printResult,
    printSuccess,
    printWarn,
} from "../lib/output.js";
import { flavor } from "../lib/quotes.js";
import {
    checkForUpdate,
    getUpdateCommand,
    getUpdateMessage,
} from "../lib/update-checker.js";

const pkg = JSON.parse(
    readFileSync(new URL("../package.json", import.meta.url), "utf-8"),
) as { version: string };

async function showUpdateStatus(): Promise<void> {
    const info = await checkForUpdate(pkg.version);

    const message = getUpdateMessage(info);
    if (message) {
        printWarn(message);
        printInfo(`Run: ${getUpdateCommand()}`);
    } else {
        printSuccess(`You're on the latest version (${info.currentVersion})`);
    }
    printInfo(flavor.update);
}

async function checkUpdate(): Promise<void> {
    const info = await checkForUpdate(pkg.version);

    if (process.env.NO_COLOR === "1") {
        printResult({
            currentVersion: info.currentVersion,
            latestVersion: info.latestVersion,
            updateAvailable: info.updateAvailable,
        });
        return;
    }

    printResult({
        currentVersion: info.currentVersion,
        latestVersion: info.latestVersion,
        updateAvailable: info.updateAvailable,
    });
}

const check = new Command("check")
    .description("Check if a newer version is available")
    .action(checkUpdate);

export const updateCommand = new Command("update")
    .description("Check for updates and show update instructions")
    .action(showUpdateStatus)
    .addCommand(check);
