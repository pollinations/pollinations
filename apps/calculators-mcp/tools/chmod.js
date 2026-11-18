import { z } from "zod";

const PERM_BITS = { r: 4, w: 2, x: 1 };

function parseOctal(text, label) {
    const match = /^(?:0o)?([0-7]{3,4})$/i.exec(text);
    if (!match)
        throw new Error(
            `${label} expects 3 or 4 octal digits, got ${JSON.stringify(text)}.`,
        );
    return Number.parseInt(match[1], 8);
}

// In ls-style permission strings, uppercase S/T marks setuid, setgid, or sticky without the
// underlying execute bit, while lowercase s/t means both are set.
function parseTriplet(slice, specialChar, specialBit) {
    const [r, w, x] = slice;
    if (r !== "r" && r !== "-") return null;
    if (w !== "w" && w !== "-") return null;
    let bits = (r === "r" ? 4 : 0) | (w === "w" ? 2 : 0);
    if (x === "x") bits |= 1;
    else if (x === specialChar) bits |= 1 | specialBit;
    else if (x === specialChar.toUpperCase()) bits |= specialBit;
    else if (x !== "-") return null;
    return bits;
}

function parseLsString(text) {
    // Strip the leading file-type indicator (-, d, l, c, b, p, s) when given a 10-char mode.
    const body =
        text.length === 10 && /^[-dlcbps]/.test(text) ? text.slice(1) : text;
    if (body.length !== 9) return null;
    const owner = parseTriplet(body.slice(0, 3), "s", 0o4000);
    const group = parseTriplet(body.slice(3, 6), "s", 0o2000);
    const other = parseTriplet(body.slice(6, 9), "t", 0o1000);
    if (owner === null || group === null || other === null) return null;
    const special = (owner & 0o4000) | (group & 0o2000) | (other & 0o1000);
    return special | ((owner & 7) << 6) | ((group & 7) << 3) | (other & 7);
}

function applyClauses(text, base) {
    const clauses = text.split(",");
    let bits = base ?? 0;
    for (const rawClause of clauses) {
        const clause = rawClause.trim();
        const match = /^([ugoa]*)([+=-])([rwxst]*)$/.exec(clause);
        if (!match)
            throw new Error(
                `Invalid permission mode: ${JSON.stringify(text)}.`,
            );
        const [, rawWho, op, perms] = match;
        if ((op === "+" || op === "-") && base === null)
            throw new Error(
                `Relative operator ${JSON.stringify(op)} in ${JSON.stringify(text)} requires a base mode.`,
            );

        const who = rawWho === "" || rawWho.includes("a") ? "ugo" : rawWho;
        if (perms.includes("t") && !who.includes("o"))
            throw new Error(
                `Sticky bit (t) only applies to other/all in ${JSON.stringify(clause)}.`,
            );

        let rwxMask = 0;
        for (const ch of perms) {
            if (ch in PERM_BITS) rwxMask |= PERM_BITS[ch];
        }

        let targetMask = 0;
        if (who.includes("u")) targetMask |= rwxMask << 6;
        if (who.includes("g")) targetMask |= rwxMask << 3;
        if (who.includes("o")) targetMask |= rwxMask;
        if (perms.includes("s")) {
            if (who.includes("u")) targetMask |= 0o4000;
            if (who.includes("g")) targetMask |= 0o2000;
        }
        if (perms.includes("t") && who.includes("o")) targetMask |= 0o1000;

        if (op === "+") {
            bits |= targetMask;
        } else if (op === "-") {
            bits &= ~targetMask;
        } else {
            let clearMask = 0;
            if (who.includes("u")) clearMask |= 0o4700;
            if (who.includes("g")) clearMask |= 0o2070;
            if (who.includes("o")) clearMask |= 0o1007;
            bits = (bits & ~clearMask) | targetMask;
        }
    }
    return bits & 0o7777;
}

function parseMode(raw, baseBits = null) {
    const text = raw.trim();
    if (/^(?:0o)?[0-7]{3,4}$/i.test(text)) return parseOctal(text, "mode");
    const lsBits = parseLsString(text);
    if (lsBits !== null) return lsBits;
    return applyClauses(text, baseBits);
}

function formatTriplet(val, specialBit, specialChar) {
    const r = val & 4 ? "r" : "-";
    const w = val & 2 ? "w" : "-";
    let x = val & 1 ? "x" : "-";
    if (specialBit) x = val & 1 ? specialChar : specialChar.toUpperCase();
    return `${r}${w}${x}`;
}

function formatClassClause(val, hasSpecial, specialChar) {
    let out = "";
    if (val & 4) out += "r";
    if (val & 2) out += "w";
    if (val & 1) out += "x";
    if (hasSpecial) out += specialChar;
    return out;
}

function formatMode(bits) {
    const u = (bits >> 6) & 7;
    const g = (bits >> 3) & 7;
    const o = bits & 7;
    const setuid = Boolean(bits & 0o4000);
    const setgid = Boolean(bits & 0o2000);
    const sticky = Boolean(bits & 0o1000);

    const owner = formatTriplet(u, setuid, "s");
    const group = formatTriplet(g, setgid, "s");
    const other = formatTriplet(o, sticky, "t");
    const chmod = [
        `u=${formatClassClause(u, setuid, "s")}`,
        `g=${formatClassClause(g, setgid, "s")}`,
        `o=${formatClassClause(o, sticky, "t")}`,
    ].join(",");

    return {
        octal: bits.toString(8).padStart(4, "0"),
        symbolic: `${owner}${group}${other}`,
        chmod,
        special: { setuid, setgid, sticky },
        who: { owner, group, other },
    };
}

export const chmodTools = [
    [
        "chmod_permissions",
        "Convert and explain Unix file permissions between octal (755, 4755), ls symbolic notation (rwxr-xr-x, -rwsr-xr-t), and chmod clauses (u=rwx,go=rx or g+w,o-r with a base mode). Decodes setuid, setgid, and sticky bits and optionally applies an octal umask. Pure calculation, no network.",
        {
            mode: z
                .string()
                .trim()
                .min(1)
                .max(64)
                .describe(
                    "Octal mode (755, 4755), ls string (rwxr-xr-x, -rwsr-xr-t), or chmod clauses (u=rwx,go=rx or g+w).",
                ),
            base: z
                .string()
                .trim()
                .min(1)
                .max(64)
                .optional()
                .describe(
                    "Starting mode (such as 0644) when applying relative + or - clauses.",
                ),
            umask: z
                .string()
                .trim()
                .min(1)
                .max(8)
                .optional()
                .describe("Optional octal umask such as 022 or 0027."),
        },
        ({ mode, base, umask }) => {
            const baseBits = base === undefined ? null : parseMode(base);
            const bits = parseMode(mode, baseBits);
            const result = formatMode(bits);
            if (umask !== undefined) {
                const maskBits = parseOctal(umask, "umask");
                result.after_umask = formatMode(bits & ~maskBits & 0o7777);
            }
            return result;
        },
    ],
];
