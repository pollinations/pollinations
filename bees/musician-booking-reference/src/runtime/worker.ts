import { createMusicianBookingAgent } from "../agent.js";
import { createEnterByopAuthorizer } from "../providers/enter/index.js";
import { handleBeeRequest } from "./http.js";

const agent = createMusicianBookingAgent();

type Env = {
    BYOP_CLIENT_ID?: string;
    BYOP_REDIRECT_URI?: string;
    ENTER_BASE_URL?: string;
};

export default {
    fetch(request: Request, env: Env): Promise<Response> {
        const authorize = env.BYOP_CLIENT_ID
            ? createEnterByopAuthorizer({
                  clientId: env.BYOP_CLIENT_ID,
                  redirectUri:
                      env.BYOP_REDIRECT_URI ??
                      new URL("/byop/callback", request.url).toString(),
                  enterBaseUrl:
                      env.ENTER_BASE_URL ?? "https://enter.pollinations.ai",
              })
            : undefined;
        return handleBeeRequest(request, { agent, authorize });
    },
};
