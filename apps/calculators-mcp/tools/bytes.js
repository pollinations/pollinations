import { z } from "zod";

// SI symbols are powers of 1000; IEC symbols are powers of 1024. The spelling decides the
// meaning, so "1.5 MB" and "1.5 MiB" are different requests rather than one ambiguous one.
const SI = ["B", "kB", "MB", "GB", "TB", "PB", "EB"];
const IEC = ["B", "KiB", "MiB", "GiB", "TiB", "PiB", "EiB"];

function units(table) {
    const map = new Map();
    for (const [index, symbol] of table.entries()) {
        const scale = (table === SI ? 1000 : 1024) ** index;
        map.set(symbol.toLowerCase(), { symbol, scale });
    }
    return map;
}

const SI_UNITS = units(SI);
const IEC_UNITS = units(IEC);

function render(bytes, table) {
    if (bytes === 0) return "0 B";
    const step = table === SI ? 1000 : 1024;
    let index = 0;
    let value = bytes;
    while (value >= step && index < table.length - 1) {
        value /= step;
        index += 1;
    }
    // Two decimals, then drop the padding: "1.5 kB" reads better than "1.500 kB".
    const shown = (Math.round(value * 100) / 100).toString();
    return `${shown} ${table[index]}`;
}

function parse(text) {
    const match = /^\s*(-?\d+(?:\.\d+)?)\s*([A-Za-z]+)\s*$/.exec(text);
    if (!match)
        throw new Error(
            `text ${JSON.stringify(text)} is not a value and a unit, such as "1.5 MiB".`,
        );
    const [, amount, symbol] = match;
    const found =
        SI_UNITS.get(symbol.toLowerCase()) ??
        IEC_UNITS.get(symbol.toLowerCase());
    // A bare "K" or "M" has no standard byte meaning, so it is refused rather than guessed.
    if (!found)
        throw new Error(
            `unit ${JSON.stringify(symbol)} is not a byte unit. Use SI (kB, MB, GB) or IEC (KiB, MiB, GiB).`,
        );
    const value = Number(amount) * found.scale;
    if (!Number.isFinite(value) || !Number.isInteger(value))
        throw new Error(
            `${JSON.stringify(text)} is not a whole number of bytes.`,
        );
    if (value < 0) throw new Error("byte counts cannot be negative.");
    if (value > Number.MAX_SAFE_INTEGER)
        throw new Error(
            `${JSON.stringify(text)} exceeds the exact integer range.`,
        );
    return { bytes: value, unit: found.symbol };
}

export const byteTools = [
    [
        "convert_bytes",
        'Convert byte sizes both ways: give a number of bytes to get it rendered, or give text such as "1.5 MiB" to get the exact byte count. SI symbols (kB, MB, GB) are powers of 1000 and IEC symbols (KiB, MiB, GiB) are powers of 1024, so the spelling decides the meaning. Provide exactly one of bytes or text.',
        {
            bytes: z
                .number()
                .int()
                .min(0)
                .max(Number.MAX_SAFE_INTEGER)
                .optional()
                .describe("A whole number of bytes to render in both scales."),
            text: z
                .string()
                .min(2)
                .max(64)
                .optional()
                .describe(
                    'A size such as "1.5 MiB", "900 kB" or "0 B", read by its unit suffix.',
                ),
        },
        ({ bytes, text }) => {
            if ((bytes === undefined) === (text === undefined))
                throw new Error("Provide exactly one of bytes or text.");
            if (text !== undefined) {
                const parsed = parse(text);
                return {
                    bytes: parsed.bytes,
                    parsed_unit: parsed.unit,
                    si: render(parsed.bytes, SI),
                    iec: render(parsed.bytes, IEC),
                };
            }
            return {
                bytes,
                parsed_unit: null,
                si: render(bytes, SI),
                iec: render(bytes, IEC),
            };
        },
    ],
];
