/// <reference types="vite/client" />
import { z } from "zod";
import {
    type FallbackDefinition,
    type FallbackMap,
    mergeFallbacks,
} from "../merge-fallbacks";
import { FallbackFileSchema, ModelFileSchema } from "../model-file-schema";
import type { ModelDefinition } from "../registry";

// Loads the text catalog from one-model-per-file declarations. Order is
// file-name (canonical id) order — deterministic and conflict-free; the
// legacy table's curated order carried no behavior.
type ModelModule = { default: unknown; id: unknown };
type RouteModule = ModelModule & { parent: unknown };

function parseModules<Mods extends Record<string, ModelModule>>(
    modules: Mods,
    schema: z.ZodType,
): Record<string, ModelDefinition> {
    const out: Record<string, ModelDefinition> = {};
    for (const file of Object.keys(modules).sort()) {
        const mod = modules[file];
        if (typeof mod.id !== "string") {
            throw new Error(`[registry/text] ${file}: missing \`id\` export`);
        }
        const parsed = schema.safeParse(mod.default);
        if (!parsed.success) {
            throw new Error(
                `[registry/text] ${file}: ${z.prettifyError(parsed.error)}`,
            );
        }
        if (mod.id in out) {
            throw new Error(
                `[registry/text] duplicate model id "${mod.id}" (${file})`,
            );
        }
        out[mod.id] = parsed.data as ModelDefinition;
    }
    return out;
}

const base = parseModules(
    import.meta.glob("./models/*.ts", { eager: true }) as Record<
        string,
        ModelModule
    >,
    ModelFileSchema,
);

const routeModules = import.meta.glob("./routes/*.ts", {
    eager: true,
}) as Record<string, RouteModule>;
const routes: FallbackMap = {};
for (const file of Object.keys(routeModules).sort()) {
    const mod = routeModules[file];
    if (typeof mod.id !== "string" || typeof mod.parent !== "string") {
        throw new Error(
            `[registry/text] ${file}: missing \`id\`/\`parent\` exports`,
        );
    }
    const parsed = FallbackFileSchema.safeParse(mod.default);
    if (!parsed.success) {
        throw new Error(
            `[registry/text] ${file}: ${z.prettifyError(parsed.error)}`,
        );
    }
    if (!(mod.parent in base)) {
        throw new Error(
            `[registry/text] ${file}: parent "${mod.parent}" is not a model`,
        );
    }
    if (!(mod.parent in routes)) routes[mod.parent] = {};
    const group = routes[mod.parent];
    if (mod.id in group) {
        throw new Error(
            `[registry/text] duplicate route id "${mod.id}" (${file})`,
        );
    }
    group[mod.id] = parsed.data as FallbackDefinition;
}

export const TEXT_SERVICES = mergeFallbacks(base, routes);
export type TextModelName = keyof typeof TEXT_SERVICES;
