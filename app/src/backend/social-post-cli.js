import { socialPost } from "./functions/social-post"
import { receive } from "./ipfs/receiver";


if (process.argv[2] && process.argv[3]) {
    socialPost(process.argv[2],process.argv[3]);
} else {
    receive({
        ipns: true,
        nodeid: "post_pollen",
    }, async cid => {
        for (const platform of ["twitter", "instagram", "telegram", "facebook", "youtube", "linkedin"]) {
            console.log("posting", cid, "to", platform);
            console.log("social post result", await socialPost(platform, cid));
            console.log("done");
        }
    }, 
    "");
    console.log("listening to publish of inseminated topic and posting to social")
}