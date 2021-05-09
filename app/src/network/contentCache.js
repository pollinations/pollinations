import CID from "cids";
import { stringCID } from "./ipfsConnector.js";

import Debug from "debug";
const debug = Debug("contentCache");

const _contentCache = new Map();

export function cacheOutput(funcThatFetchesCID) {

    const cachingFunc = async (cidOrFile, ...args) => {
            const cid = stringCID(cidOrFile);
            debug("cacheOutput, checking if cache contains:",cid,"arguments:",...args);
            if (_contentCache.has(cid)) {
                debug("cacheOutput. Cache HIT.");
                return _contentCache.get(cid);
            }
            debug("Cache MISS. Running function...",funcThatFetchesCID.name,"with cid", cidOrFile, "and args", ...args);
            const result = await Promise.resolve(funcThatFetchesCID(cidOrFile, ...args));
            _contentCache.set(cid, result);
            return result
    };
    return cleanCIDs(cachingFunc);
}

export default function cacheInput(funcThatGeneratesCID) {
    const cachingFunc = async (content, ...args) => {
            const cid = stringCID(await Promise.resolve(funcThatGeneratesCID(content, ...args)));
            debug("Adding", cid, "to cache.");
            _contentCache.set(cid, content);
            return cid;
    };
    return cleanCIDs(cachingFunc);
}

export const cleanCIDs = cidFunc => async (cidOrFile, ...args) => {
    const cidOrFileCleaned = CID.isCID(cidOrFile) ? cidOrFile.toString() : cidOrFile;
    const result = await cidFunc(cidOrFileCleaned, ...args);
    return CID.isCID(result) ? result.toString() : result;
}


// setInterval(()=> {
//     debug("Cache state:",_contentCache)
// },10000);