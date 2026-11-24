import { z } from "zod";
import { readText } from "./dns.js";
import { publicUrl } from "./http.js";

const MAX_ROBOTS_BYTES = 512_000;
const MAX_REDIRECTS = 5;
const NOTE =
    "robots.txt is a crawler coordination protocol, not access authorization or a security boundary.";

export function parseRobots(text) {
    const groups = [];
    let agents = [],
        rules = [],
        hasRules = false;
    const finishGroup = () => {
        if (agents.length) groups.push({ agents, rules });
        agents = [];
        rules = [];
        hasRules = false;
    };

    for (const raw of text.split(/\r\n?|\n/)) {
        const line = raw.split("#", 1)[0].trim();
        if (!line) continue;
        const colon = line.indexOf(":");
        if (colon < 0) continue;
        const key = line.slice(0, colon).trim().toLowerCase();
        const value = line.slice(colon + 1).trim();
        if (key === "user-agent") {
            if (hasRules) finishGroup();
            if (value === "*" || /^[A-Za-z_-]+$/.test(value))
                agents.push(value);
        } else if (key === "allow" || key === "disallow") {
            if (agents.length) {
                hasRules = true;
                if (value.startsWith("/"))
                    rules.push({ directive: key, pattern: value });
            }
        }
    }
    finishGroup();
    return groups;
}

function normalizePath(value) {
    return encodeURI(value).replace(/%[\da-f]{2}/gi, (sequence) => {
        const byte = Number.parseInt(sequence.slice(1), 16);
        const char = String.fromCharCode(byte);
        return /[A-Za-z0-9._~-]/.test(char)
            ? char
            : `%${byte.toString(16).toUpperCase().padStart(2, "0")}`;
    });
}

function escapeRegex(value) {
    return value.replace(/[.+?^${}()|[\]\\]/g, "\\$&");
}

function matchesRule(pattern, path) {
    const normalized = normalizePath(pattern);
    const endAnchored = normalized.endsWith("$");
    const source = (endAnchored ? normalized.slice(0, -1) : normalized)
        .split("*")
        .map(escapeRegex)
        .join(".*");
    return new RegExp(`^${source}${endAnchored ? "$" : ""}`).test(path);
}

function specificity(pattern) {
    let value = normalizePath(pattern);
    if (value.endsWith("$")) value = value.slice(0, -1);
    let bytes = 0;
    for (let i = 0; i < value.length; ) {
        if (value[i] === "*") {
            i++;
        } else if (
            value[i] === "%" &&
            /^[\da-f]{2}$/i.test(value.slice(i + 1, i + 3))
        ) {
            bytes++;
            i += 3;
        } else {
            const point = value.codePointAt(i);
            const char = String.fromCodePoint(point);
            bytes += new TextEncoder().encode(char).length;
            i += char.length;
        }
    }
    return bytes;
}

export function evaluateRobots(groups, productToken, target) {
    const path = normalizePath(target.pathname + target.search);
    if (path === "/robots.txt")
        return {
            status: "no_matching_rule",
            allowed: true,
            applicable_rule: null,
            reason: "/robots.txt is implicitly allowed by the protocol.",
        };

    const token = productToken.toLowerCase();
    const matching = groups.filter((group) =>
        group.agents.some(
            (agent) => agent !== "*" && token.includes(agent.toLowerCase()),
        ),
    );
    const selected = matching.length
        ? matching
        : groups.filter((group) => group.agents.includes("*"));
    if (!selected.length)
        return {
            status: "no_applicable_group",
            allowed: true,
            applicable_rule: null,
            reason: "No matching crawler group or wildcard group was found.",
        };

    const matches = selected
        .flatMap((group) => group.rules)
        .filter((rule) => matchesRule(rule.pattern, path));
    if (!matches.length)
        return {
            status: "no_matching_rule",
            allowed: true,
            applicable_rule: null,
            reason: "No rule in the applicable crawler group matched this URL.",
        };

    const longest = Math.max(
        ...matches.map((rule) => specificity(rule.pattern)),
    );
    const tied = matches.filter(
        (rule) => specificity(rule.pattern) === longest,
    );
    const rule = tied.find((match) => match.directive === "allow") ?? tied[0];
    return {
        status: "matched_rule",
        allowed: rule.directive === "allow",
        applicable_rule: { directive: rule.directive, pattern: rule.pattern },
        reason: `The most specific matching rule is ${rule.directive}: ${rule.pattern}`,
    };
}

function result(
    target,
    productToken,
    robotsUrl,
    finalUrl,
    redirects,
    httpStatus,
    decision,
) {
    return {
        url: target.href,
        product_token: productToken,
        robots_url: robotsUrl.href,
        final_robots_url: finalUrl.href,
        http_status: httpStatus,
        redirects,
        ...decision,
        note: NOTE,
    };
}

export async function checkRobotsRules(value, productToken) {
    if (!/^[A-Za-z_-]{1,99}$/.test(productToken))
        throw new Error(
            "Product token must contain 1–99 letters, underscores, or hyphens",
        );
    const target = publicUrl(value);
    const robotsUrl = publicUrl(new URL("/robots.txt", target).href);
    const redirects = [];
    let current = robotsUrl;
    const signal = AbortSignal.timeout(10000);

    for (;;) {
        let response;
        try {
            response = await fetch(current, {
                headers: {
                    Accept: "text/plain",
                    "User-Agent": productToken,
                },
                redirect: "manual",
                signal,
            });
        } catch {
            return result(
                target,
                productToken,
                robotsUrl,
                current,
                redirects,
                null,
                {
                    status: "unreachable",
                    allowed: false,
                    applicable_rule: null,
                    reason: "The robots.txt fetch failed; RFC 9309 requires treating it as complete disallow.",
                },
            );
        }

        if ([301, 302, 303, 307, 308].includes(response.status)) {
            const location = response.headers.get("location");
            await response.body?.cancel();
            if (!location || redirects.length >= MAX_REDIRECTS)
                return result(
                    target,
                    productToken,
                    robotsUrl,
                    current,
                    redirects,
                    response.status,
                    {
                        status: "uncertain",
                        allowed: null,
                        applicable_rule: null,
                        reason: "The robots.txt redirect chain is incomplete or exceeds five redirects.",
                    },
                );
            let next;
            try {
                next = publicUrl(new URL(location, current).href);
            } catch {
                return result(
                    target,
                    productToken,
                    robotsUrl,
                    current,
                    redirects,
                    response.status,
                    {
                        status: "uncertain",
                        allowed: null,
                        applicable_rule: null,
                        reason: "The robots.txt redirect target failed public-URL safety validation.",
                    },
                );
            }
            redirects.push({
                from: current.href,
                status: response.status,
                to: next.href,
            });
            current = next;
            continue;
        }

        if (response.status >= 400 && response.status <= 499) {
            await response.body?.cancel();
            return result(
                target,
                productToken,
                robotsUrl,
                current,
                redirects,
                response.status,
                {
                    status: "unavailable",
                    allowed: true,
                    applicable_rule: null,
                    reason: `robots.txt returned HTTP ${response.status}; RFC 9309 treats 4xx as unavailable.`,
                },
            );
        }
        if (response.status >= 500 && response.status <= 599) {
            await response.body?.cancel();
            return result(
                target,
                productToken,
                robotsUrl,
                current,
                redirects,
                response.status,
                {
                    status: "unreachable",
                    allowed: false,
                    applicable_rule: null,
                    reason: `robots.txt returned HTTP ${response.status}; RFC 9309 requires treating 5xx as complete disallow.`,
                },
            );
        }
        if (!response.ok || response.status === 206) {
            await response.body?.cancel();
            return result(
                target,
                productToken,
                robotsUrl,
                current,
                redirects,
                response.status,
                {
                    status: "uncertain",
                    allowed: null,
                    applicable_rule: null,
                    reason: `Unexpected or partial robots.txt response: HTTP ${response.status}.`,
                },
            );
        }

        let body;
        try {
            body = await readText(response, MAX_ROBOTS_BYTES);
        } catch {
            return result(
                target,
                productToken,
                robotsUrl,
                current,
                redirects,
                response.status,
                {
                    status: "unreachable",
                    allowed: false,
                    applicable_rule: null,
                    reason: "Reading robots.txt failed; RFC 9309 requires treating an unreachable file as complete disallow.",
                },
            );
        }
        if (body.truncated)
            return result(
                target,
                productToken,
                robotsUrl,
                current,
                redirects,
                response.status,
                {
                    status: "uncertain",
                    allowed: null,
                    applicable_rule: null,
                    reason: "robots.txt exceeds the 500 KiB parsing limit, so a complete decision is uncertain.",
                },
            );

        return result(
            target,
            productToken,
            robotsUrl,
            current,
            redirects,
            response.status,
            evaluateRobots(parseRobots(body.text), productToken, target),
        );
    }
}

export const robotsTools = [
    [
        "check_robots_rules",
        "Check a public target URL against its site's robots.txt for a crawler product token. Combines matching groups, applies the longest matching rule, and prefers Allow on ties. Follows up to five safe redirects; 4xx is unavailable, while 5xx/network failure means complete disallow. Oversized or ambiguous responses return allowed=null. robots.txt is not access authorization or a security boundary.",
        {
            url: z.string().url().max(2048),
            product_token: z
                .string()
                .min(1)
                .max(99)
                .regex(/^[A-Za-z_-]+$/)
                .describe(
                    "Crawler product token (letters, underscores, or hyphens)",
                ),
        },
        ({ url, product_token }) => checkRobotsRules(url, product_token),
    ],
];
