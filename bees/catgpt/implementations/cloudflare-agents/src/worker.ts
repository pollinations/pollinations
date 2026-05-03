import { routeAgentRequest } from "agents";
import { CatGPT } from "./agent";

export { CatGPT };

export default {
  async fetch(req: Request, env: any) {
    const res = await routeAgentRequest(req, env);
    return res ?? new Response("not found", { status: 404 });
  },
};
