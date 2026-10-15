import {
    askModel,
    buildReviewPrompt,
    collectReviewContext,
} from "./askpolli-review.mjs";

const event = JSON.parse(process.env.GITHUB_EVENT_JSON || "{}");
const eventName = process.env.GITHUB_EVENT_NAME;

try {
    const review = await collectReviewContext({
        token: process.env.GITHUB_TOKEN,
        repository: process.env.GITHUB_REPOSITORY,
        eventName,
        event,
    });
    const artifact = await askModel({
        apiKey: process.env.POLLINATIONS_API_KEY,
        prompt: buildReviewPrompt(review),
    });
    process.stdout.write(JSON.stringify(artifact));
} catch (error) {
    console.error(error instanceof Error ? error.message : "askpolli failed.");
    process.exitCode = 1;
}
