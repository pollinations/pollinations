import { Command } from "commander";
import ora from "ora";
import { BASE_URL, ENTER_URL } from "../lib/config.js";
import { getOutputMode, printTable } from "../lib/output.js";

async function checkEndpoint(name: string, url: string) {
    const start = Date.now();
    try {
        const res = await fetch(url, {
            method: "HEAD",
            signal: AbortSignal.timeout(10_000),
        });
        const latency = Date.now() - start;
        return {
            service: name,
            status: res.ok ? (latency > 3000 ? "slow" : "up") : "down",
            latency: `${latency}ms`,
        };
    } catch {
        return {
            service: name,
            status: "down",
            latency: `${Date.now() - start}ms`,
        };
    }
}

export const healthCommand = new Command("health")
    .description("Check Pollinations API health")
    .action(async () => {
        const isHuman = getOutputMode() === "human";
        const spinner = isHuman ? ora("Checking services...").start() : null;

        const checks = await Promise.all([
            checkEndpoint("API Gateway", `${BASE_URL}/v1/models`),
            checkEndpoint("Enter Gateway", `${ENTER_URL}/api/docs`),
            checkEndpoint("Image Models", `${BASE_URL}/image/models`),
        ]);

        spinner?.stop();
        printTable(checks, ["service", "status", "latency"]);
    });
