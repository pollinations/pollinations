import Debug from "debug";
import { noop } from "./utils";
const debug = Debug("localColabConnection");
const colabConnectionManager = async (onNodeID = noop, onContentID = noop) => {
    debug("Initializing Connection Manager");
    let nodeID = null;
    const colabChannel = new BroadcastChannel("colabconnection");
    colabChannel.postMessage("get_nodeid");
    colabChannel.onmessage = async ({ data: nodeAndContentID }) => {

        if (nodeAndContentID === "get_nodeid") {
            debug("Received get_nodeid. Maybe we shuldnt't be...");
            return;
        }
        const [newNodeID, contentID] = nodeAndContentID.split(",");

        if (newNodeID === "get_nodeid" || newNodeID === nodeID)
            return;

        debug("old", nodeID, "new", newNodeID, "equal", nodeID === newNodeID,"contentID",contentID)

        nodeID = newNodeID;
        onNodeID(nodeID);
        onContentID(contentID);
    }


    // debug(await toPromise1(client.get(inputs[0].path)));

}

export default colabConnectionManager;
