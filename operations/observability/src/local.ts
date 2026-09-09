import { createObservabilityApp } from "./app";
// The local Grafana process is loopback-only; authentication is the same app
// gateway used in production, without needing Docker for the preview.
export default createObservabilityApp((request) => {
    const url = new URL(request.url);
    url.host = "127.0.0.1:4001";
    return fetch(new Request(url, request));
});
