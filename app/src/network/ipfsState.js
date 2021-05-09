

import client, { globSource, nodeID, getCID, stringCID, ipfsLs, ipfsMkdir, ipfsAdd } from "./ipfsConnector.js";
import Debug from "debug";
import { toPromise } from "./utils.js";
import { zip } from "ramda";
import { cacheOutput } from "./contentCache.js";

const debug = Debug("ipfsState");


export const getIPFSState = (contentID, processFile) => {
    debug("Getting state for CID", contentID)
    return _getIPFSState({ cid: contentID, name:".", type: "dir", path: ""}, processFile)
}

const _getIPFSState = cacheOutput(async ({ cid, type, name, path }, processFile) => {
    cid = stringCID(cid);
    debug("Getting state for", type, name, path, cid);
    if (type === "dir") {
        const files = await ipfsLs(cid);
        debug("Got files for", name, cid, files);
        const filenames = files.map(({ name }) => name);
        const contents = await Promise.all(files.map(
            file => _getIPFSState({...file, path: path+"/"+file.name}, processFile)
        ));
        return Object.fromEntries(zip(filenames, contents));
    
    }
     

    if (type === "file") {
        const fileResult = await processFile({ cid, path, name });
        return fileResult;
    }

    throw `Unknown file type "${type}" encountered. Path: "${path}", CID: "${cid}".`;
});


