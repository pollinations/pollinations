import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const enterDirectory = fileURLToPath(new URL("../", import.meta.url));
const virtualModule = "virtual:code-agent-sdk";

/** Build only platform-owned code and pinned dependencies, never agent repositories. */
export async function buildCodeAgentModules() {
    const result = await build({
        absWorkingDir: enterDirectory,
        stdin: {
            contents: `
export { default } from "./src/services/code-agent-runtime.js";
export * from "ai";
export * from "@ai-sdk/openai-compatible";
`,
            resolveDir: enterDirectory,
        },
        bundle: true,
        write: false,
        format: "esm",
        platform: "browser",
        target: "es2022",
        minify: true,
        metafile: true,
    });
    if (
        Object.values(result.metafile.outputs).some(
            ({ imports }) => imports.length,
        )
    ) {
        throw new Error("Code agent runtime must not contain external imports");
    }
    return {
        runtimeModule: result.outputFiles[0].text,
        // Bare imports resolve to these uploaded module names in workerd. Both
        // aliases share the runtime bundle, including one copy of Zod/the SDK.
        sdkModules: {
            ai: 'export * from "./runtime.mjs";',
            "@ai-sdk/openai-compatible": `export {
createOpenAICompatible,
OpenAICompatibleChatLanguageModel,
OpenAICompatibleCompletionLanguageModel,
OpenAICompatibleEmbeddingModel,
OpenAICompatibleImageModel,
VERSION
} from "../runtime.mjs";`,
        },
        watchFiles: Object.keys(result.metafile.inputs)
            .filter((input) => input !== "<stdin>")
            .map((input) => resolve(enterDirectory, input)),
    };
}

/** @returns {import("vite").Plugin} */
export function codeAgentSdk() {
    return {
        name: "code-agent-sdk",
        resolveId(id) {
            return id === virtualModule ? `\0${virtualModule}` : undefined;
        },
        async load(id) {
            if (id !== `\0${virtualModule}`) return;
            const { runtimeModule, sdkModules, watchFiles } =
                await buildCodeAgentModules();
            for (const file of watchFiles) this.addWatchFile(file);
            return `export const runtimeModule = ${JSON.stringify(runtimeModule)};
export const sdkModules = ${JSON.stringify(sdkModules)};`;
        },
    };
}
