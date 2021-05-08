

import { toPromise, toPromise1, noop, zip, useHash } from "./utils"
import { client, getWebURL} from "./ipfsConnector.js"
import { extname } from "path";


import Debug from "debug";
const debug = Debug("ipfsClient")


const contentCache = new Map();

const getIPFSStateCached = async (contentCache, client, { cid, type, name }) => {
    if (contentCache.has(cid))
        return contentCache.get(cid);
    let result = null;

    if (type === "dir") {
        const files = await toPromise(client.ls(cid));
        const filenames = files.map(({ name }) => name);
        const fileContents = await Promise.all(files.map(file => getIPFSStateCached(contentCache, client, file)));
        result = Object.fromEntries(zip(filenames, fileContents));
    }

    if (type === "file") {
        if (extname(name).length === 0) {
            const { content } = await toPromise1(client.get(cid))
            const contentArray = await toPromise1(content);
            result = new TextDecoder().decode(contentArray);
        } else
            result = getWebURL(cid);
    }

    if (result === null)
        throw "Unknown IPFS entry";

    contentCache.set(cid, result);
    return result;
}

export const getIPFSState = contentID => {
    debug("Getting state for CID", contentID)
    return getIPFSStateCached(contentCache, client, { cid: contentID, type: "dir" })
}

export const stateReducer = [
    (state, newState) => {
        debug("Merging", newState, "into", state)
        let mergedState = {
            ...state,
            ...newState
        };
        debug("Merging result", mergedState);
        return mergedState;
    }, {
        nodeID: null,
        contentID: null,
        ipfs: {}
    }];

export const addInputContent = async (contentID, { inputs }) => {
    debug("Triggered dispatch. Inputs:", inputs, "cid before", contentID);
    for (const [key, val] of Object.entries(inputs)) {

        //debug(`${state.contentID}/input`, key);

        // debug(await client.files.cp(`/ipfs/${state.contentID}`,"/"));
        // const {cid:mfsCid} = await client.files.stat("/");
        // debug("mfscid",mfsCid);
        // state = {...state, contentID: mfsCid};
        // onState(state);

        const { cid: inputCid } = await getCidOfPath(contentID, "input");
        // const {cid: valueCid} = await getCidOfPath(inputCid, key);
        const tmpInputCid = await client.object.patch.rmLink(inputCid, { name: key });
        debug({ tmpInputCid })
        const { cid: addedCid } = await client.add(val);
        //debug("AddedCID", addedCid, tmpInputCid)
        //debug("LsInput", await toPromise(client.ls(tmpInputCid)))
        debug("adding", contentID, { Hash: addedCid, name: key })
        const newInputCid = await client.object.patch.addLink(tmpInputCid, { Hash: addedCid, name: key });

        const removedInputCid = await client.object.patch.rmLink(contentID, { name: "input" });
        debug("addlink2", removedInputCid, { Hash: newInputCid, name: "input" })
        const newContentID = await client.object.patch.addLink(removedInputCid, { Hash: newInputCid, name: "input" });
        // debug("newIpfs",await getState(client,  { cid: newInputCid, type: "dir"}))
        contentID = newContentID.toString();
    };
    return contentID;

};


export const publish = (client, nodeID, newContentID) => {
    client.pubsub.publish(nodeID, newContentID)
}


export const getCidOfPath = async (client, dirCid, path) => {
    debug("getCifOfPath", dirCid, path);
    return (await toPromise(client.ls(dirCid))).find(({ name }) => name === path);
}

// export default useColab;
