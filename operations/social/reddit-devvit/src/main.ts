import { Devvit } from "@devvit/public-api";
import { postConfiguredNews } from "./post-handler.js";
import post from "./post.json" with { type: "json" };

Devvit.configure({ media: true, redditAPI: true, redis: true });

function configuredPost() {
  if (typeof post.title !== "string" || typeof post.imageUrl !== "string" || typeof post.scope !== "string" || typeof post.date !== "string") throw new Error("Invalid Reddit news configuration");
  return post;
}

Devvit.addTrigger({
  event: "AppUpgrade",
  async onEvent(_event, context) {
    await postConfiguredNews(configuredPost(), context.redis, {
      upload: (input) => context.media.upload(input),
      submit: (input) => context.reddit.submitPost(input),
    }, (record) => console.log(JSON.stringify(record)));
  },
});

export default Devvit;
