import { parse } from "csv-parse/sync";
import { z } from "zod";

export const InspectSchema = z
    .object({
        csv: z.string().min(1).max(131072),
        delimiter: z.enum(["auto", ",", ";", "\t", "|"]).default("auto"),
        header: z.boolean().default(true),
    })
    .strict();

function records(csv, delimiter) {
    return parse(csv, {
        delimiter,
        bom: true,
        skip_empty_lines: true,
        relax_column_count: true,
        max_record_size: 131072,
    });
}

export function inspectCsv(input) {
    const { csv, delimiter, header } = InspectSchema.parse(input);
    if (new TextEncoder().encode(csv).length > 131072)
        throw new Error("CSV exceeds 128 KiB.");
    let selected = delimiter;
    let rows;
    if (delimiter === "auto") {
        const candidates = [];
        for (const candidate of [",", ";", "\t", "|"]) {
            try {
                const parsed = records(csv, candidate);
                const width = parsed[0]?.length ?? 0;
                if (width > 1)
                    candidates.push({
                        delimiter: candidate,
                        rows: parsed,
                        score:
                            parsed.filter((row) => row.length === width)
                                .length / parsed.length,
                    });
            } catch {
                /* A delimiter inside quoted data may not parse as a separator. */
            }
        }
        candidates.sort((a, b) => b.score - a.score);
        if (
            candidates.length > 1 &&
            candidates[0].score === candidates[1].score
        ) {
            throw new Error(
                "Ambiguous delimiter; specify comma, semicolon, tab or pipe explicitly.",
            );
        }
        selected = candidates[0]?.delimiter ?? ",";
        rows = candidates[0]?.rows;
    }
    try {
        rows ??= records(csv, selected);
    } catch (error) {
        throw new Error(`Malformed CSV (${error.code ?? "parse_error"}).`);
    }
    if (!rows.length) throw new Error("CSV has no non-empty records.");
    if (rows.length > 10001 || rows.some((row) => row.length > 200)) {
        throw new Error("CSV exceeds 10,000 data rows or 200 columns.");
    }
    const headings = header
        ? rows.shift()
        : rows[0].map((_, index) => `column_${index + 1}`);
    if (rows.length > 10000) throw new Error("CSV exceeds 10,000 data rows.");
    const irregular = rows.flatMap((row, index) =>
        row.length === headings.length ? [] : [index + 1],
    );
    const seen = new Set();
    const duplicateHeaders = [];
    const columns = headings.map((name, index) => {
        if (header && seen.has(name)) duplicateHeaders.push(index + 1);
        seen.add(name);
        let empty = 0;
        let missing = 0;
        let numericLooking = 0;
        let min = null;
        let max = null;
        for (const row of rows) {
            if (index >= row.length) {
                missing++;
                continue;
            }
            const value = row[index].trim();
            if (!value) {
                empty++;
                continue;
            }
            if (
                /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(value) &&
                Number.isFinite(Number(value))
            ) {
                numericLooking++;
                min =
                    min === null ? Number(value) : Math.min(min, Number(value));
                max =
                    max === null ? Number(value) : Math.max(max, Number(value));
            }
        }
        return {
            index: index + 1,
            name: name.slice(0, 200),
            empty,
            missing,
            numericLooking,
            min,
            max,
        };
    });
    return {
        delimiter: selected,
        header,
        rowCount: rows.length,
        columnCount: headings.length,
        irregularRowCount: irregular.length,
        irregularDataRows: irregular.slice(0, 100),
        irregularRowsTruncated: irregular.length > 100,
        duplicateHeaderColumns: duplicateHeaders,
        columns,
        preview: rows
            .slice(0, 5)
            .map((row) => row.slice(0, 20).map((value) => value.slice(0, 200))),
        previewLimits: { rows: 5, columns: 20, charactersPerCell: 200 },
    };
}
