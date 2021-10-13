import { socialPost } from "./functions/social-post"

if (process.argv[2] && process.argv[3]) {
    socialPost(process.argv[2],process.argv[3]);
} else
    console.error("Please supply a content id as argument.");