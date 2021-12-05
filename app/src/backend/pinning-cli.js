import { writer } from "../network/ipfsConnector";
import { publisher } from "../network/ipfsPubSub";
import { receive } from "./ipfs/receiver";
import { sendToDiscord } from "./sendDiscord";


const Hook = new webhook.Webhook("https://discord.com/api/webhooks/916931514313351228/oP8RFRfDSqLbFIbroYMpWshXLA-kXcVF9HZ8b2bj2dIjj_5mCjsr2g74C-E4iWV7aXT9")



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
            sendToDiscord(cid)
        }, "");
        console.log(`listening to publish of "${PUBSUB_TOPIC}" topic and pinning`)
    })();

}