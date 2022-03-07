import { writer } from "../network/ipfsConnector"
import { publisher } from "../network/ipfsPubSub"
import { receive } from "./ipfs/receiver"

const PUBSUB_TOPIC = "done_pollen"

const FAILED_PUBSUB_TOPIC = "failed_pollen"

const message = process.argv[2]
const failed = process.argv[3] === "failed"

if (message) {
    publishMessage(PUBSUB_TOPIC, message)

    if (failed)
        publishMessage(FAILED_PUBSUB_TOPIC, message)
        
} else {

    (async () => {
        const { pin } = writer();
        const receiveStream = receive({
            ipns: true,
            nodeid: "done_pollen",
        }, async cid => {
            console.log("pinning result", await pin(cid))
        }, "")
        for await (const cid of receiveStream) {
            console.log("Received", cid)
        }
        console.log(`listening to publish of "${PUBSUB_TOPIC}" topic and pinning`)
    })();

}

function publishMessage(topic, message) {
    const { publish, close } = publisher(topic, "")
    async function run() {
        await publish(message)
        close()
    }
    run()
}
