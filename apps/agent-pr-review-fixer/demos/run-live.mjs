// Run the agent's real code locally against live GitHub and gen.pollinations.ai.
//   POLLINATIONS_API_KEY=... GITHUB_TOKEN=... node demos/run-live.mjs <pr-url> [model] [fork-url]
// GITHUB_TOKEN is used for reads (rate limit) and, when a fork URL is given and it is a
// fine-grained token (github_pat_...), for the push. Classic tokens are never used to push.
import { review } from "../agent.ts";

const [url, model = "openai/gpt-6.1-sol", fork] = process.argv.slice(2);
const { POLLINATIONS_API_KEY: key, GITHUB_TOKEN: token } = process.env;
const pollinations = (path, init = {}) => {
    const headers = new Headers(init.headers);
    headers.set("authorization", `Bearer ${key}`);
    return fetch(`https://gen.pollinations.ai${path}`, { ...init, headers });
};
const github = (target, init = {}) => {
    const headers = new Headers(init.headers);
    if (token && target.startsWith("https://api.github.com/"))
        if (!headers.has("authorization"))
            headers.set("authorization", `Bearer ${token}`);
    return fetch(target, { ...init, headers });
};
const text = fork && token ? `${url} ${fork} ${token}` : url;
const { report } = await review(text, pollinations, github, model);
console.log(token ? report.replaceAll(token, "[token]") : report);
