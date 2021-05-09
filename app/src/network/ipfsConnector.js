
import Client from "ipfs-http-client";
import { toPromise, callLogger, toPromise1 } from "./utils.js";
import CID from "cids";
import cacheInput, { cacheOutput, cleanCIDs } from "./contentCache.js";

import Debug from "debug";
const debug=Debug("ipfsConnector")

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

export const getWebURL = cid => `/ipfs/${stringCID(cid)}`;

export const stringCID = file => file instanceof Object && "cid" in file ? file.cid.toString() : (CID.isCID(file) ? file.toString() : file);

const _ipfsLs = async cid => await toPromise(client.ls(stringCID(cid)));

export const ipfsLs = callLogger(cacheOutput(_ipfsLs),"ipfsls");


export const ipfsAdd = cacheInput(async (content, ipfsPath = null) => {
    const cid = stringCID(await client.add(content));
    debug("added", cid, "size", content.length);

    if (ipfsPath) {
        debug("copying to", ipfsPath);
        await client.files.cp(`/ipfs/${cid}`, ipfsPath, { create: true });
    } else {
        debug("No destination given. Not copying to MFS.");
    }
    return cid;
});

export const ipfsGet = cleanCIDs((async (cid, onlyLink = false) => {
    debug("Downloading remote file:", cid);

    if (onlyLink)
        return getWebURL(cid);

    const { content } = await toPromise1(client.get(cid));
    debug("Got content reference. Downloading...");
    const contentArray = await toPromise1(content);
    debug("Received content length:", contentArray.length, typeof contentArray);
    // debug("Content type",contentArray)
    return contentArray;
}));

export const ipfsAddFile = async (localPath, ipfsPath = null) =>
    ipfsAdd(globSource(localPath), ipfsPath);


export async function ipfsMkdir(path="/") {
    debug("Creating folder", path);
    await client.files.mkdir(path, { parents: true });
    return path;
}

export async function ipfsRm(ipfsPath) {
    debug("Deleting",ipfsPath);
    await client.files.rm(ipfsPath,{force:true})
}

export async function contentID(mfsPath="/") {
    return stringCID(await client.files.stat(mfsPath));
}
