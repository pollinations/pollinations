import Debug from "debug";
import { noop } from "./utils";
const debug = Debug("localColabConnection");


// opens a BroadcastChannel to handshake with the Colab node
const colabConnectionManager = async (onNodeInfo = noop) => {
    debug("Initializing Connection Manager");

    const colabChannel = new BroadcastChannel("colabconnection");
    colabChannel.postMessage("get_nodeid");
    colabChannel.onmessage = async ({ data }) => {
        onNodeInfo(data);
    }
}

export default colabConnectionManager;
