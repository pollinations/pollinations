
import { create, globSource } from "ipfs-http-client";
import { toPromise, callLogger, toPromise1, noop, retryException } from "./utils.js";
import CID from "cids";
import cacheInput, { cacheOutput, cleanCIDs } from "./contentCache.js";
import reachable from "is-port-reachable";
import { AbortController } from 'native-abort-controller';
import all from "it-all";

import Debug from "debug";
import Asyncify from 'callback-to-async-iterator';

import { last } from "ramda";

import limit from "../utils/concurrency.js";
import { join } from "path";

import options from "../backend/options.js";

import { Channel } from 'queueable';
import awaitSleep from "await-sleep";
import { isNode } from "browser-or-node";

const asyncify = typeof Asyncify === "function" ? Asyncify : Asyncify.default;

export const ipfsGlobSource = globSource;

const debug = Debug("ipfsConnector")


const IPFS_HOST = "https://ipfs.pollinations.ai";

export const mfsRoot = `/tmp_${Math.round(Math.random()*10000)}/`;


const localIPFSAvailable = async () => {
    if (isNode) {
        return await reachable(5001);
    } else {
        try {
            // The fllowing line will return 404 if the port is open,
            // otherwise it will throw an exception.
            await fetch("http://localhost:5001", { mode: 'no-cors' })
            return true;
        } catch (e) {
            return false;
        }
    }
}

const getIPFSDaemonURL = async () => {
    if (await localIPFSAvailable()) {
        debug("Ipfs at localhost:5001 is reachable. Connecting...");
        return "http://localhost:5001";
    }
    debug("localhost:5001 is not reachable. Connecting to", IPFS_HOST);
    return IPFS_HOST;
}


const ipfsDaemonURL = getIPFSDaemonURL();

export const client = ipfsDaemonURL.then(create);
export const nodeID = client.then(async client => options.nodeid || (await client.id()).id);

(async () => {
    debug("NodeID", await nodeID);
    // window.client = await client;
})();

export async function getCID(ipfsPath = "/") {
    ipfsPath = join(mfsRoot, ipfsPath);
    const cid = stringCID(await client.files.stat(ipfsPath));
    debug("Got CID", cid, "for path", ipfsPath);
    return cid;
}


export const getWebURL = (cid, name = null) => {
    const filename = name ? `?filename=${name}` : '';
    const imgFBFixHack = name && name.toLowerCase().endsWith(".png") ? "/image.png" : "";
    return `https://pollinations.ai/ipfs/${cid}${imgFBFixHack}${filename}`
};

export const getIPNSURL = (id) => {
    return `https://pollinations.ai/ipns/${id}`;
};

const stripSlashIPFS = cidString => cidString.replace("/ipfs/", "");
const firstLine = s => s.split("\n")[0];

export const stringCID = file => firstLine(stripSlashIPFS(file instanceof Object && "cid" in file ? file.cid.toString() : (CID.isCID(file) ? file.toString() : (file instanceof Buffer ? file.toString():file ))));

const _normalizeIPFS = ({ name, path, cid, type }) => ({ name, path, cid: stringCID(cid), type });

export const ipfsLs = async cid => {
    debug("calling ipfs ls with cid", cid);
    const result = (await toPromise((await client).ls(stringCID(cid))))
    .filter(({ type, name }) => type !== "unknown" && name !== undefined)
    .map(_normalizeIPFS);
    debug("got ipfs ls result",result);
    return result;
};



export const ipfsAdd = cacheInput(limit(async (ipfsPath, content, options = {}) => {
    const _client = await client;
    ipfsPath = join(mfsRoot, ipfsPath);
    debug("adding", ipfsPath, "options",options);
    const cid = stringCID(await retryException(
        async () => await _client.add(content, options)
    ));
    debug("added", cid, "size", content);


    try {
        debug("Trying to delete", ipfsPath);
        await _client.files.rm(ipfsPath, { recursive: true });
    } catch {
        debug("Could not delete. Probably did not exist.")
    };
    debug("copying to", ipfsPath);
    try {
        await _client.files.cp(`/ipfs/${cid}`, ipfsPath, { create: true });
    } catch (e) {
        debug("couldn't copy. file probably existed for some reason");
    }
    return cid;
}));

export const ipfsGet = limit(cleanCIDs((async (cid, { onlyLink = false }) => {

    const _debug = debug.extend(`ipfsGet(${cid})`);


    if (onlyLink)
        return getWebURL(cid);

    const chunks = await all((await client).cat(cid))

    _debug("Got all chunks. Total:", chunks.length);

    const contentArray = Buffer.concat(chunks);

    // const contentArray = Buffer.concat(await toPromise(client.get(cid)));
    _debug("Received content length:", contentArray.length);
    // debug("Content type",contentArray)
    return contentArray;
})));

export const ipfsAddFile = async (ipfsPath, localPath, options = { size: null }) => {

    await ipfsAdd(ipfsPath, globSource(localPath, { preserveMtime: true, preserveMode: true }));
}

export async function ipfsMkdir(path = "/") {
    const withMfsRoot = join(mfsRoot, path);
    debug("Creating folder", withMfsRoot);
    try {
        await (await client).files.mkdir(withMfsRoot, { parents: true });
    } catch (e) {
        debug("couldn't create folder because it probably already exists", e)
    }
    return path;
}

export async function ipfsRm(ipfsPath) {
    ipfsPath = join(mfsRoot, ipfsPath);
    debug("Deleting", ipfsPath);
    await (await client).files.rm(ipfsPath, { force: true })
}

export async function contentID(mfsPath = "/") {
    const _client = await client;
    mfsPath = join(mfsRoot, mfsPath);
    return stringCID(await _client.files.stat(mfsPath));
}

let _lastContentID = null;


let abortPublish = null;

export async function publish(rootCID, suffix = "/output") {
    if (_lastContentID === rootCID) {
        debug("Skipping publish of rootCID since its the same as before", rootCID)
        return;
    }
    _lastContentID = rootCID;
    const _client = await client;
    debug("publish pubsub", await nodeID, rootCID);
    await _client.pubsub.publish((await nodeID) + suffix, rootCID)
    // experimentalIPNSPublish(rootCID, _client);
}


function experimentalIPNSPublish(rootCID, _client) {
    debug("publishing to ipns...", rootCID);
    if (abortPublish)
        abortPublish.abort();
    abortPublish = new AbortController();
    _client.name.publish(rootCID, { signal: abortPublish.signal, allowOffline: true })
        .then(() => {
            debug("published...", rootCID);
            abortPublish = null;
        })
        .catch(e => {
            debug("exception on publish.", e);
        });
}

export async function subscribeCID(_nodeID = null, suffix = "/input") {
    if (_nodeID === null)
        _nodeID = await nodeID;

    const channel = new Channel();
    const topic = _nodeID + suffix;
    debug("Subscribing to pubsub events from", topic);
    const unsubscribe = subscribeCIDCallback(topic,
        cid => channel.push(cid)
    );
    return [channel, unsubscribe];
}


export function subscribeCIDCallback(_nodeID = null, callback) {
    const abort = new AbortController();

    (async () => {
        const _client = await client;
        if (_nodeID === null)
            _nodeID = await nodeID;


        debug("Subscribing to pubsub events from", _nodeID);

        const onError = async (...errorArgs) => {
            debug("onError", ...errorArgs, "aborting");
            abort.abort();
            await awaitSleep(300);
            debug("resubscribing")
            await doSub();
        };

        const handler = ({ data }) => callback(new TextDecoder().decode(data));

        const doSub = async () => {
            try {
                debug("Executing subscribe", _nodeID)
                await _client.pubsub.subscribe(_nodeID, handler, { onError, signal: abort.signal });
            } catch (e) {
                debug("subscribe error", e, e.name);
                if (e.name === "DOMException") {
                    debug("subscription was aborted. returning");
                    return;
                }

                if (e.message?.startsWith("Already subscribed"))
                    return;
                await awaitSleep(300);
                doSub();
            }
        };
        doSub();
    })();

    return () => {
        debug("subscribe abort was called");
        abort.abort();
    };
}


export const ipfsResolve = async path =>
    stringCID(last(await toPromise((await client).name.resolve(path, { nocache: true }))));




