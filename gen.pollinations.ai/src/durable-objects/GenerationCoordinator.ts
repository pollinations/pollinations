import { DurableObject } from "cloudflare:workers";

/** Retained because deployed Durable Object migration history is append-only. */
export class GenerationCoordinator extends DurableObject<CloudflareBindings> {}
