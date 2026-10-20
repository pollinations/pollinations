/// <reference types="vite/client" />
import { z } from "zod";
import type { AUDIO_SERVICES as LegacyAudioServices } from "../audio.ts";
import {
    type FallbackDefinition,
    type FallbackMap,
    mergeFallbacks,
} from "../merge-fallbacks";
import { FallbackFileSchema, ModelFileSchema } from "../model-file-schema";
import type { ModelDefinition } from "../registry";

// Loads the audio catalog from one-model-per-file declarations. Order is
// file-name (canonical id) order — deterministic and conflict-free; the
// legacy table's curated order carried no behavior.
type ModelModule = { default: unknown; id: unknown };
type RouteModule = ModelModule & { parent: unknown; order: unknown };

function parseModules<Mods extends Record<string, ModelModule>>(
    modules: Mods,
    schema: z.ZodType,
): Record<string, ModelDefinition> {
    const out: Record<string, ModelDefinition> = {};
    for (const file of Object.keys(modules).sort()) {
        const mod = modules[file];
        if (typeof mod.id !== "string") {
            throw new Error(`[registry/audio] ${file}: missing \`id\` export`);
        }
        const parsed = schema.safeParse(mod.default);
        if (!parsed.success) {
            throw new Error(
                `[registry/audio] ${file}: ${z.prettifyError(parsed.error)}`,
            );
        }
        if (mod.id in out) {
            throw new Error(
                `[registry/audio] duplicate model id "${mod.id}" (${file})`,
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
// Routes keep the source declaration order — the order mergeFallbacks tries
// them in — which file names do not reproduce.
const pending: Record<
    string,
    Array<{ id: string; order: number; def: FallbackDefinition }>
> = {};
for (const file of Object.keys(routeModules).sort()) {
    const mod = routeModules[file];
    if (
        typeof mod.id !== "string" ||
        typeof mod.parent !== "string" ||
        typeof mod.order !== "number"
    ) {
        throw new Error(
            `[registry/audio] ${file}: missing \`id\`/\`parent\`/\`order\` exports`,
        );
    }
    const parsed = FallbackFileSchema.safeParse(mod.default);
    if (!parsed.success) {
        throw new Error(
            `[registry/audio] ${file}: ${z.prettifyError(parsed.error)}`,
        );
    }
    if (!(mod.parent in base)) {
        throw new Error(
            `[registry/audio] ${file}: parent "${mod.parent}" is not a model`,
        );
    }
    if (!pending[mod.parent]) pending[mod.parent] = [];
    const list = pending[mod.parent];
    if (list.some((r) => r.id === mod.id)) {
        throw new Error(
            `[registry/audio] duplicate route id "${mod.id}" (${file})`,
        );
    }
    if (list.some((r) => r.order === mod.order)) {
        throw new Error(
            `[registry/audio] duplicate route order ${mod.order} under "${mod.parent}" (${file})`,
        );
    }
    list.push({
        id: mod.id,
        order: mod.order,
        def: parsed.data as FallbackDefinition,
    });
}

const routes: FallbackMap = {};
for (const [parent, list] of Object.entries(pending)) {
    list.sort((a, b) => a.order - b.order);
    routes[parent] = Object.fromEntries(list.map((r) => [r.id, r.def]));
}

export const AUDIO_SERVICES = mergeFallbacks(
    base,
    routes,
) as unknown as typeof LegacyAudioServices;
export type AudioModelName = keyof typeof AUDIO_SERVICES;
