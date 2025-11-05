import { RequestIdVariables } from "hono/request-id";
import { LoggerVariables } from "./middleware/logger.ts";

export type ErrorVariables = {
    error?: Error;
};

export type Env = {
    Bindings: CloudflareBindings;
    Variables: RequestIdVariables & LoggerVariables & ErrorVariables;
};
