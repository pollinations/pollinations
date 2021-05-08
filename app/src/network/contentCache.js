import CID from "cids";
import { stringCID } from "./ipfsConnector.js";

const _contentCache = new Map();

export function cacheOutput(cidFunc) {

    const cachingFunc = async (cid, ...args) => {
            if (_contentCache.has(cid))
                return _contentCache.get(cid);
            const result = await Promise.resolve(cidFunc(cid, ...args));
            _contentCache.set(cid, result);
            return result
    };
    return cleanCIDs(cachingFunc);
}

export default function cacheInput(funcThatExpectsCID) {
    const cachingFunc = async (content, ...args) => {
            const cid = stringCID(await Promise.resolve(funcThatExpectsCID(content, ...args)));
            _contentCache.set(cid, content);
            return cid;
    };
    return cleanCIDs(cachingFunc);
}

export const cleanCIDs = cidFunc => async (cid, ...args) => {
    const result = await cidFunc(stringCID(cid), ...args);
    return CID.isCID(result) ? result.toString() : result;
}