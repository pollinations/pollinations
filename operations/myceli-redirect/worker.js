// Sends retired *.myceli.ai hostnames to the same service on pollinations.ai,
// keeping the path, query and method (308).
export default {
    fetch(request) {
        const url = new URL(request.url);
        const subdomain = url.hostname
            .replace(/\.myceli\.ai$/, "")
            .replace(/(^|\.)pollinations$/, "");
        url.hostname = subdomain
            ? `${subdomain}.pollinations.ai`
            : "pollinations.ai";
        return Response.redirect(url.href, 308);
    },
};
