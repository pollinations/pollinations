import { z } from "zod";

const API_ROOT = "https://comtradeapi.un.org/public/v1/preview/C/A/HS";

// The preview tier strips every description from the response (reporterDesc,
// flowDesc, partnerDesc and cmdDesc all come back null), so the tool resolves
// names itself from this table of major trading nations (UN M49 codes). Every
// code below was verified live: each one returns data for 2023 imports. A
// reporter or partner not in the table must be passed as its M49 numeric
// code, e.g. 842 for the United States.
const REPORTERS = [
    [842, "United States", "usa", "us"],
    [156, "China"],
    [276, "Germany"],
    [392, "Japan"],
    [826, "United Kingdom", "uk", "great britain"],
    [250, "France"],
    [528, "Netherlands"],
    [356, "India"],
    [410, "South Korea", "korea", "republic of korea"],
    [124, "Canada"],
    [380, "Italy"],
    [484, "Mexico"],
    [756, "Switzerland"],
    [724, "Spain"],
    [56, "Belgium"],
    [702, "Singapore"],
    [784, "United Arab Emirates", "uae"],
    [76, "Brazil"],
    [36, "Australia"],
    [704, "Vietnam", "viet nam"],
    [616, "Poland"],
    [792, "Türkiye", "turkey"],
    [764, "Thailand"],
    [360, "Indonesia"],
];

const byName = new Map();
const byCode = new Map();
for (const [code, name, ...aliases] of REPORTERS) {
    byCode.set(code, name);
    byName.set(name.toLowerCase(), code);
    for (const alias of aliases) byName.set(alias, code);
}

function resolveCode(value, label) {
    const raw = String(value ?? "").trim();
    if (!raw) throw new Error(`Provide a ${label}.`);
    if (/^\d{1,3}$/.test(raw)) {
        const code = Number(raw);
        if (code >= 1 && code <= 999) return code;
        throw new Error(`Invalid ${label} code "${raw}".`);
    }
    const code = byName.get(raw.toLowerCase());
    if (code === undefined)
        throw new Error(
            `Unknown ${label} "${raw}": use an M49 numeric code (e.g. 842 for the United States) or a supported country name.`,
        );
    return code;
}

const codeInput = z.union([z.string(), z.number()]);

function formatRecord(row, reporterCode, partnerCode, year, flowCode, cmd) {
    return {
        reporter: reporterCode,
        reporter_name: byCode.get(reporterCode) ?? null,
        partner: partnerCode,
        partner_name:
            partnerCode === 0 ? "World" : (byCode.get(partnerCode) ?? null),
        period: year,
        flow: flowCode,
        flow_desc: flowCode === "M" ? "Imports" : "Exports",
        commodity: cmd,
        currency: "USD",
        cif_value: row.cifvalue ?? null,
        fob_value: row.fobvalue ?? null,
        primary_value: row.primaryValue ?? null,
        // TOTAL rows carry qty/netWgt of 0; only project them when the
        // commodity actually reports a quantity or weight.
        quantity: row.qty > 0 ? row.qty : null,
        net_weight_kg: row.netWgt > 0 ? row.netWgt : null,
    };
}

export const comtradeTools = [
    [
        "trade_stats",
        "Look up UN Comtrade trade statistics for one reporter, year, flow and commodity: total import or export value in USD (CIF for imports, FOB for exports), plus quantity and net weight when the commodity reports them. Reporter and partner take an M49 numeric code (e.g. 842) or a country name (e.g. 'United States'); the public preview tier needs no key. A year or reporter with no published data returns an empty list.",
        {
            reporter: codeInput.describe(
                "Reporting country: M49 numeric code (e.g. 842) or country name (e.g. 'United States')",
            ),
            period: codeInput.describe(
                "Year to report, e.g. 2023 (annual data, 1962-2100)",
            ),
            flow: z
                .string()
                .default("M")
                .describe(
                    "Trade flow: 'M' for imports (default) or 'X' for exports",
                ),
            cmdCode: z
                .string()
                .default("TOTAL")
                .describe(
                    "Commodity: 'TOTAL' for all goods (default) or an HS code of 2-6 digits (e.g. 8703 for motor cars)",
                ),
            partner: codeInput
                .default(0)
                .describe(
                    "Partner country: M49 numeric code or name, or 0 / 'world' for all partners (default)",
                ),
        },
        async ({ reporter, period, flow, cmdCode, partner }, fetchJson) => {
            const reporterCode = resolveCode(reporter, "reporter");
            const partnerRaw = String(partner ?? "0").trim();
            const partnerCode =
                partnerRaw === "0" || partnerRaw.toLowerCase() === "world"
                    ? 0
                    : resolveCode(partnerRaw, "partner");
            const year = String(period ?? "").trim();
            if (
                !/^\d{4}$/.test(year) ||
                Number(year) < 1962 ||
                Number(year) > 2100
            )
                throw new Error(
                    "Provide a period year between 1962 and 2100 (e.g. 2023).",
                );
            const flowCode = String(flow ?? "M")
                .trim()
                .toUpperCase();
            if (flowCode !== "M" && flowCode !== "X")
                throw new Error('Flow must be "M" (imports) or "X" (exports).');
            const cmd = String(cmdCode ?? "TOTAL")
                .trim()
                .toUpperCase();
            if (cmd !== "TOTAL" && !/^\d{2,6}$/.test(cmd))
                throw new Error(
                    'Commodity must be "TOTAL" or an HS code of 2-6 digits (e.g. 8703).',
                );
            const url = `${API_ROOT}?reporterCode=${reporterCode}&period=${year}&partnerCode=${partnerCode}&flowCode=${flowCode}&cmdCode=${cmd}`;
            const data = await fetchJson(url);
            if (!Array.isArray(data?.data))
                throw new Error("Unexpected response from UN Comtrade.");
            return {
                total: data.data.length,
                records: data.data.map((row) =>
                    formatRecord(
                        row,
                        reporterCode,
                        partnerCode,
                        year,
                        flowCode,
                        cmd,
                    ),
                ),
            };
        },
    ],
];
