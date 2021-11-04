import { writer } from "../network/ipfsConnector";
import { receive } from "./ipfs/receiver";


if (process.argv[2] && process.argv[3]) {
    socialPost(process.argv[2],process.argv[3]);
} else {
    (async () => {
        const { pin } = await writer();
        receive({
            ipns: true,
            nodeid: "done_pollination",
        }, async cid => {
            await pin(cid);
        }, "");
        console.log("listening to publish of inseminated topic and posting to social")
    })();
}