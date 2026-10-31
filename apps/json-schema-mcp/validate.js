import { Validator } from "@cfworker/json-schema";
import { z } from "zod";
// Official Draft 7 meta-schema: https://json-schema.org/draft-07/schema
// Specification license: https://github.com/json-schema-org/json-schema-spec/blob/main/LICENSE
import draft7 from "./draft7.json" with { type: "json" };

export const ValidateSchema = z.object({
    schema: z.string().max(16384).describe("JSON Schema Draft 7 as JSON text"),
    data: z.string().max(65536).describe("JSON document as text"),
});

const metaValidator = new Validator(draft7, "7");
const singleSchemas = [
    "additionalItems",
    "contains",
    "additionalProperties",
    "propertyNames",
    "not",
    "if",
    "then",
    "else",
];

function parse(text, label, maxBytes) {
    if (new TextEncoder().encode(text).byteLength > maxBytes) {
        throw new Error(`${label} exceeds ${maxBytes} UTF-8 bytes.`);
    }
    let value;
    try {
        value = JSON.parse(text, (_key, item) => {
            // The interpreter uses `in` for required: only JSON members count.
            if (item && typeof item === "object" && !Array.isArray(item)) {
                Object.setPrototypeOf(item, null);
            }
            return item;
        });
    } catch {
        throw new Error(`${label} is not valid JSON.`);
    }
    let nodes = 0;
    function visit(item, depth) {
        if (++nodes > 2000 || depth > 32) {
            throw new Error(`${label} exceeds 2,000 JSON values or depth 32.`);
        }
        if (item && typeof item === "object") {
            for (const child of Object.values(item)) visit(child, depth + 1);
        }
        if (typeof item === "number" && !Number.isFinite(item)) {
            throw new Error(
                `${label} contains a number outside the finite range.`,
            );
        }
    }
    visit(value, 0);
    return value;
}

function checkSupported(schema) {
    if (typeof schema === "boolean") return;
    for (const key of Object.keys(schema)) {
        if (
            [
                "$ref",
                "$recursiveRef",
                "$dynamicRef",
                "$recursiveAnchor",
                "$dynamicAnchor",
                "$anchor",
                "$defs",
                "$vocabulary",
                "prefixItems",
                "unevaluatedItems",
                "unevaluatedProperties",
                "dependentRequired",
                "dependentSchemas",
                "minContains",
                "maxContains",
                "pattern",
                "patternProperties",
                "format",
            ].includes(key) ||
            key.startsWith("__absolute_")
        ) {
            throw new Error(`Unsupported schema keyword: ${key}.`);
        }
    }
    if (
        schema.$schema &&
        !/^https?:\/\/json-schema\.org\/draft-07\/schema#?$/.test(
            schema.$schema,
        )
    ) {
        throw new Error("Only JSON Schema Draft 7 is supported.");
    }
    for (const key of singleSchemas) {
        if (schema[key] !== undefined) checkSupported(schema[key]);
    }
    if (schema.items !== undefined) {
        if (Array.isArray(schema.items)) schema.items.forEach(checkSupported);
        else checkSupported(schema.items);
    }
    for (const key of ["allOf", "anyOf", "oneOf"])
        schema[key]?.forEach(checkSupported);
    for (const key of ["properties", "definitions"]) {
        for (const child of Object.values(schema[key] ?? {}))
            checkSupported(child);
    }
    for (const child of Object.values(schema.dependencies ?? {})) {
        if (!Array.isArray(child)) checkSupported(child);
    }
}

export function validateJson(input) {
    const { schema: schemaText, data: dataText } = ValidateSchema.parse(input);
    const schema = parse(schemaText, "Schema", 16384);
    const data = parse(dataText, "Data", 65536);
    const schemaCheck = metaValidator.validate(schema);
    if (!schemaCheck.valid) {
        const error = schemaCheck.errors.at(-1);
        throw new Error(
            `Invalid Draft 7 schema at ${error.instanceLocation}: ${error.error}`,
        );
    }
    checkSupported(schema);
    const result = new Validator(schema, "7").validate(data);
    return {
        valid: result.valid,
        errors: result.errors.slice(0, 20).map((error) => ({
            keyword: error.keyword,
            instanceLocation: error.instanceLocation.slice(0, 1024),
            keywordLocation: error.keywordLocation.slice(0, 1024),
            error: error.error.slice(0, 500),
        })),
        truncated:
            result.errors.length > 20 ||
            result.errors.some(
                (error) =>
                    error.error.length > 500 ||
                    error.instanceLocation.length > 1024 ||
                    error.keywordLocation.length > 1024,
            ),
    };
}
