import { z } from "zod";
import { readResponseText } from "../../../shared/response-bytes.ts";

// OpenIBAN is a directory lookup, not a checksum: it knows which bank an IBAN
// belongs to. check_digit already validates IBANs by mod-97 arithmetic with no
// network, and returns the right check digits when they are wrong — arithmetic
// can say whether the digits are right, but only a directory can say the bank
// name, BIC and city. That is the whole gap this tool fills, and nothing more.

const USER_AGENT = "openiban-mcp/0.1 (https://pollinations.ai)";

// Same shape check_digit uses: two letters, two check digits, then 11 to 30
// letters or digits. Spaces and hyphens are formatting, not data.
const IBAN_SHAPE = /^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/;

function normalise(raw) {
    return raw.replace(/[\s-]/g, "").toUpperCase();
}

function bankField(value) {
    return typeof value === "string" && value.length > 0 ? value : null;
}

async function validateIban(iban) {
    const response = await fetch(
        `https://openiban.com/validate/${iban}?getBIC=true`,
        {
            headers: {
                "User-Agent": USER_AGENT,
                Accept: "application/json",
            },
            signal: AbortSignal.timeout(10000),
            redirect: "follow",
        },
    );
    try {
        if (!response.ok)
            throw new Error(`OpenIBAN answered HTTP ${response.status}`);
        return JSON.parse(
            await readResponseText(
                response,
                512 * 1024,
                () =>
                    new Error(
                        "OpenIBAN response exceeds 512 KiB; the IBAN is not the problem, the directory is.",
                    ),
            ),
        );
    } finally {
        await response.body?.cancel();
    }
}

export const openibanTools = [
    [
        "iban_validate",
        "Validate an IBAN against the OpenIBAN directory and, when the directory knows the bank, return its name, BIC and city. This is the lookup complement to check_digit, which already validates the same IBANs by mod-97 arithmetic with no network: arithmetic can say whether the check digits are right, but only a directory can say which bank the IBAN belongs to. Bank details are only available for some countries and banks — a valid GB IBAN, for example, comes back with no bank data at all.",
        {
            iban: z
                .string()
                .min(1)
                .max(40)
                .describe(
                    'The IBAN, such as "DE89370400440532013000" or "GB29 NWBK 6016 1331 9268 19". Spaces and hyphens are ignored.',
                ),
        },
        async ({ iban }) => {
            const value = normalise(iban);
            if (!IBAN_SHAPE.test(value))
                throw new Error(
                    "an IBAN is two letters, two check digits, then 11 to 30 letters or digits.",
                );
            const found = await validateIban(value);
            if (typeof found !== "object" || found === null)
                throw new Error("OpenIBAN answered without a result.");
            const bank = found.bankData ?? {};
            return {
                valid: found.valid === true,
                iban: typeof found.iban === "string" ? found.iban : value,
                bank_name: bankField(bank.name),
                bic: bankField(bank.bic),
                city: bankField(bank.city),
            };
        },
    ],
];
