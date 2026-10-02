import { z } from "zod";

const id = z
    .string()
    .min(1)
    .max(128)
    // Keep Unicode validation server-side: Python MCP clients cannot compile \p.
    .refine((value) => /^[\p{L}\p{N}_.:-]+$/u.test(value), "Invalid ID");
const relationKey = { subject: id, predicate: id, target: id };
const nodeWrite = z.union([
    z
        .object({
            id,
            name: z.string().min(1).max(256),
            text: z.string().max(4096).default(""),
            aliases: z.array(z.string().min(1).max(128)).max(16).default([]),
        })
        .strict(),
    z.object({ id, delete: z.literal(true) }).strict(),
]);
const relationWrite = z.union([
    z
        .object({
            ...relationKey,
            evidence: z.string().min(1).max(2048),
        })
        .strict(),
    z
        .object({
            ...relationKey,
            delete: z.literal(true),
        })
        .strict(),
]);

export const graphWriteSchema = z
    .object({
        nodes: z.array(nodeWrite).max(32).default([]),
        relations: z.array(relationWrite).max(32).default([]),
    })
    .strict()
    .refine((v) => v.nodes.length + v.relations.length > 0, "Empty write");

export const graphSearchSchema = z.union([
    z
        .object({
            mode: z.literal("find").default("find"),
            query: z.string().max(512).default(""),
            limit: z.number().int().min(1).max(32).default(10),
            offset: z.number().int().min(0).max(20_000).default(0),
        })
        .strict(),
    z
        .object({
            mode: z.literal("count"),
            subject: id.optional(),
            predicate: id.optional(),
            target: id.optional(),
            countUnit: z.enum(["relations", "targets"]).default("relations"),
        })
        .strict(),
]);
export const graphReadSchema = z
    .object({
        ids: z.array(id).min(1).max(16),
        relationOffset: z.number().int().min(0).max(20_000).default(0),
    })
    .strict();
