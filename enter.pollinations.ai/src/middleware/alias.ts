import { createMiddleware } from "hono/factory";
import { routePath } from "hono/route";
import { LoggerVariables } from "@/middleware/logger.ts";

type AliasEnv = {
    Bindings: CloudflareBindings;
    Variables: LoggerVariables;
};

export const alias = (config: Record<string, string>) =>
    createMiddleware<AliasEnv>(async (c, next) => {
        const originalPath = c.req.path;
        const prefix = routePath(c).slice(0, -2);
        const matchPath = c.req.path.slice(prefix.length);
        for (const [alias, target] of Object.entries(config)) {
            if (matchPath === alias) {
                const updatedUrl = new URL(c.req.url);
                updatedUrl.pathname = `${prefix}${target}`;
                c.var.log.info(
                    `Forwarding ${originalPath} to ${updatedUrl.pathname}`,
                );
                return await fetch(new Request(updatedUrl, c.req.raw));
            }
        }
        await next();
        return;
    });
