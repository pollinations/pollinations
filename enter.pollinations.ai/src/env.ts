import { RequestIdVariables } from "hono/request-id";

export type Env = {
    Bindings: Cloudflare.Env;
    Variables: RequestIdVariables;
};
