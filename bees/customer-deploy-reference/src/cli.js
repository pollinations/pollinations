import { readFile, writeFile } from "node:fs/promises";
import { DeployStore } from "./api.js";
import {
    assertBeeManifest,
    createStarterManifest,
    normalizeBeeManifest,
    validateBeeManifest,
} from "./schema.js";

const store = new DeployStore();

function kindForProvider(provider) {
    return ["daytona", "aws-agentcore", "container"].includes(provider)
        ? "container"
        : "worker";
}

async function main(argv) {
    const [command, arg, ...rest] = argv;

    if (command === "init") {
        const output = arg ?? "bee.json";
        const nameIndex = rest.indexOf("--name");
        const templateIndex = rest.indexOf("--template");
        const template = rest.includes("--queen")
            ? "queen"
            : templateIndex >= 0 && rest[templateIndex + 1]
              ? rest[templateIndex + 1]
              : "worker";
        if (!["worker", "queen"].includes(template)) {
            return { error: "template must be worker or queen" };
        }
        const name =
            nameIndex >= 0 && rest[nameIndex + 1]
                ? rest[nameIndex + 1]
                : "my-bee";
        const manifest = createStarterManifest(name, template);
        await writeFile(output, `${JSON.stringify(manifest, null, 2)}\n`);
        return { ok: true, path: output, template, manifest };
    }

    if (command === "validate") {
        const manifest = JSON.parse(await readFile(arg, "utf8"));
        const result = validateBeeManifest(manifest);
        return result.valid
            ? { ...result, resolved: normalizeBeeManifest(manifest) }
            : result;
    }

    if (command === "deploy") {
        const manifest = JSON.parse(await readFile(arg, "utf8"));
        const runtimeIndex = rest.indexOf("--runtime");
        if (runtimeIndex >= 0 && rest[runtimeIndex + 1]) {
            const provider = rest[runtimeIndex + 1];
            manifest.runtime = {
                ...(manifest.runtime ?? {}),
                kind: kindForProvider(provider),
                provider,
            };
        }
        assertBeeManifest(manifest);
        const dryRun = rest.includes("--dry-run");
        const deployment = dryRun
            ? storePreview(manifest)
            : store.create(manifest, "https://gen.pollinations.ai", {
                  upgrade: rest.includes("--upgrade"),
              });
        return dryRun ? { dryRun: true, deployment } : deployment;
    }

    if (command === "status") {
        return store.get(arg) ?? { error: "Not found" };
    }

    if (command === "list") {
        return store.list();
    }

    if (command === "events") {
        return store.events(arg);
    }

    if (command === "delete") {
        return { deleted: store.delete(arg) };
    }

    return {
        error: "Usage: init [bee.json] [--name my-bee] [--template worker|queen] [--queen] | validate <bee.json> | deploy <bee.json> [--dry-run] [--upgrade] [--runtime auto|cloudflare-agents|daytona|aws-agentcore|container] | list | status <bee_id> | events <bee_id> | delete <bee_id>",
    };
}

if (import.meta.url === `file://${process.argv[1]}`) {
    const result = await main(process.argv.slice(2));
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

export { main };

function storePreview(manifest) {
    const previewStore = new DeployStore();
    return previewStore.create(manifest);
}
