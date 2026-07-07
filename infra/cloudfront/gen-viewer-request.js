// CloudFront viewer-request function for the gen.pollinations.ai distribution.
//
// Function name: pln-gen-viewer-ip
// Runtime:       cloudfront-js-2.0
// Distribution:  E35MFLKOJK04O7 (gen.pollinations.ai -> origin gen.myceli.ai)
// Event type:    viewer-request (DefaultCacheBehavior)
//
// Why: the distribution runs with Origin Shield (us-east-1), which collapses
// every viewer to a handful of shared 64.252.x egress IPs by the time the
// request reaches the origin Worker. That destroys per-client IP data used for
// rate limiting and abuse detection. This function stamps the true viewer IP
// into X-Original-Client-IP at the edge, before Origin Shield. The origin
// Worker trusts that header only when X-Forwarded-Host is a known public host
// (see shared/public-origin.ts + shared/client-ip.ts), and CloudFront's
// AllViewerExceptHostHeader origin-request policy forwards function-added
// headers to the origin.
//
// Security: this unconditionally overwrites any client-supplied
// X-Original-Client-IP, so the value the origin trusts always comes from
// CloudFront, never from the caller.
//
// See infra/cloudfront/README.md to (re)deploy.
function handler(event) {
    event.request.headers["x-original-client-ip"] = { value: event.viewer.ip };
    return event.request;
}
