import { z } from "zod";
import { readResponseText } from "../../../shared/response-bytes.ts";

// macvendors.com returns the OUI vendor as plain text (19 bytes for SanDisk),
// not JSON — so the body is read as text and trimmed, never JSON.parsed.
// Unknown, multicast and locally-administered addresses answer 404 with a
// JSON error body ({"errors":{"detail":"Not Found"}}), which becomes a named
// error instead of leaking the status or the JSON as a vendor name.
export async function lookupVendor(
    address,
    signal = AbortSignal.timeout(10000),
) {
    const cleaned = address.trim();
    const hexOnly = cleaned.replace(/[:.-]/g, "");
    if (!/^[0-9a-fA-F]{12}$/.test(hexOnly)) {
        throw new Error(
            "Invalid MAC address: must be 12 hex characters (e.g. 00:1A:2B:3C:4D:5E or 001a.2b3c.4d5e)",
        );
    }
    const normalizedHex = hexOnly.toLowerCase();
    const bytes = [];
    for (let i = 0; i < 12; i += 2) bytes.push(normalizedHex.slice(i, i + 2));
    const mac = bytes.join(":");
    const response = await fetch(`https://api.macvendors.com/${mac}`, {
        redirect: "follow",
        signal,
    });
    if (!response.ok) {
        const detail = await readErrorDetail(response);
        throw new Error(
            `No vendor found for MAC ${mac}${detail ? `: ${detail}` : ""} (macvendors.com returned HTTP ${response.status})`,
        );
    }
    const vendor = (
        await readResponseText(
            response,
            4096,
            () => new Error("Vendor response exceeds 4 KiB"),
        )
    ).trim();
    if (!vendor) throw new Error(`No vendor found for MAC ${mac}`);
    return { mac, vendor };
}

async function readErrorDetail(response) {
    try {
        const parsed = JSON.parse(
            await readResponseText(
                response,
                4096,
                () => new Error("Error response exceeds 4 KiB"),
            ),
        );
        return typeof parsed?.errors?.detail === "string"
            ? parsed.errors.detail
            : null;
    } catch {
        return null;
    }
}

export const macvendorTools = [
    [
        "mac_vendor",
        "Look up the manufacturer (OUI vendor) for a MAC address via macvendors.com. Returns the vendor name for the address's OUI prefix. One fetch, plain-text response. The lookup companion to inspect_mac, which only parses locally and never fetches. No caller credentials are sent.",
        {
            address: z
                .string()
                .trim()
                .min(1)
                .max(50)
                .describe(
                    "MAC address in colon, hyphen, dot, or raw hex format",
                ),
        },
        ({ address }) => lookupVendor(address),
    ],
];
