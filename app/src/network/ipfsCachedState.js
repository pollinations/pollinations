

import client from "./ipfsConnector.js";
import Debug from "debug";
import { toPromise } from "./utils.js";

const debug = Debug("ipfsCachedState");

const contentCache = new Map();


export const getIPFSState = (contentID, processFile) => {
    debug("Getting state for CID", contentID)
    return getIPFSStateCached(contentCache, client, { cid: contentID, name:".", type: "dir" }, processFile)
}

const getIPFSStateCached = async (contentCache, client, { cid, type, name }, processFile) => {
    cid = cid.toString();
    debug("Requesting cached state for",type,name,cid);
    if (contentCache.has(cid)) {
        const res = contentCache.get(cid);
        debug("Contentcache get",res);
        return res;
    }
    if (type === "dir") {
        debug("Running ls on CID", cid)
        const files = await toPromise(client.ls(cid));
        debug("Got files for", name, cid);
        const dirResult = await Promise.all(files.map(
            file => getIPFSStateCached(contentCache, client, file, processFile)
        ));
        contentCache.set(cid, dirResult);
        return dirResult;
    }

    if (type === "file") {
        const fileResult = await processFile({ cid, name });
        contentCache.set(cid, fileResult);
        return fileResult
    }

    throw `Unknown file type "${type}" encountered. Name: "${name}", CID: "${cid}".`;
}



export async function cacheIPFSPath(ipfsPath, content=null) {
    content = content || ipfsPath;
    debug("createIPFSPath", ipfsPath, " Content:", content)
    const { cid } = await client.files.stat(ipfsPath);
    cacheSet(cid.toString(), content);
    return content;
}

// export const cacheSet = (cid, value = null) => {
//     if (value === null)
//         contentCache.delete(cid);
//     else
//         contentCache.set(cid, value);
// }

// export const cacheGet = cid =>
//     contentCache.get(cid);
