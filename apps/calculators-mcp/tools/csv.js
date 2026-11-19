import { z } from "zod";

// A CSV reader that follows RFC 4180 rather than splitting on commas, because the point of the
// format is the parts a split gets wrong: a quoted field may contain the delimiter and a line
// break, and a doubled quote inside a quoted field is one literal quote.
//
// The parser is a single pass with an explicit `inQuotes` state, so a field that spans several
// lines is read as one field instead of several broken records.
const MAX_ROWS = 5000;
const MAX_FIELDS = 200;

function parse(text, delimiter) {
    // A UTF-8 BOM is an encoding marker, not part of the first column name.
    if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);

    const rows = [];
    let row = [];
    let field = "";
    let inQuotes = false;
    // Set as soon as the record holds anything, so an empty quoted field ("") is a record
    // while a blank line is not.
    let recordStarted = false;
    let quoteLine = 1;
    let index = 0;
    let line = 1;

    const endField = () => {
        row.push(field);
        field = "";
        if (row.length > MAX_FIELDS)
            throw new Error(
                `a record has more than ${MAX_FIELDS} fields, at line ${line}.`,
            );
    };
    const endRow = () => {
        // A blank line is not a record; keeping it would turn a separating or trailing
        // blank line into a phantom row.
        if (recordStarted || row.length > 0 || field !== "") {
            endField();
            rows.push(row);
            if (rows.length > MAX_ROWS)
                throw new Error(`more than ${MAX_ROWS} records.`);
        }
        row = [];
        recordStarted = false;
    };

    while (index < text.length) {
        const character = text[index];

        if (inQuotes) {
            if (character === '"') {
                // Two quotes in a row are one literal quote; a single one closes the field.
                if (text[index + 1] === '"') {
                    field += '"';
                    index += 2;
                    continue;
                }
                inQuotes = false;
                index += 1;
                continue;
            }
            if (character === "\n") line += 1;
            field += character;
            index += 1;
            continue;
        }

        // A quote only opens a quoted field at its start; in the middle it is a literal.
        if (character === '"' && field === "") {
            inQuotes = true;
            recordStarted = true;
            quoteLine = line;
            index += 1;
            continue;
        }
        if (character === delimiter) {
            recordStarted = true;
            endField();
            index += 1;
            continue;
        }
        if (character === "\n" || character === "\r") {
            if (character === "\r" && text[index + 1] === "\n") index += 1;
            endRow();
            line += 1;
            index += 1;
            continue;
        }
        recordStarted = true;
        field += character;
        index += 1;
    }

    if (inQuotes)
        throw new Error(
            `a quoted field opened at line ${quoteLine} is never closed.`,
        );
    // A trailing line break ends the last record; it does not start an empty one.
    if (recordStarted || field !== "" || row.length > 0) endRow();
    return rows;
}

export const csvTools = [
    [
        "parse_csv",
        'Parse comma-separated text into fields, following RFC 4180 rather than splitting on commas. A quoted field may contain the delimiter and line breaks, and a doubled quote inside a quoted field is one literal quote, so records such as `"Smith, John",42` and a multi-line address stay intact. Returns the column names from the first record, every remaining record, and how many there are. Set header to false when the first record is data.',
        {
            text: z
                .string()
                .min(1)
                .max(100000)
                .describe(
                    "The CSV text to parse, with or without a trailing newline.",
                ),
            separator: z
                .string()
                .length(1)
                .default(",")
                .describe('Field separator, one character. Use "\\t" for TSV.'),
            header: z
                .boolean()
                .default(true)
                .describe(
                    "Treat the first record as column names. Set false to keep it as data.",
                ),
        },
        ({ text, separator, header }) => {
            // The zod schema already caps the text length, so there is no second check here:
            // a guard the schema makes unreachable is dead code.
            const rows = parse(text, separator);
            if (rows.length === 0) throw new Error("the text has no records.");
            const columns = header ? rows[0] : [];
            const records = header ? rows.slice(1) : rows;
            return {
                columns,
                rows: records,
                rowCount: records.length,
            };
        },
    ],
];
