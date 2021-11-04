import { socialPost } from "./functions/social-post"
import { receive } from "./ipfs/receiver";


if (process.argv[2] && process.argv[3]) {
    socialPost(process.argv[2],process.argv[3]);
} else {
    receive({
        ipns: true,
        nodeid: "inseminated",
    }, async cid => {
        for (const platform of ["twitter", "instagram", "telegram", "facebook", "youtube", "linkedin"]) {
            console.log("posting", cid, "to", platform);
            await socialPost(platform, cid);
            console.log("done");
        }
    });
    console.error("Please supply a content id as argument.");
}