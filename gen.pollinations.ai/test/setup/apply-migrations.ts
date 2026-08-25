import { applyD1Migrations, env } from "cloudflare:test";
import { enterGateway } from "../gateway.ts";

await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);

// Gen reaches Enter's ServiceGateway over a service binding in every deployed
// environment; in tests the real gateway functions run in-process against
// the same D1 database (see test/gateway.ts).
Object.assign(env, { ENTER_GATEWAY: enterGateway });
