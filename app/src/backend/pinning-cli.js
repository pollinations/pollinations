import { writer } from "../network/ipfsConnector";
import { receive } from "./ipfs/receiver";


(async () => {
    const { pin } = await writer();
    receive({
        ipns: true,
        nodeid: "done_pollination",
    }, async cid => {
        console.log("pinning result", await pin(cid));
    }, "");
    console.log("listening to publish of inseminated topic and pinning")
})();
