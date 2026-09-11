import { XMLParser, XMLValidator } from "fast-xml-parser";
import { COMMUNITY_PROVIDER_ICON_MAX_BYTES } from "./community-provider-icon.ts";

export {
    COMMUNITY_PROVIDER_ICON_PRESETS,
    type CommunityProviderIconPreset,
    isCommunityProviderIconPreset,
} from "./community-provider-icon.ts";

const SAFE_ELEMENTS = new Set([
    "svg",
    "g",
    "path",
    "circle",
    "ellipse",
    "rect",
    "line",
    "polyline",
    "polygon",
]);
const MAX_ICON_DEPTH = 32;

const COMMON_ATTRIBUTES = new Set([
    "fill",
    "fill-rule",
    "clip-rule",
    "stroke",
    "stroke-width",
    "stroke-linecap",
    "stroke-linejoin",
    "stroke-miterlimit",
    "fill-opacity",
    "stroke-opacity",
    "opacity",
    "transform",
]);

const ELEMENT_ATTRIBUTES: Record<string, Set<string>> = {
    svg: new Set(["viewBox"]),
    g: COMMON_ATTRIBUTES,
    path: new Set(["d", ...COMMON_ATTRIBUTES]),
    circle: new Set(["cx", "cy", "r", ...COMMON_ATTRIBUTES]),
    ellipse: new Set(["cx", "cy", "rx", "ry", ...COMMON_ATTRIBUTES]),
    rect: new Set([
        "x",
        "y",
        "width",
        "height",
        "rx",
        "ry",
        ...COMMON_ATTRIBUTES,
    ]),
    line: new Set(["x1", "x2", "y1", "y2", ...COMMON_ATTRIBUTES]),
    polyline: new Set(["points", ...COMMON_ATTRIBUTES]),
    polygon: new Set(["points", ...COMMON_ATTRIBUTES]),
};

type XmlNode = Record<string, unknown>;

function escapedAttribute(value: string): string {
    return value
        .replaceAll("&", "&amp;")
        .replaceAll('"', "&quot;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;");
}

function safeAttributeValue(value: unknown): value is string {
    return (
        typeof value === "string" &&
        value.length <= 32_768 &&
        !/[&<>"']/u.test(value) &&
        !/url\s*\(|javascript\s*:|data\s*:|https?\s*:|\/\//iu.test(value) &&
        !/[{};]/u.test(value)
    );
}

function serializeElement(
    name: string,
    node: XmlNode[],
    isRoot: boolean,
    state: { count: number },
    depth: number,
): string | null {
    if (!SAFE_ELEMENTS.has(name) || (!isRoot && name === "svg")) return null;
    if (depth > MAX_ICON_DEPTH) return null;
    if (++state.count > 5_000) return null;

    const attributesNode = node.find((item) => item[":@"]);
    const attributes = (attributesNode?.[":@"] ?? {}) as Record<
        string,
        unknown
    >;
    const allowedAttributes = ELEMENT_ATTRIBUTES[name];
    const serializedAttributes: string[] = [];
    for (const [rawName, rawValue] of Object.entries(attributes)) {
        const attributeName = rawName.startsWith("@_")
            ? rawName.slice(2)
            : rawName;
        if (
            isRoot &&
            attributeName === "xmlns" &&
            rawValue === "http://www.w3.org/2000/svg"
        ) {
            continue;
        }
        if (
            !allowedAttributes.has(attributeName) ||
            !safeAttributeValue(rawValue)
        ) {
            return null;
        }
        serializedAttributes.push(
            `${attributeName}="${escapedAttribute(rawValue)}"`,
        );
    }

    if (isRoot) {
        const viewBox = attributes["@_viewBox"];
        if (!safeAttributeValue(viewBox)) return null;
        const values = viewBox
            .trim()
            .split(/[\s,]+/u)
            .map(Number);
        if (
            values.length !== 4 ||
            values.some((value) => !Number.isFinite(value)) ||
            values[2] <= 0 ||
            values[3] <= 0
        ) {
            return null;
        }
        serializedAttributes.unshift('xmlns="http://www.w3.org/2000/svg"');
    }

    const children: string[] = [];
    for (const child of node) {
        if (child[":@"] && Object.keys(child).length === 1) continue;
        if ("#text" in child) {
            if (typeof child["#text"] !== "string" || child["#text"].trim()) {
                return null;
            }
            continue;
        }
        const childName = Object.keys(child)[0];
        if (!childName) continue;
        const childValue = child[childName];
        if (!Array.isArray(childValue)) return null;
        const serialized = serializeElement(
            childName,
            [
                ...(child[":@"] ? [{ ":@": child[":@"] } as XmlNode] : []),
                ...(childValue as XmlNode[]),
            ],
            false,
            state,
            depth + 1,
        );
        if (serialized === null) return null;
        children.push(serialized);
    }

    return `<${name}${serializedAttributes.length ? ` ${serializedAttributes.join(" ")}` : ""}>${children.join("")}</${name}>`;
}

/** Parse and rebuild an SVG through an allowlisted XML tree. */
export function sanitizeCommunityProviderSvg(input: string): string | null {
    if (typeof input !== "string") return null;
    if (
        new TextEncoder().encode(input).byteLength >
        COMMUNITY_PROVIDER_ICON_MAX_BYTES
    ) {
        return null;
    }
    const svg = input.replace(/^\uFEFF/u, "").trim();
    if (!svg || /<!|<\?|&/u.test(svg)) return null;
    if (XMLValidator.validate(svg) !== true) return null;

    try {
        const parser = new XMLParser({
            ignoreAttributes: false,
            attributeNamePrefix: "@_",
            preserveOrder: true,
            processEntities: false,
            trimValues: false,
            parseTagValue: false,
        });
        const parsed = parser.parse(svg) as XmlNode[];
        if (parsed.length !== 1 || !Array.isArray(parsed[0]?.svg)) return null;
        return serializeElement(
            "svg",
            [
                ...(parsed[0][":@"]
                    ? [{ ":@": parsed[0][":@"] } as XmlNode]
                    : []),
                ...(parsed[0].svg as XmlNode[]),
            ],
            true,
            { count: 0 },
            0,
        );
    } catch {
        return null;
    }
}
