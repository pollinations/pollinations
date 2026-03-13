import { RequestIdVariables } from "hono/request-id";
import { LoggerVariables } from "./middleware/logger.ts";

export type ErrorVariables = {
    error?: Error;
};

export type Env = {
    Bindings: CloudflareBindings & {
        X402_SERVER_ADDRESS: string;
    };
    Variables: RequestIdVariables & LoggerVariables & ErrorVariables;
};
