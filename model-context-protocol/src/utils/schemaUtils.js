/**
 * Utilities for schema conversion and validation
 */

import { z } from "zod";

/**
 * Converts a JSON Schema object to a Zod schema
 * @param {Object} jsonSchema - JSON Schema object
 * @returns {Object} - Zod schema object
 */
export function createZodSchemaFromJsonSchema(jsonSchema) {
    if (!jsonSchema || !jsonSchema.properties) {
        return z.object({});
    }

    const zodSchema = {};

    for (const [key, prop] of Object.entries(jsonSchema.properties)) {
        let zodProp;

        switch (prop.type) {
            case "string":
                zodProp = z.string();
                break;
            case "number":
                zodProp = z.number();
                break;
            case "boolean":
                zodProp = z.boolean();
                break;
            case "object":
                if (prop.properties) {
                    zodProp = createZodSchemaFromJsonSchema(prop);
                } else {
                    zodProp = z.object({});
                }
                break;
            default:
                zodProp = z.any();
        }

        if (prop.description) {
            zodProp = zodProp.describe(prop.description);
        }

        if (jsonSchema.required && jsonSchema.required.includes(key)) {
            zodSchema[key] = zodProp;
        } else {
            zodSchema[key] = zodProp.optional();
        }
    }

    return z.object(zodSchema);
}
