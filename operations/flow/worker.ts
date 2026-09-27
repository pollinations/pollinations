import { Container } from "@cloudflare/containers";
import { createReviewerGateway } from "./reviewer-gateway";
import { STARTUP_TIMEOUT_MS } from "./startup";

type Bindings = {
    ASSETS: Fetcher;
    FLOW_RUNTIME: DurableObjectNamespace<FlowRuntime>;
    FLOW_ENTER_ORIGIN: string;
    FLOW_ADMIN_ORIGIN: string;
    FLOW_REVISION: string;
    FLOW_MAIN_REVISION: string;
    FLOW_DIRTY: string;
    POLLINATIONS_OAUTH_CLIENT_ID: string;
    POLLINATIONS_AUTH_SESSION_SECRET: string;
};

export class FlowRuntime extends Container<Bindings> {
    override startAndWaitForPorts(
        ...args: Parameters<Container["startAndWaitForPorts"]>
    ) {
        const [ports, cancellationOptions, startOptions] = args;
        const options =
            typeof ports === "object" && !Array.isArray(ports)
                ? ports
                : { ports, cancellationOptions, startOptions };
        // containerFetch still owns capacity/rate-limit responses and cancellation.
        return super.startAndWaitForPorts({
            ...options,
            cancellationOptions: {
                portReadyTimeoutMS: STARTUP_TIMEOUT_MS,
                ...options.cancellationOptions,
            },
        });
    }
    defaultPort = 4180;
    requiredPorts = [4180, 4182];
    sleepAfter = "10m";
    pingEndpoint = "localhost/screens";
    // Only public runtime configuration enters the fixture environment.
    envVars = {
        FLOW_BIND_ADDRESS: "0.0.0.0",
        FLOW_PORT: "4180",
        FLOW_HOSTED: "true",
        FLOW_ENTER_ORIGIN: this.env.FLOW_ENTER_ORIGIN,
        FLOW_ADMIN_ORIGIN: this.env.FLOW_ADMIN_ORIGIN,
        FLOW_REVISION: this.env.FLOW_REVISION,
        FLOW_MAIN_REVISION: this.env.FLOW_MAIN_REVISION,
        FLOW_DIRTY: this.env.FLOW_DIRTY,
    };
}

export default {
    async fetch(request: Request, env: Bindings) {
        if (
            !env.POLLINATIONS_OAUTH_CLIENT_ID ||
            !env.POLLINATIONS_AUTH_SESSION_SECRET
        )
            return Response.json(
                { error: "Flow reviewer sign-in is not configured." },
                { status: 503 },
            );
        const gateway = createReviewerGateway(
            {
                origins: {
                    enter: env.FLOW_ENTER_ORIGIN,
                    admin: env.FLOW_ADMIN_ORIGIN,
                },
                clientId: env.POLLINATIONS_OAUTH_CLIENT_ID,
                sessionSecret: env.POLLINATIONS_AUTH_SESSION_SECRET,
                assets: env.ASSETS,
            },
            async (reviewerId, verifiedRequest) => {
                const runtime = env.FLOW_RUNTIME.getByName(reviewerId);
                const port =
                    new URL(verifiedRequest.url).origin ===
                    env.FLOW_ADMIN_ORIGIN
                        ? 4182
                        : 4180;
                return runtime.containerFetch(verifiedRequest, port);
            },
        );
        return gateway(request);
    },
};
