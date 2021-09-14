
import { create, globSource } from "ipfs-http-client";
import { toPromise, callLogger, toPromise1, noop, retryException } from "./utils.js";
import { CID } from "multiformats/cid";
import cacheInput, { cacheOutput, cleanCIDs } from "./contentCache.js";
import reachable from "is-port-reachable";
import { AbortController } from 'native-abort-controller';


import Debug from "debug";
import { last } from "ramda";

import { join } from "path";

import {Channel} from 'queueable';
import awaitSleep from "await-sleep";
import { isNode } from "browser-or-node";

const debug = Debug("ipfsConnector")


export const ipfsGlobSource = globSource;


const IPFS_HOST = "https://ipfs.pollinations.ai";


// create a new IPFS session
export async function getClient() {
    const url = await getIPFSDaemonURL();
    debug("Got daemon URL", url);
    const client = create({ url, timeout: "2h" });
    return client;
}

// basic IPFS read access
export async function reader(client) {
    return {
        ls: async cid => await ipfsLsCID(client, cid),
        get: async cid => await ipfsGet(client, cid),
    }
}

// const nodeID =  nodeid || (await client.id()).id;
    
// debug("NodeID", nodeID);


export async function writer(client, initialRootCID=null) {
    
    const mfsRoot = `/tmp_${Math.round(Math.random() * 100000)}`;

    const getRootCID = async () => await getCID(client, mfsRoot);

    let rootCid = await getRootCID();

    debug("existing root CID", rootCid);
    if (rootCid === null) {
        if (initialRootCID === null) {
            debug("Creating mfs root since it did not exist.");
            await ipfsMkdir(client, mfsRoot);
        } else {
            debug("Copying supplied rootCID", initialRootCID,"to MFS root.");
            await ipfsCp(client, initialRootCID, mfsRoot);
        }
        rootCid = await getRootCID();
        debug("new root CID", rootCid);
    } else {
        debug("Checking if supplied cid is the same as root cid")
        if (rootCid !== initialRootCID) {
            debug("CIDs are different. Removing existing  MFS root");
            await ipfsRm(client, mfsRoot);
            debug("Copying", rootCid, "to mfs root.")
            await ipfsCp(client, rootCid, mfsRoot);
        }
    }

    return getWriter(client, mfsRoot);
}


function getWriter(client, mfsRoot) {

    const joinPath = path => join(mfsRoot, path);

    const returnRootCID = func => async (...args) => {
        await func(...args);
        return await getCID(client, mfsRoot);
    };

    return {
        add: returnRootCID(async (path, content, options) => await ipfsAdd(client, joinPath(path), content, options)),
        addFile: returnRootCID(async (path, localPath, options) => await ipfsAddFile(client, joinPath(path), localPath, options)),
        rm: returnRootCID(async (path) => await ipfsRm(client, joinPath(path))),
        mkDir: returnRootCID(async (path) => await ipfsMkdir(client, joinPath(path))),
        cid:  async () => await getCID(client, mfsRoot),
        close: async () => await ipfsRm(client, mfsRoot),
    };
}


// frequency at which to send heartbeats vis pubsub
const HEARTBEAT_FREQUENCY = 15;

const localIPFSAvailable = async () => {
    if (isNode) {
        return await reachable(5001);
    } else {

        // If a local IPFS node is running it breaks pollinations
        // for some reason. O it's just really slow to connect to
        // the other nodes. A flag on in localStorage needs to be
        // set for now to use a local node
        if (!localStorage.localIPFS)
            return false;

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


const ipfsCp = async (client, cid, ipfsPath) => {
  debug("Copying from ",`/ipfs/${cid}`, "to", ipfsPath);
  return await retryException(async () => await client.files.cp(`/ipfs/${cid}`, ipfsPath));
}



export const getWebURL = (cid, name = null) => {
    const filename = name ? `?filename=${name}` : '';
    return `https://pollinations.ai/ipfs/${cid}${filename}`
};

export const getIPNSURL = (id) => {
    return `https://pollinations.ai/ipns/${id}`;
};

const stripSlashIPFS = cidString => { debug("stripSlash", cidString); return cidString.replace("/ipfs/", "") };
const firstLine = s => s.split("\n")[0];

export const stringCID = file => firstLine(stripSlashIPFS(file instanceof Object && "cid" in file ? file.cid.toString() : (CID.asCID(file) ? file.toString() : (file instanceof Buffer ? file.toString() : file))));

const _normalizeIPFS = ({ name, path, cid, type }) => ({ name, path, cid: stringCID(cid), type });

const ipfsLsCID = async (client, cid) => {
    debug("calling ipfs ls with cid", cid);
    const result = (await toPromise(client.ls(stringCID(cid))))
        .filter(({ type, name }) => type !== "unknown" && name !== undefined)
        .map(_normalizeIPFS);
    debug("got ipfs ls result", result);
    return result;
};

const ipfsLs = async (client, path) => ipfsLsCID(client, await getCID(path));


const ipfsAdd = async (client, path, content, options = {}) => {
    debug("adding", path, "options", options);
    const cid = stringCID(await retryException(
        async () => await client.add(content, options)
    ));
    debug("added", cid);


    try {
        debug("Trying to delete", path);
        await client.files.rm(path, { recursive: true });
    } catch {
        debug("Could not delete. Probably did not exist.")
    };
    debug("copying to", path);
    try {
        await client.files.cp(`/ipfs/${cid}`, path, { create: true });
    } catch (e) {
        debug("couldn't copy. file probably existed for some reason");
    }
    return cid;
};

export const ipfsGet = cleanCIDs((async (client, cid, { onlyLink = false }) => {

    const _debug = debug.extend(`ipfsGet(${cid})`);


    if (onlyLink)
        return getWebURL(cid);

    const chunks = await all(client.cat(cid))

    _debug("Got all chunks. Total:", chunks.length);

    const contentArray = Buffer.concat(chunks);

    // const contentArray = Buffer.concat(await toPromise(client.get(cid)));
    _debug("Received content length:", contentArray.length);
    // debug("Content type",contentArray)
    return contentArray;
}));

const ipfsAddFile = async (client,  ipfsPath, localPath) => {
    debug("Adding file", localPath, "to", ipfsPath);
    await retryException(async () => await ipfsAdd(client, ipfsPath, globSource(localPath, { preserveMtime: true, preserveMode: true })));
}

async function ipfsMkdir(client, path) {
    debug("Creating folder", path);
    try {
        await client.files.mkdir(path, { parents: true });
    } catch (e) {
        debug("couldn't create folder because it probably already exists", e)
    }
    return await client.files.stat(path);
}

async function ipfsRm(client, path) {
    debug("Deleting", path);
    await client.files.rm(path,{ force: true, recursive: true });
}

async function getCID(client, path = "/") {
    try {
        return stringCID(await client.files.stat(path));
    } catch (e) {
        debug("Couldn't get CID for path", path,". Assuming it doesn't exist and returning null");
        return null;
    }
}

let _lastContentID = null;




// create a publisher that sends periodic heartbeats as well as contentid updates
export function publisher(client, nodeID=null, suffix = "/output") {
    
    debug("Creating publisher for", nodeID, suffix);

    const _publish = async cid => {
        await publish(client, nodeID, cid, suffix, nodeID);
    };

    const handle = setInterval(() => {
        publishHeartbeat(client, suffix, nodeID);
    }, HEARTBEAT_FREQUENCY * 1000);

    const close = () => {
        clearInterval(handle);
    };

    return { publish: _publish, close };
}

async function publishHeartbeat(client, suffix, nodeID) {

    if (nodeID === "ipns") 
        return;
    
    debug("publishing heartbeat to", nodeID, suffix);

    await client.pubsub.publish(nodeID + suffix, "HEARTBEAT");
}

async function publish(client, nodeID, rootCID, suffix = "/output") {


    if (_lastContentID === rootCID) {
        debug("Skipping publish of rootCID since its the same as before", rootCID)
        return;
    }
    _lastContentID = rootCID;

    debug("publish pubsub", nodeID, rootCID);

    if (nodeID === "ipns")
        await experimentalIPNSPublish(client, rootCID);
    else
        await client.pubsub.publish(nodeID + suffix, rootCID)
}


let abortPublish = null;

async function experimentalIPNSPublish(client, rootCID) {
    debug("publishing to ipns...", rootCID);
    if (abortPublish)
        abortPublish.abort();
    abortPublish = new AbortController();
    await client.name.publish(rootCID, { signal: abortPublish.signal, allowOffline: false })
        .then(() => {
            debug("published...", rootCID);
            abortPublish = null;
        })
        .catch(e => {
            debug("exception on publish.", e);
        });
}

export async function subscribeGenerator(client, nodeID = null, suffix = "/input") {

    const channel = new Channel();
    const topic = nodeID + suffix;
   
    debug("Subscribing to pubsub events from", topic);

    const unsubscribe = subscribeCID(client, topic,
        cid => channel.push(cid)
    );
    return [channel, unsubscribe];
}

export function subscribeCID(client, nodeID = null, callback) {
    
    let lastHeartbeatTime = new Date().getTime();

    return subscribeCallback(client, nodeID, message => {
        if (message === "HEARTBEAT") {
            const time = new Date().getTime();
            debug("Heartbeat from pubsub. Time since last:", (time - lastHeartbeatTime) / 1000);
            lastHeartbeatTime = time;
        } else {
            callback(message);
        }
    });
};

function subscribeCallback(client, nodeID, callback) {
    const abort = new AbortController();
    // let interval = null;
    (async () => {
        const onError = async (...errorArgs) => {
            debug("onError", ...errorArgs, "aborting");
            abort.abort();
            await awaitSleep(300);
            debug("resubscribing")
            await doSub();
        };

        const handler = ({ data }) => {
            const message = new TextDecoder().decode(data)
            callback(message);
        }

        const doSub = async () => {
            try {
                abort.abort();
                debug("Executing subscribe", _nodeID);
                await client.pubsub.subscribe(nodeID, (...args) => handler(...args), { onError, signal: abort.signal, timeout: "1h" });
            } catch (e) {
                debug("subscribe error", e, e.name);
                if (e.name === "DOMException") {
                    debug("subscription was aborted. returning");
                    return;
                }

                if (e.message?.startsWith("Already subscribed"))
                    return;
                await awaitSleep(300);
                await doSub();
            }
        };
        doSub();
        // if (interval)
        //     clearInterval(interval);
        // interval = setInterval(doSub, 30000);
    })();

    return () => {
        debug("subscribe abort was called");
        abort.abort();
        // if (interval)
        //     clearInterval(interval);
    };
}


const ipfsResolve = async (client,path) =>
    stringCID(last(await toPromise(client.name.resolve(path, { nocache: true }))));


// test();