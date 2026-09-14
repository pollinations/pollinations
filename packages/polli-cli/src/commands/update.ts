import { spawn } from "node:child_process";
import { Command } from "commander";
import { fail, printInfo, printSuccess } from "../lib/output.js";

export const updateCommand = new Command("update")
    .description("Update the Pollinations CLI to the latest version")
    .action(async () => {
        printInfo("Updating @pollinations/cli...");

        const child = spawn("npm", ["update", "-g", "@pollinations/cli"], {
            stdio: "inherit",
            shell: true,
        });

        child.on("error", (err) => {
            fail("Failed to run npm update", err);
        });

        child.on("close", (code) => {
            if (code === 0) {
                printSuccess("Pollinations CLI updated successfully.");
            } else {
                fail(`npm update exited with code ${code ?? "unknown"}`);
            }
        });
    });
