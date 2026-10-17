import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import {
    createMCPResponse,
    createTextContent,
} from "../../packages/mcp/src/utils/coreUtils.js";

const USER_AGENT =
    "pollinations-packages-mcp/0.1.0 (+https://gen.pollinations.ai/mcp/packages)";
const OUTPUT_LIMIT = 100_000;

const cut = (text) =>
    text.length > OUTPUT_LIMIT
        ? `${text.slice(0, OUTPUT_LIMIT)}\n[cut at ${OUTPUT_LIMIT} characters]`
        : text;

const NPM_NAME_RE = /^(?:@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/;
const SIMPLE_NAME_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const VERSION_RE = /^[A-Za-z0-9][A-Za-z0-9.+_-]*$/;

function cleanRepoUrl(repository) {
    const raw =
        typeof repository === "string"
            ? repository
            : typeof repository?.url === "string"
              ? repository.url
              : undefined;
    if (!raw) return undefined;
    return raw.replace(/^git\+/, "").replace(/\.git$/, "");
}

function validateInputs(ecosystem, name, version) {
    if (ecosystem === "npm") {
        if (!NPM_NAME_RE.test(name)) {
            throw new Error(
                `Invalid npm package name "${name}". Use lowercase package names such as "zod" or "@modelcontextprotocol/server".`,
            );
        }
    } else if (!SIMPLE_NAME_RE.test(name)) {
        throw new Error(`Invalid ${ecosystem} package name "${name}".`);
    }
    if (version !== undefined && !VERSION_RE.test(version)) {
        throw new Error(
            `Invalid version "${version}". Pass an exact version or dist-tag such as "2.56.0" or "latest".`,
        );
    }
}

async function fetchRegistryJson(url, ecosystem, name, version) {
    const response = await fetch(url, {
        headers: {
            Accept: "application/json",
            "User-Agent": USER_AGENT,
        },
        redirect: "manual",
        signal: AbortSignal.timeout(10_000),
    });
    if (response.status === 404) {
        const target = version ? `${name}@${version}` : name;
        throw new Error(`Package ${target} was not found on ${ecosystem}.`);
    }
    if (!response.ok) {
        throw new Error(
            `${ecosystem} registry returned HTTP ${response.status}.`,
        );
    }
    return response.json();
}

async function lookupNpm(name, version = "latest") {
    const encodedName = name.startsWith("@")
        ? `@${encodeURIComponent(name.slice(1).split("/")[0])}/${encodeURIComponent(name.split("/")[1])}`
        : encodeURIComponent(name);
    const url = new URL(
        `https://registry.npmjs.org/${encodedName}/${encodeURIComponent(version)}`,
    );
    const data = await fetchRegistryJson(url, "npm", name, version);
    return {
        ecosystem: "npm",
        name: data.name ?? name,
        version: data.version ?? version,
        description: data.description ?? undefined,
        license:
            typeof data.license === "string"
                ? data.license
                : data.license?.type,
        homepage: data.homepage ?? undefined,
        repository: cleanRepoUrl(data.repository),
        engines: data.engines ?? undefined,
        dependencies: data.dependencies ?? {},
        ...(data.peerDependencies
            ? { peerDependencies: data.peerDependencies }
            : {}),
        ...(data.deprecated ? { deprecated: data.deprecated } : {}),
        registryUrl: `https://www.npmjs.com/package/${data.name ?? name}/v/${data.version ?? version}`,
    };
}

async function lookupPypi(name, version) {
    const path = version
        ? `/pypi/${encodeURIComponent(name)}/${encodeURIComponent(version)}/json`
        : `/pypi/${encodeURIComponent(name)}/json`;
    const url = new URL(path, "https://pypi.org");
    const data = await fetchRegistryJson(url, "pypi", name, version);
    const info = data.info ?? {};
    const projectUrls = info.project_urls ?? {};
    const repository =
        projectUrls.Repository ??
        projectUrls.Source ??
        projectUrls["Source Code"] ??
        projectUrls.GitHub ??
        undefined;
    return {
        ecosystem: "pypi",
        name: info.name ?? name,
        version: info.version ?? version,
        description: info.summary || undefined,
        license: info.license_expression || info.license || undefined,
        homepage:
            info.home_page ||
            projectUrls.Homepage ||
            info.project_url ||
            undefined,
        repository,
        requiresPython: info.requires_python || undefined,
        dependencies: Array.isArray(info.requires_dist)
            ? info.requires_dist
            : [],
        ...(info.yanked
            ? { deprecated: info.yanked_reason || "Yanked release" }
            : {}),
        registryUrl: `https://pypi.org/project/${info.name ?? name}/${info.version ?? ""}`,
    };
}

async function lookupCrates(name, version) {
    const path = version
        ? `/api/v1/crates/${encodeURIComponent(name)}/${encodeURIComponent(version)}`
        : `/api/v1/crates/${encodeURIComponent(name)}`;
    const url = new URL(path, "https://crates.io");
    const data = await fetchRegistryJson(url, "crates", name, version);
    if (version) {
        const ver = data.version ?? {};
        return {
            ecosystem: "crates",
            name: ver.crate ?? name,
            version: ver.num ?? version,
            license: ver.license ?? undefined,
            rustVersion: ver.rust_version ?? undefined,
            ...(ver.yanked ? { deprecated: "Yanked release" } : {}),
            registryUrl: `https://crates.io/crates/${ver.crate ?? name}/${ver.num ?? version}`,
        };
    }
    const crate = data.crate ?? {};
    const latest = Array.isArray(data.versions) ? data.versions[0] : undefined;
    const resolvedVersion =
        crate.max_stable_version || crate.max_version || latest?.num;
    return {
        ecosystem: "crates",
        name: crate.name ?? name,
        version: resolvedVersion,
        description: crate.description ?? undefined,
        license: latest?.license ?? undefined,
        homepage: crate.homepage ?? undefined,
        repository: crate.repository ?? undefined,
        rustVersion: latest?.rust_version ?? undefined,
        ...(latest?.yanked ? { deprecated: "Yanked release" } : {}),
        registryUrl: `https://crates.io/crates/${crate.name ?? name}`,
    };
}

function buildServer() {
    const server = new McpServer(
        { name: "packages-mcp", title: "Packages MCP", version: "0.1.0" },
        { capabilities: { tools: {} } },
    );

    server.registerTool(
        "package_lookup",
        {
            description:
                "Look up live package metadata from npm, PyPI, or Crates.io. " +
                "Call before writing package.json, pyproject.toml, requirements.txt, or Cargo.toml " +
                "to verify that a package exists and check its current version, engine/runtime requirements, " +
                "dependencies, license, repository URL, and deprecation status. " +
                "Queries public registries directly without forwarding caller credentials.",
            inputSchema: z.object({
                ecosystem: z
                    .enum(["npm", "pypi", "crates"])
                    .default("npm")
                    .describe(
                        "Package registry to query: npm (JavaScript/TypeScript), pypi (Python), or crates (Rust).",
                    ),
                name: z
                    .string()
                    .trim()
                    .min(1)
                    .max(214)
                    .describe(
                        "Exact package name, e.g. @modelcontextprotocol/server, e2b, fastapi, or serde.",
                    ),
                version: z
                    .string()
                    .trim()
                    .min(1)
                    .max(64)
                    .optional()
                    .describe(
                        "Optional exact version or npm dist-tag (defaults to the latest release).",
                    ),
            }),
            annotations: {
                readOnlyHint: true,
                idempotentHint: true,
                openWorldHint: true,
            },
        },
        async ({ ecosystem, name, version }) => {
            validateInputs(ecosystem, name, version);
            let result;
            if (ecosystem === "npm") {
                result = await lookupNpm(name, version);
            } else if (ecosystem === "pypi") {
                result = await lookupPypi(name, version);
            } else {
                result = await lookupCrates(name, version);
            }
            return createMCPResponse([
                createTextContent(cut(JSON.stringify(result, null, 2))),
            ]);
        },
    );

    return server;
}

const mcpHandler = createMcpHandler(() => buildServer(), {
    legacy: "stateless",
    onerror: (error) => console.error(error),
});

export default {
    async fetch(request) {
        const url = new URL(request.url);
        if (url.pathname === "/health" && request.method === "GET") {
            return Response.json({
                name: "pollinations-packages-mcp",
                transport: "streamable-http",
                endpoint: "/",
                stateless: true,
            });
        }
        if (url.pathname !== "/") {
            return new Response("Not found", { status: 404 });
        }
        const token = request.headers
            .get("authorization")
            ?.trim()
            .match(/^Bearer\s+(\S+)$/i)?.[1];
        if (!token) {
            return Response.json(
                {
                    error: "unauthorized",
                    message: "Send a Pollinations API key as a bearer token.",
                },
                {
                    status: 401,
                    headers: {
                        "WWW-Authenticate":
                            'Bearer realm="packages-mcp.pollinations.ai"',
                    },
                },
            );
        }
        if (
            request.method === "POST" &&
            Array.isArray(
                await request
                    .clone()
                    .json()
                    .catch(() => null),
            )
        ) {
            return Response.json(
                {
                    error: "invalid_request",
                    message: "Batch requests are not supported.",
                },
                { status: 400 },
            );
        }
        return mcpHandler.fetch(request, {
            authInfo: { token, clientId: "pollinations-api-key", scopes: [] },
        });
    },
};
