import { z } from "zod";
import { fetchJson } from "../fetch.js";

// The SPDX License List changes a few times a year; keep one copy per isolate.
const LIST_URL = "https://spdx.org/licenses/licenses.json";
const TTL_MS = 24 * 60 * 60 * 1000;
let cached;

async function licenseList() {
    if (!cached || Date.now() - cached.at > TTL_MS)
        cached = { at: Date.now(), list: await fetchJson(LIST_URL) };
    return cached.list;
}

export async function checkLicenses({ expression }) {
    const tokens = expression.split(/[\s()]+/).filter(Boolean);
    const ids = [];
    const exceptions = [];
    for (let i = 0; i < tokens.length; i++) {
        const token = tokens[i];
        if (/^(AND|OR)$/i.test(token)) continue;
        if (/^WITH$/i.test(token)) {
            if (tokens[i + 1]) exceptions.push(tokens[++i]);
            continue;
        }
        ids.push(token);
    }
    const list = await licenseList();
    const byId = new Map(
        list.licenses.map((l) => [l.licenseId.toLowerCase(), l]),
    );
    const licenses = [];
    const unknown = [];
    const unique = new Map(ids.map((id) => [id.toLowerCase(), id]));
    for (const [key, id] of unique) {
        // `ID+` means "or later"; some deprecated IDs such as GPL-2.0+ are listed as-is.
        const license = byId.get(key) ?? byId.get(key.replace(/\+$/, ""));
        if (!license) {
            unknown.push(id);
            continue;
        }
        licenses.push({
            id: license.licenseId,
            name: license.name,
            osiApproved: license.isOsiApproved,
            fsfLibre: license.isFsfLibre ?? false,
            deprecated: license.isDeprecatedLicenseId,
            reference: license.reference,
            seeAlso: license.seeAlso,
        });
    }
    return {
        licenseListVersion: list.licenseListVersion,
        licenses,
        exceptions,
        unknown,
    };
}

export const spdxTools = [
    [
        "spdx_license",
        "Check license identifiers or an SPDX license expression (`MIT`, `MIT OR Apache-2.0`, `GPL-2.0-or-later WITH Classpath-exception-2.0`) against the official SPDX License List. For each license returns its canonical ID, full name, whether it is OSI-approved, FSF free/libre and deprecated, and reference links. IDs not on the list come back in `unknown`; `WITH` exceptions are listed but not checked. Not legal advice and not a compatibility analysis.",
        {
            expression: z
                .string()
                .trim()
                .min(1)
                .max(500)
                .describe(
                    "SPDX ID or expression, e.g. a package's `license` field",
                ),
        },
        checkLicenses,
    ],
];
