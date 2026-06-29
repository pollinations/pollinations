import YAML from "yaml";
import { stringify as csvStringify } from "csv-stringify";

export type OutputFormat = "human" | "json" | "yaml" | "csv";

export function formatOutput(data: unknown, format: OutputFormat): string {
    switch (format) {
        case "json":
            return JSON.stringify(data, null, 2);
        case "yaml":
            return YAML.stringify(data);
        case "csv": {
            // For arrays of objects, convert to CSV
            if (Array.isArray(data) && data.length > 0 && typeof data[0] === "object") {
                return new Promise((resolve, reject) => {
                    csvStringify(data, { header: true }, (err, output) => {
                        if (err) reject(err);
                        else resolve(output);
                    });
                }) as unknown as string;
            }
            // For single objects, convert to array
            if (typeof data === "object" && data !== null && !Array.isArray(data)) {
                return formatOutput([data], "csv");
            }
            return String(data);
        }
        default:
            return String(data);
    }
}

export function formatOutputSync(data: unknown, format: OutputFormat): string {
    switch (format) {
        case "json":
            return JSON.stringify(data, null, 2);
        case "yaml":
            return YAML.stringify(data);
        case "csv": {
            if (Array.isArray(data) && data.length > 0 && typeof data[0] === "object") {
                // Synchronous CSV generation using a simple approach
                const headers = Object.keys(data[0]);
                const rows = data.map((item) => headers.map((h) => String(item[h] ?? "")));
                const lines = [headers.join(","), ...rows.map((r) => r.join(","))];
                return lines.join("\n");
            }
            if (typeof data === "object" && data !== null && !Array.isArray(data)) {
                return formatOutputSync([data], "csv");
            }
            return String(data);
        }
        default:
            return String(data);
    }
}