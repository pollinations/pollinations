import { Hono } from "hono";
import type { Env } from "@/env.ts";

export const app = new Hono<Env>();
