import { z } from "zod";

function decodeToken(token) {
    if (/~(?![01])/.test(token))
        throw new Error(`Invalid JSON Pointer escape in token: ${token}`);
    return token.replace(/~[01]/g, (escape) =>
        escape === "~1" ? "/" : "~",
    );
}

function resolvePointer(document, pointer) {
    if (pointer === "") return { pointer, found: true, value: document };
    if (!pointer.startsWith("/"))
        throw new Error("A JSON Pointer must be empty or start with '/'");

    let value = document;
    for (const rawToken of pointer.slice(1).split("/")) {
        const token = decodeToken(rawToken);
        if (Array.isArray(value)) {
            if (!/^(0|[1-9][0-9]*)$/.test(token))
                return { pointer, found: false };
            const index = Number(token);
            if (!Number.isSafeInteger(index) || index >= value.length)
                return { pointer, found: false };
            value = value[index];
        } else if (
            value !== null &&
            typeof value === "object" &&
            Object.prototype.hasOwnProperty.call(value, token)
        ) {
            value = value[token];
        } else {
            return { pointer, found: false };
        }
    }
    return { pointer, found: true, value };
}

export const jsonPointerTools = [
    [
        "json_pointer",
        "Read a value from JSON using a JSON Pointer (RFC 6901). Use an empty pointer for the whole document, or slash-separated tokens such as /items/0/name. Escape '/' in object keys as '~1' and '~' as '~0'. Returns found=false for a missing path; found=true with value=null for an explicit JSON null. No network or model calls.",
        {
            json: z.string().min(1).max(100000).describe("JSON document text."),
            pointer: z
                .string()
                .max(2048)
                .describe("RFC 6901 JSON Pointer; empty string selects the root."),
        },
        ({ json, pointer }) => resolvePointer(JSON.parse(json), pointer),
    ],
];
