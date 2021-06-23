/** Cut & Paste Node.js Code **/
import SocialPost from "social-post-api"; // Install "npm i social-post-api"

// Live API Key
const social = new SocialPost("6FE4JJ0-2P94JT3-PN81AYX-ARRKJR4");

const post = await social.post({
      "post": "Text-to-Image: Vibrant painting of a euphoric robot in the style of Dali. https://pollinations.ai/p/QmXtFwvd87x4MfFU26UckAjTbJghq5K4iqPBAS1P6tMQNe",
      title: "Text-to-Image: Vibrant painting of a euphoric robot in the style of Dali.",
      // Required if platform includes "reddit." Subreddit to post.
      subreddit: "MediaSynthesis",
      "platforms": ["reddit"],
  "mediaUrls": ["https://pollinations.ai/ipfs/QmUrNvNcJw3G97hnS4HkyYFCtdP5VoVTzKxzzTwLqCGYWg/image.png?filename=vibrant-painting-of-a-euphoric-robot-in-the-style-of-dali_01995.png"]
}).catch(console.error);

console.log(post)