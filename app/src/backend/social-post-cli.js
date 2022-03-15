import { publisher } from "../network/ipfsPubSub";
import { socialPost } from "./functions/social-post";
import { receive } from "./ipfs/receiver";

const PUBSUB_TOPIC = "post_pollen";

if (process.argv[2]) {

    const { publish, close } = publisher(PUBSUB_TOPIC, "");
    async function run() {
        await publish(process.argv[2]);
        close();
    }
    run();
} else {
    const receiveStream = receive({
        ipns: true,
        nodeid: "post_pollen",
    }, async cid => {
        for (const platform of ["twitter", "instagram", "facebook", "youtube", "linkedin"]) {
            console.log("posting", cid, "to", platform);
            console.log("social post result", await socialPost(platform, cid));
            console.log("done");
        }
    },
        "");
    console.log(`listening to publish of "${PUBSUB_TOPIC}" topic and posting to social`);
    (async function run() {
        for await (const cid of receiveStream) {
            console.log("Received", cid);
        }
    })();
}