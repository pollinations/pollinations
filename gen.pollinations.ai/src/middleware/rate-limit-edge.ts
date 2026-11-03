import { rateLimit } from "@shared/rate-limit.ts";

/** First line of defense before cache, tracking and auth. */
export const edgeRateLimit = rateLimit({ byIp: true });
