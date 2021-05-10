

import client, { globSource, nodeID, getCID, stringCID, ipfsLs, ipfsMkdir, ipfsAdd } from "./ipfsConnector.js";
import Debug from "debug";
import { toPromise } from "./utils.js";
import { zip } from "ramda";
import { cacheOutput } from "./contentCache.js";
import { join } from "path";
import { flatMap, map } from "streaming-iterables";
import all from "it-all";
const debug = Debug("ipfsState");



export const getIPFSState = (contentID, processFile) => {
    debug("Getting state for CID", contentID)
    return _getIPFSState({ cid: contentID, name:"root", type: "dir", path: "/"}, processFile)
}

const _getIPFSState = cacheOutput(async ({ cid, type, name, path }, processFile) => {
    cid = stringCID(cid);
    const _debug = debug.extend(`_getIPFSState(${path})`);
    _debug("Getting state for", type, name, cid);
    if (type === "dir") {
        const files = await ipfsLs(cid);
        _debug("Got files for", name, cid, files);
        const filenames = files.map(({ name }) => name);
        const contents = await all(map(
            file => _getIPFSState({...file, path:  join(path,file.name)}, processFile)
            , files ));
        _debug("contents",contents);
        return Object.fromEntries(zip(filenames, contents));
    
    }
     

    if (type === "file") {
        const fileResult = await processFile({ cid, path, name });
        _debug("got result of processFile", fileResult);
        return fileResult;
    }

    throw `Unknown file type "${type}" encountered. Path: "${path}", CID: "${cid}".`;
});


