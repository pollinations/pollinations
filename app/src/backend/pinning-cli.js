import { writer } from "../network/ipfsConnector";
import { publisher } from "../network/ipfsPubSub";
import { receive } from "./ipfs/receiver";

if (process.argv[2]) {
    const { publish, close } = publisher("done_pollen","");
    async function run() {
        await publish(process.argv[2]);
        close();
    }
    run();
} else {

    (async () => {
        const { pin } = await writer();
        receive({
            ipns: true,
            nodeid: "done_pollen",
        }, async cid => {
            console.log("pinning result", await pin(cid));
        }, "");
        console.log("listening to publish of inseminated topic and pinning")
    })();

}