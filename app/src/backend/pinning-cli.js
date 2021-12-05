import { writer } from "../network/ipfsConnector";
import { publisher } from "../network/ipfsPubSub";
import { receive } from "./ipfs/receiver";
import { sendToDiscord } from "./sendDiscord";

const PUBSUB_TOPIC = "done_pollen";

if (process.argv[2]) {
    const { publish, close } = publisher(PUBSUB_TOPIC,"");
    async function run() {
        await publish(process.argv[2]);
        close();
    }
    run();
} else {

    (async () => {
        const { pin } = writer();
        receive({
            ipns: true,
            nodeid: "done_pollen",
        }, async cid => {
            console.log("pinning result", await pin(cid));  
            console.log("Sending to discord")
            await sendToDiscord(`done_pollen: https://pollinations.ai/ipfs/${cid}`)
            console.log("Sent to discord")
        }, "")
        console.log(`listening to publish of "${PUBSUB_TOPIC}" topic and pinning`)
    })();

}