import { RequestIdVariables } from "hono/request-id";
import { LoggerVariables } from "./middleware/logger.ts";
import type { User } from "./auth.ts";

export type GenAuthVariables = {
    auth: {
        user: User;
        apiKey?: {
            name?: string;
            permissions?: Record<string, string[]>;
            metadata?: Record<string, unknown>;
        };
        requireAuthorization: (options?: {
            allowAnonymous?: boolean;
            message?: string;
        }) => Promise<void>;
    };
};

export type Env = {
    Bindings: CloudflareBindings;
    Variables: RequestIdVariables & LoggerVariables & GenAuthVariables;
};
