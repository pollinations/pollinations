import { LogLevel, getLogger } from "@logtape/logtape";
import { ensureConfigured } from "../src/logger.ts";
import { createInterface } from "node:readline/promises";

async function main() {
    await ensureConfigured({ level: "trace", format: "text" });
    const readline = createInterface({
        input: process.stdin,
    });
    readline.on("line", processLine);
}

function processLine(line: string) {
    try {
        const json = JSON.parse(line);

        if (!json.level) {
            console.log(line);
            return;
        }

        const category = ((json.logger as string) || "").split(":");
        const log = getLogger(category);

        log.emit({
            level: (json.level as string).toLowerCase() as LogLevel,
            timestamp: new Date(json["@timestamp"]).getTime(),
            message: [json.message],
            rawMessage: json.message,
            properties: json.properties || {},
        });
    } catch (err) {
        console.log(line);
    }
}

main();
