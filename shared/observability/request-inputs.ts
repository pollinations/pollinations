import type { Context } from "hono";

export type RequestInputs = {
    params?: Record<string, string>;
    query?: Record<string, string | string[]>;
    body?: unknown;
};

const BODY_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export async function collectRequestInputs(c: Context): Promise<RequestInputs> {
    const inputs: RequestInputs = {
        params: removeEmptyRecord(c.req.param()),
        query: removeEmptyRecord(queryParams(c)),
    };

    const body = await requestBody(c);
    if (body !== undefined) {
        inputs.body = body;
    }

    return removeUndefined(inputs);
}

export function stringifyRequestInputs(inputs: RequestInputs | undefined) {
    try {
        return JSON.stringify(inputs ?? {});
    } catch (error) {
        return JSON.stringify({
            error: "request_inputs_json_stringify_failed",
            message: error instanceof Error ? error.message : String(error),
        });
    }
}

async function requestBody(c: Context): Promise<unknown> {
    if (!BODY_METHODS.has(c.req.method)) return undefined;

    const contentType = c.req.header("content-type") || "";
    if (!contentType) return undefined;

    try {
        if (contentType.includes("json")) {
            return await c.req.json();
        }

        if (
            contentType.includes("multipart/form-data") ||
            contentType.includes("application/x-www-form-urlencoded")
        ) {
            return formDataToObject(await c.req.formData());
        }

        const text = await c.req.text();
        return text || undefined;
    } catch (error) {
        return {
            error: "request_body_unavailable",
            message: error instanceof Error ? error.message : String(error),
        };
    }
}

function queryParams(c: Context): Record<string, string | string[]> {
    return Object.fromEntries(
        Object.entries(c.req.queries()).map(([key, values]) => [
            key,
            values.length === 1 ? values[0] : values,
        ]),
    );
}

function formDataToObject(formData: FormData): Record<string, unknown> {
    const result: Record<string, unknown> = {};

    for (const [key, value] of formData.entries()) {
        const serialized =
            value instanceof File
                ? {
                      name: value.name,
                      size: value.size,
                      type: value.type,
                  }
                : value;

        const existing = result[key];
        if (existing === undefined) {
            result[key] = serialized;
        } else if (Array.isArray(existing)) {
            existing.push(serialized);
        } else {
            result[key] = [existing, serialized];
        }
    }

    return result;
}

function removeEmptyRecord<T extends Record<string, unknown>>(
    record: T,
): T | undefined {
    return Object.keys(record).length ? record : undefined;
}

function removeUndefined<T extends Record<string, unknown>>(record: T): T {
    return Object.fromEntries(
        Object.entries(record).filter(([, value]) => value !== undefined),
    ) as T;
}
