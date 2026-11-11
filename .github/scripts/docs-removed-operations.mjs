import { readFileSync } from "node:fs";

function operations(markdown) {
    const keys = new Set(
        [
            ...markdown.matchAll(
                /^#{1,6}\s+`(GET|HEAD|POST|PUT|PATCH|DELETE|OPTIONS|TRACE)`\s+`(\/[^`\r\n]*)`/gm,
            ),
        ].map(([, method, path]) => `${method} ${path}`),
    );
    if (keys.size === 0)
        throw new Error("No API operations found in reference");
    return keys;
}

export function removedOperations(previous, candidate) {
    const before = operations(previous);
    const after = operations(candidate);
    return [...before].filter((operation) => !after.has(operation)).sort();
}

if (import.meta.main) {
    const [previous, candidate] = process.argv.slice(2);
    const removed = removedOperations(
        readFileSync(previous, "utf8"),
        readFileSync(candidate, "utf8"),
    );
    console.log(removed.map((operation) => `- \`${operation}\``).join("\n"));
}
