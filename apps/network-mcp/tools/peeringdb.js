import { z } from "zod";
import { readResponseText } from "../../../shared/response-bytes.ts";

// PeeringDB network record: who runs an autonomous system, where it peers and
// what its policy is. No key; the endpoint answers in ~1 s at ~1.8 KB.
// Looking glass / route server are empty strings for most networks, so they
// map to null; the notes field is deliberately not returned (it is long and
// mostly contact boilerplate).
async function lookup(asn) {
    const url = `https://www.peeringdb.com/api/net?asn=${asn}`;
    const response = await fetch(url, {
        headers: {
            Accept: "application/json",
            "User-Agent": "Pollinations-Network/0.1 (hello@pollinations.ai)",
        },
        redirect: "follow",
        signal: AbortSignal.timeout(10000),
    });
    try {
        if (!response.ok)
            throw new Error(
                `PeeringDB returned HTTP ${response.status}${response.status === 404 ? `: no network found for AS${asn}` : ""}`,
            );
        const body = JSON.parse(
            await readResponseText(
                response,
                65536,
                () => new Error("PeeringDB response exceeds 64 KiB"),
            ),
        );
        const record = (body.data ?? [])[0];
        if (!record)
            throw new Error(`PeeringDB: no network found for AS${asn}`);
        return record;
    } finally {
        await response.body?.cancel();
    }
}

export const peeringdbTools = [
    [
        "peeringdb_lookup",
        "Read the PeeringDB network record for an autonomous system number: operator name, website, looking glass, route server, IRR AS-SET, network type, announced prefix counts, exchange and facility counts, and peering policy. Unknown ASNs return a not-found error. No caller credentials are sent.",
        { asn: z.string().trim().min(1).max(10) },
        async ({ asn }) => {
            const digits = asn.replace(/^as/i, "");
            if (!/^\d+$/.test(digits) || Number(digits) > 4294967295)
                throw new Error(
                    "Use an autonomous system number like '15169' or 'AS15169' (0-4294967295).",
                );
            const d = await lookup(Number(digits));
            return {
                asn: d.asn,
                name: d.name ?? null,
                aka: d.aka || null,
                website: d.website || null,
                looking_glass: d.looking_glass || null,
                route_server: d.route_server || null,
                irr_as_set: d.irr_as_set || null,
                info_type: d.info_type || null,
                info_prefixes4: d.info_prefixes4 ?? null,
                info_prefixes6: d.info_prefixes6 ?? null,
                ix_count: d.ix_count ?? null,
                fac_count: d.fac_count ?? null,
                policy_general: d.policy_general || null,
            };
        },
    ],
];
