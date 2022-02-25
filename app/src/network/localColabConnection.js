import Debug from "debug";
import throttle from "lodash.throttle";
import { noop } from "./utils";
const debug = Debug("localColabConnection");


// opens a BroadcastChannel to handshake with the Colab node
const colabConnectionManager = async (onNodeInfo = noop) => {
    debug("Initializing Connection Manager");

    const colabChannel = new BroadcastChannel("colabconnection");
    colabChannel.postMessage("get_nodeid");
    colabChannel.onmessage = throttle(async ({ data }) => {
        onNodeInfo(data);
    }, 10000)
}

export default colabConnectionManager;
