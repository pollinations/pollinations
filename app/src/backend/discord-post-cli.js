import webhook from "webhook-discord"
import { receive } from "./ipfs/receiver"


const FAILED_PUBSUB_TOPIC = "failed_pollen"

const webhookURL = process.env["DISCORD_WEBHOOK"]


if (!webhookURL) {
    console.error("DISCORD_WEBHOOK env variable not set")
    process.exit(1)
}

const hook = new webhook.Webhook(webhookURL);


(async () => {

    const receiveStream = receive({
        ipns: true,
        nodeid: FAILED_PUBSUB_TOPIC,
    }, async cid => {
        console.log("got failed cid",cid)
        hook.err("failed_pollen", `http://pollinations.ai/p/${cid}`)
        return cid
    }, "")
    for await (const cid of receiveStream) {
        console.log("Failed", cid)
    }
    console.log(`listening to publish of "${FAILED_PUBSUB_TOPIC}" topic and posting to discord`)
})();


