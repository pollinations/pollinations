import ipaddr from "ipaddr.js";
import { z } from "zod";
import { validAddress } from "./cidr.js";

export function parseAndAnalyzeUrl(rawUrl) {
    if (
        typeof rawUrl !== "string" ||
        rawUrl.length === 0 ||
        rawUrl.length > 2048
    ) {
        throw new Error(
            "URL must be a non-empty string of at most 2048 characters",
        );
    }

    let parsed;
    try {
        parsed = new URL(rawUrl);
    } catch {
        throw new Error("Invalid URL format");
    }

    const hostname = parsed.hostname;
    let isIp = false;
    let ipVersion = null;
    let isPrivate = false;

    // Check if hostname is an IPv4 or IPv6
    // Standard URL parser leaves IPv6 enclosed in brackets, e.g. [::1]
    const cleanHost =
        hostname.startsWith("[") && hostname.endsWith("]")
            ? hostname.slice(1, -1)
            : hostname;

    if (validAddress(cleanHost)) {
        isIp = true;
        try {
            const parsedIp = ipaddr.parse(cleanHost);
            ipVersion = parsedIp.kind() === "ipv4" ? 4 : 6;
            const range = parsedIp.range();
            isPrivate = [
                "private",
                "loopback",
                "linkLocal",
                "uniqueLocal",
                "carrierGradeNat",
                "broadcast",
                "reserved",
                "unspecified",
            ].includes(range);
        } catch {
            isIp = false;
        }
    } else if (
        hostname === "localhost" ||
        hostname.endsWith(".localhost") ||
        hostname.endsWith(".local") ||
        hostname.endsWith(".internal")
    ) {
        isPrivate = true;
    }

    const queryParams = {};
    for (const [key, value] of parsed.searchParams.entries()) {
        if (key in queryParams) {
            if (Array.isArray(queryParams[key])) {
                queryParams[key].push(value);
            } else {
                queryParams[key] = [queryParams[key], value];
            }
        } else {
            queryParams[key] = value;
        }
    }

    const defaultPorts = {
        "http:": 80,
        "https:": 443,
        "ws:": 80,
        "wss:": 443,
        "ftp:": 21,
        "ssh:": 22,
    };

    const protocol = parsed.protocol;
    const port = parsed.port
        ? Number.parseInt(parsed.port, 10)
        : (defaultPorts[protocol] ?? null);

    return {
        href: parsed.href,
        protocol: protocol.replace(/:$/, ""),
        origin: parsed.origin !== "null" ? parsed.origin : null,
        hostname,
        port,
        pathname: parsed.pathname,
        search: parsed.search,
        hash: parsed.hash,
        username: parsed.username || null,
        password: parsed.password || null,
        query_params: queryParams,
        is_ip: isIp,
        ip_version: ipVersion,
        is_private: isPrivate,
    };
}

export const urlTools = [
    [
        "parse_url",
        "Parse, decompose, and inspect a URL (extract components, query params, port defaults, and classify IP/hostname and local/private network ranges).",
        {
            url: z
                .string()
                .min(1)
                .max(2048)
                .describe("URL to parse and inspect"),
        },
        ({ url }) => parseAndAnalyzeUrl(url),
    ],
];
