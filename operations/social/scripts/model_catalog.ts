import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

// Load the version being compared, including its own pricing calculation.
async function main() {
    const root = resolve(process.argv[2] ?? ".");
    const info = await import(
        pathToFileURL(`${root}/shared/registry/model-info.ts`).href
    );
    const registry = await import(
        pathToFileURL(`${root}/shared/registry/registry.ts`).href
    );
    const models = registry
        .getModels()
        .filter((name: string) =>
            registry.isVisibleModelDefinition(
                registry.getRegistryModelDefinition(name),
            ),
        )
        .map((name: string) =>
            info.modelInfoFromDefinition(
                name,
                registry.getRegistryModelDefinition(name),
            ),
        );
    process.stdout.write(JSON.stringify(models));
}
main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
});
