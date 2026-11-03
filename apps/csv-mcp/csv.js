/**
 * CSV parsing and querying for agents.
 *
 * Agents are handed CSV far more often than they are given a database: an
 * export from a spreadsheet, a support ticket, a price list. Reading it
 * correctly means quotes, escaped quotes, semicolons and cells that contain the
 * delimiter or a newline. This module is one RFC 4180 reader, a delimiter
 * sniff, per-column type inference and a small, predictable query.
 */

const DELIMITERS = [",", ";", "\t", "|"];
const MAX_ROWS = 100_000;

export class CsvError extends Error {}

function countOutsideQuotes(line, delimiter) {
    let count = 0;
    let quoted = false;
    for (const character of line) {
        if (character === '"') quoted = !quoted;
        else if (character === delimiter && !quoted) count += 1;
    }
    return count;
}

/**
 * The delimiter that splits the most rows into the same number of fields.
 * Falls back to a comma when no candidate produces a table.
 */
export function sniffDelimiter(text) {
    const lines = text
        .slice(0, 20_000)
        .split(/\r?\n/)
        .filter((line) => line.length > 0);
    let best = ",";
    let bestScore = 0;
    for (const delimiter of DELIMITERS) {
        const counts = new Map();
        for (const line of lines) {
            const fields = countOutsideQuotes(line, delimiter) + 1;
            counts.set(fields, (counts.get(fields) ?? 0) + 1);
        }
        const [fields, hits] = [...counts.entries()].sort(
            (a, b) => b[1] - a[1],
        )[0] ?? [1, 0];
        const score = fields > 1 ? hits * fields : 0;
        if (score > bestScore) {
            best = delimiter;
            bestScore = score;
        }
    }
    return best;
}

/**
 * Parse CSV text into rows of strings, honouring quotes, doubled quotes and
 * cells that span lines.
 * @param {string} text
 * @param {{delimiter?: string, limit?: number}} [options]
 * @returns {{rows: string[][], delimiter: string, truncated: boolean}}
 */
export function parseCsv(text, { delimiter, limit = MAX_ROWS } = {}) {
    if (typeof text !== "string") throw new CsvError("csv must be text");
    const chosen = delimiter ?? sniffDelimiter(text);
    if (!DELIMITERS.includes(chosen)) {
        throw new CsvError(
            `Unsupported delimiter ${JSON.stringify(chosen)}. Use , ; tab or |.`,
        );
    }

    const rows = [];
    let row = [];
    let field = "";
    let quoted = false;
    let truncated = false;
    let index = 0;

    const endField = () => {
        row.push(field);
        field = "";
    };
    const endRow = () => {
        endField();
        rows.push(row);
        row = [];
    };

    while (index < text.length) {
        const character = text[index];

        if (quoted) {
            if (character === '"') {
                if (text[index + 1] === '"') {
                    field += '"';
                    index += 2;
                    continue;
                }
                quoted = false;
                index += 1;
                continue;
            }
            field += character;
            index += 1;
            continue;
        }

        if (character === '"' && field === "") {
            quoted = true;
            index += 1;
            continue;
        }
        if (character === chosen) {
            endField();
            index += 1;
            continue;
        }
        if (character === "\n" || character === "\r") {
            endRow();
            index += text[index] === "\r" && text[index + 1] === "\n" ? 2 : 1;
            if (rows.length >= limit) {
                truncated = true;
                break;
            }
            continue;
        }
        field += character;
        index += 1;
    }

    if (quoted) throw new CsvError("Unterminated quoted field.");
    if (!truncated && (field !== "" || row.length > 0)) endRow();

    // A trailing newline produces one empty row; drop it.
    while (
        rows.length &&
        rows[rows.length - 1].length === 1 &&
        rows[rows.length - 1][0] === ""
    ) {
        rows.pop();
    }
    if (rows.length === 0) throw new CsvError("No rows found in the CSV text.");

    return { rows, delimiter: chosen, truncated };
}

const INTEGER = /^[+-]?\d+$/;
const NUMBER = /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/;
const BOOLEAN = /^(true|false|yes|no)$/i;
const DATE = /^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2})?)?/;

export function inferType(values) {
    const present = values.filter((value) => value !== "");
    if (present.length === 0) return "empty";
    if (present.every((value) => INTEGER.test(value))) return "integer";
    if (present.every((value) => NUMBER.test(value))) return "number";
    if (present.every((value) => BOOLEAN.test(value))) return "boolean";
    if (present.every((value) => DATE.test(value))) return "date";
    return "string";
}

/**
 * @param {string[][]} rows
 * @param {{hasHeader?: boolean}} [options]
 */
export function describe(rows, { hasHeader = true } = {}) {
    const width = rows.reduce((max, row) => Math.max(max, row.length), 0);
    const header = hasHeader
        ? Array.from(
              { length: width },
              (_, column) => rows[0][column] ?? `column_${column + 1}`,
          )
        : Array.from({ length: width }, (_, column) => `column_${column + 1}`);
    const body = hasHeader ? rows.slice(1) : rows;

    const columns = header.map((name, column) => {
        const values = body.map((row) => row[column] ?? "");
        return {
            name,
            type: inferType(values),
            empty: values.filter((value) => value === "").length,
            distinct: new Set(values).size,
        };
    });

    return { header, columns, rowCount: body.length, width };
}

const OPERATORS = [
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
];

function asNumber(value) {
    const trimmed = String(value).trim();
    if (trimmed === "" || !NUMBER.test(trimmed)) return null;
    return Number(trimmed);
}

function compare(left, right) {
    const a = asNumber(left);
    const b = asNumber(right);
    if (a !== null && b !== null) return a - b;
    return String(left).localeCompare(String(right));
}

function matches(row, filter, index) {
    const value = row[index] ?? "";
    switch (filter.op) {
        case "eq":
            return value === String(filter.value ?? "");
        case "ne":
            return value !== String(filter.value ?? "");
        case "gt":
            return compare(value, filter.value) > 0;
        case "gte":
            return compare(value, filter.value) >= 0;
        case "lt":
            return compare(value, filter.value) < 0;
        case "lte":
            return compare(value, filter.value) <= 0;
        case "contains":
            return value
                .toLowerCase()
                .includes(String(filter.value ?? "").toLowerCase());
        case "starts_with":
            return value
                .toLowerCase()
                .startsWith(String(filter.value ?? "").toLowerCase());
        case "ends_with":
            return value
                .toLowerCase()
                .endsWith(String(filter.value ?? "").toLowerCase());
        case "is_empty":
            return value === "";
        case "not_empty":
            return value !== "";
        default:
            throw new CsvError(
                `Unknown operator ${JSON.stringify(filter.op)}. Use one of: ${OPERATORS.join(", ")}.`,
            );
    }
}

function uniqueNames(header) {
    const seen = new Map();
    return header.map((name) => {
        const count = seen.get(name) ?? 0;
        seen.set(name, count + 1);
        return count === 0 ? name : `${name}_${count + 1}`;
    });
}

/**
 * Filter, project, sort and page a parsed CSV.
 * @param {string[][]} rows
 * @param {object} options
 */
export function queryRows(
    rows,
    {
        hasHeader = true,
        select,
        where = [],
        order_by: orderBy,
        limit = 100,
        offset = 0,
    } = {},
) {
    const { header, rowCount } = describe(rows, { hasHeader });
    const names = uniqueNames(header);
    const body = hasHeader ? rows.slice(1) : rows;
    const indexOf = (column) => {
        const wanted = String(column).toLowerCase();
        const found = names.findIndex((name) => name.toLowerCase() === wanted);
        if (found === -1) {
            throw new CsvError(
                `Unknown column ${JSON.stringify(column)}. Columns: ${names.join(", ")}.`,
            );
        }
        return found;
    };

    let selected = names.map((_, index) => index);
    if (Array.isArray(select) && select.length > 0) {
        selected = select.map(indexOf);
    }

    let filtered = body;
    if (Array.isArray(where) && where.length > 0) {
        const filters = where.map((filter) => ({
            ...filter,
            at: indexOf(filter.column),
        }));
        filtered = filtered.filter((row) =>
            filters.every((filter) => matches(row, filter, filter.at)),
        );
    }

    if (orderBy?.column) {
        const at = indexOf(orderBy.column);
        const direction = orderBy.direction === "desc" ? -1 : 1;
        filtered = [...filtered].sort(
            (left, right) => direction * compare(left[at], right[at]),
        );
    }

    const start = Math.max(0, Number(offset) || 0);
    const size = Math.min(Math.max(1, Number(limit) || 100), 1000);
    const page = filtered.slice(start, start + size);

    return {
        columns: selected.map((index) => names[index]),
        rows: page.map((row) =>
            Object.fromEntries(
                selected.map((index) => [names[index], row[index] ?? ""]),
            ),
        ),
        matched: filtered.length,
        total: rowCount,
        returned: page.length,
        offset: start,
        limit: size,
    };
}

export { OPERATORS };
