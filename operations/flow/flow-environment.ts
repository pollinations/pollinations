export type FlowOrigins = { enter: string; admin: string };
export type SourceInfo = {
    revision: string;
    mainRevision: string;
    dirty: boolean;
};
export type FlowEnvironment = FlowOrigins & { source: SourceInfo };

declare global {
    interface Window {
        __FLOW_ENVIRONMENT__: FlowEnvironment;
    }
}

export function environmentScript(environment: FlowEnvironment) {
    return new Response(
        `window.__FLOW_ENVIRONMENT__ = ${JSON.stringify(environment).replaceAll("<", "\\u003c")};`,
        {
            headers: {
                "Content-Type": "text/javascript; charset=utf-8",
                "Cache-Control": "no-store",
            },
        },
    );
}
