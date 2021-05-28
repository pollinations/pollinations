import Debug from "debug";
import { noop } from "./utils";
const debug = Debug("localColabConnection");
const colabConnectionManager = async (onNodeID = noop) => {
    debug("Initializing Connection Manager");
    let nodeID = null;
    const colabChannel = new BroadcastChannel("colabconnection");
    colabChannel.postMessage("get_nodeid");
    colabChannel.onmessage = async ({ data: newNodeID }) => {

        if (newNodeID === "get_nodeid") {
            debug("Received get_nodeid. Maybe we shuldnt't be...");
            return;
        }

        if (newNodeID === nodeID) {
            debug("Received same nodeID again. Ignoring...", newNodeID);
            return;
        }

        debug("old", nodeID, "new", newNodeID, "equal", nodeID === newNodeID)

        nodeID = newNodeID;
        onNodeID(nodeID);
    }


    // debug(await toPromise1(client.get(inputs[0].path)));

}

export default colabConnectionManager;
