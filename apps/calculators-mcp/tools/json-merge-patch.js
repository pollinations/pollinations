import { z } from "zod";

function isObject(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}

function mergePatch(target, patch) {
    if (!isObject(patch)) return patch;

    // Object spread copies "__proto__" as a data property, not a prototype setter.
    const result = isObject(target) ? { ...target } : {};
    for (const [key, value] of Object.entries(patch)) {
        if (value === null) {
            delete result[key];
        } else {
            const current = Object.hasOwn(result, key) ? result[key] : undefined;
            Object.defineProperty(result, key, {
                value: mergePatch(current, value),
                enumerable: true,
                configurable: true,
                writable: true,
            });
        }
    }
    return result;
}

export const jsonMergePatchTools = [
    [
        "json_merge_patch",
        "Apply a JSON Merge Patch (RFC 7396) locally. Objects merge recursively; a null patch member removes that key; arrays replace the whole array; and a non-object patch replaces the entire target. A non-object target becomes an empty object when the patch is an object. Note: inside objects, null means remove, so this format cannot set an object member to JSON null.",
        {
            target: z.string().min(1).max(100000).describe("Original JSON document."),
            patch: z.string().min(1).max(100000).describe("JSON Merge Patch document (RFC 7396)."),
        },
        ({ target, patch }) =>
            mergePatch(JSON.parse(target), JSON.parse(patch)),
    ],
];
