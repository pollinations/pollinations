import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { describe, parseCsv, queryRows } from "./csv.js";

const MAX_CSV_CHARS = 1_000_000;
const SAMPLE_ROWS = 3;

const inspectInput = z.object({
    csv: z
        .string()
        .max(MAX_CSV_CHARS)
        .describe("The CSV text itself, header row included."),
    delimiter: z
        .enum([",", ";", "\t", "|"])
        .optional()
        .describe("Field delimiter. Omit to sniff it from the first lines."),
    has_header: z
        .boolean()
        .optional()
        .describe("First row holds column names. Default true."),
});

const queryInput = z.object({
    csv: z.string().max(MAX_CSV_CHARS).describe("The CSV text itself."),
    delimiter: z.enum([",", ";", "\t", "|"]).optional(),
    has_header: z.boolean().optional(),
    select: z
        .array(z.string().max(120))
        .max(50)
        .optional()
        .describe("Columns to return, in order. Default: every column."),
    where: z
        .array(
            z.object({
                column: z.string().max(120),
                op: z.enum([
                    "eq",
                    "ne",
                    "gt",
                    "gte",
                    "lt",
                    "lte",
                    "contains",
                    "starts_with",
                    "ends_with",
                    "is_empty",
                    "not_empty",
                ]),
                value: z
                    .string()
                    .max(500)
                    .optional()
                    .describe(
                        "Value to compare with. Omit for is_empty and not_empty.",
                    ),
            }),
        )
        .max(20)
        .optional()
        .describe(
            "Filters, combined with AND. Numeric columns compare as numbers.",
        ),
    order_by: z
        .object({
            column: z.string().max(120),
            direction: z.enum(["asc", "desc"]).optional(),
        })
        .optional(),
    limit: z
        .number()
        .int()
        .min(1)
        .max(1000)
        .optional()
        .describe("Rows to return. Default 100, maximum 1000."),
    offset: z.number().int().min(0).optional(),
});

function readCsv({ csv, delimiter, has_header }) {
    if (csv.length > MAX_CSV_CHARS) {
        throw new Error(
            `csv is ${csv.length} characters; the limit is ${MAX_CSV_CHARS}. Split the file or query a slice.`,
        );
    }
    return {
        parsed: parseCsv(csv, { delimiter }),
        hasHeader: has_header ?? true,
    };
}

function buildServer() {
    const server = new McpServer(
        { name: "pollinations-csv-mcp", version: "0.1.0" },
        {
            instructions:
                "Read and query CSV without writing code. csv_inspect reports the delimiter, column types and a sample; csv_query filters, projects, sorts and pages rows. Both take the CSV text and return JSON. Quoted cells, escaped quotes and cells spanning lines are handled.",
            capabilities: { tools: {} },
        },
    );

    server.registerTool(
        "csv_inspect",
        {
            description:
                "Describe a CSV: the detected delimiter, row and column counts, each column's name, inferred type (integer, number, boolean, date, string, empty), empty count and distinct values, plus a few sample rows. Use it before csv_query so column names and types are known.",
            inputSchema: inspectInput,
        },
        async ({ csv, delimiter, has_header }) => {
            const { parsed, hasHeader } = readCsv({
                csv,
                delimiter,
                has_header,
            });
            const summary = describe(parsed.rows, { hasHeader });
            const body = hasHeader ? parsed.rows.slice(1) : parsed.rows;
            const names = summary.header;
            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify(
                            {
                                delimiter:
                                    parsed.delimiter === "\t"
                                        ? "\\t"
                                        : parsed.delimiter,
                                rows: summary.rowCount,
                                columns: summary.columns,
                                truncated: parsed.truncated,
                                sample: body
                                    .slice(0, SAMPLE_ROWS)
                                    .map((row) =>
                                        Object.fromEntries(
                                            names.map((name, index) => [
                                                name,
                                                row[index] ?? "",
                                            ]),
                                        ),
                                    ),
                            },
                            null,
                            2,
                        ),
                    },
                ],
            };
        },
    );

    server.registerTool(
        "csv_query",
        {
            description:
                "Filter, project, sort and page a CSV and return JSON rows. Filters combine with AND and compare numerically when both sides are numbers. Use csv_inspect first when the column names are unknown. Returns the matched count, the total row count and the selected rows.",
            inputSchema: queryInput,
        },
        async ({
            csv,
            delimiter,
            has_header,
            select,
            where,
            order_by,
            limit,
            offset,
        }) => {
            const { parsed, hasHeader } = readCsv({
                csv,
                delimiter,
                has_header,
            });
            const result = queryRows(parsed.rows, {
                hasHeader,
                select,
                where,
                order_by,
                limit,
                offset,
            });
            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify(result, null, 2),
                    },
                ],
            };
        },
    );

    return server;
}

const mcpHandler = createMcpHandler(() => buildServer(), {
    legacy: "stateless",
    onerror: (error) => console.error(error),
});

function readBearerToken(request) {
    const authorization = request.headers.get("authorization");
    if (!authorization) return null;
    const [scheme, token] = authorization.trim().split(/\s+/, 2);
    if (scheme?.toLowerCase() !== "bearer" || !token) return null;
    return token;
}

function unauthorizedResponse() {
    return Response.json(
        {
            error: "unauthorized",
            message: "Send a Pollinations API key as a bearer token.",
        },
        {
            status: 401,
            headers: {
                "WWW-Authenticate": 'Bearer realm="csv-mcp.pollinations.ai"',
            },
        },
    );
}

export default {
    async fetch(request) {
        const url = new URL(request.url);

        if (url.pathname === "/health" && request.method === "GET") {
            return Response.json({
                name: "csv-mcp",
                transport: "streamable-http",
                endpoint: "/",
                stateless: true,
            });
        }

        if (url.pathname !== "/") {
            return new Response("Not found", { status: 404 });
        }

        const token = readBearerToken(request);
        if (!token) return unauthorizedResponse();

        if (
            request.method === "POST" &&
            Array.isArray(
                await request
                    .clone()
                    .json()
                    .catch(() => null),
            )
        ) {
            return Response.json(
                {
                    error: "invalid_request",
                    message: "Batch requests are not supported.",
                },
                { status: 400 },
            );
        }

        return mcpHandler.fetch(request, {
            authInfo: { token, clientId: "pollinations-api-key", scopes: [] },
        });
    },
};
