
import Client from "ipfs-http-client";
import { toPromise, callLogger, toPromise1 } from "./utils.js";

import debug from "debug";
import CID from "cids";
import { cacheOutput, cleanCIDs } from "./contentCache.js";


export const nodeID = "thomashmac" + Math.floor(Math.random() * 10000);

debug("NodeID", nodeID)

const IPFS_HOST = "18.157.173.110";

export const ipfsPeerURL = `http://${IPFS_HOST}:5002`;

debug("Connecting to IPFS", ipfsPeerURL);

export const client = Client(ipfsPeerURL);

export default client;
export const globSource = Client.globSource;
export const files = client.files;

export async function getCID(ipfsPath = "/") {
    const cid = stringCID(await client.files.stat(ipfsPath));
    debug("Got CID", cid, "for path", ipfsPath);
    return cid;
}

export const getWebURL = cid => `http://${IPFS_HOST}:9090/ipfs/${stringCID(cid)}`;

export const stringCID = file => "cid" in file ? file.cid.toString() : (CID.isCID(file) ? file.toString() : file);

const _ipfsLs = async cid => await toPromise(client.ls(stringCID(cid)));

export const ipfsLs = callLogger(cacheOutput(_ipfsLs));


export const ipfsAdd = async (content, ipfsPath = null) => {
    const cid = stringCID(await client.add(content));
    debug("added", cid, "Content type", typeof content);

    if (ipfsPath) {
        debug("copying to", ipfsPath);
        await client.files.cp(`/ipfs/${cid}`, ipfsPath, { create: true });
    } else {
        debug("No destination given. Not copying to MFS.");
    }
    return cid;
}

export const ipfsGet = cleanCIDs(cacheOutput(async (cid, onlyLink = false) => {
    debug("Downloading remote file:", cid);

    if (onlyLink)
        return getWebURL(cid);

    const { content } = await toPromise1(client.get(cid));
    debug("Got content reference. Downloading...");
    const contentArray = await toPromise1(content);
    debug("Received content length:", contentArray.length, typeof contentArray);
    return new TextDecoder().decode(contentArray);
}));

export const ipfsAddFile = async (localPath, ipfsPath = null) =>
    ipfsAdd(globSource(localPath), ipfsPath);


export async function ipfsMkdir(path) {
    await client.mkdir(path, { parents: true });
    return path;
}

