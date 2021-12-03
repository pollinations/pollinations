
import Debug from "debug";
import { create, globSource } from "ipfs-http-client";
import all from "it-all";
import { CID } from "multiformats/cid";
import { basename, dirname, join } from "path";
import { last } from "ramda";
import { AUTH, toPromise } from "./utils.js";




const debug = Debug("ipfsConnector")

const IPFS_HOST = "https://pollinations-ipfs-api.zencraft.studio";

let _client = null;

const base64Decode = s => Buffer.from(s, "base64").toString("utf8");

const Authorization = base64Decode(AUTH);

// create a new IPFS session
export function getClient() {
    if (!_client) {
        _client = getIPFSDaemonURL().then(url => create({
            url, timeout: "2h", headers: {
                Authorization
            }
        }))
    }
    return _client;
}


// basic IPFS read access
export async function reader() {
    const client = await getClient();
    return {
        ls: async cid => await ipfsLsCID(client, cid),
        get: async (cid, options = {}) => await ipfsGet(client, cid, options)
    }
}

// randomly assign a temporary folder in the IPFS mutable filesystem
// in the future ideally we'd be running nodes in the browser and on colab and could work in the root
const mfsRoot = `/tmp_${Math.round(Math.random() * 1000000)}`;



// Create a writer to modify the IPFS state
// It creates a temporary folder in the IPFS mutable filesystem 
// so calling close is important
export function writer(initialRootCID = null) {

    const joinPath = path => join(mfsRoot, path);

    let initializedFolder = false;

    // initialize the writer lazily, calls the function and finally return the root CID
    const returnRootCID = func => async (...args) => {
        const client = await getClient();
        // lazily initialize the MFS folder
        if (!initializedFolder) {
            await initializeMFSFolder(client, initialRootCID);
            initializedFolder = true;
        }

        // execute function
        await func(...args);

        // return the root CID
        return await getCID(client, mfsRoot);
    };

    const methods = {
        add: returnRootCID(async (path, content, options) => await ipfsAdd(await getClient(), joinPath(path), content, options)),
        addFile: returnRootCID(async (path, localPath, options) => await ipfsAddFile(await getClient(), joinPath(path), localPath, options)),
        rm: returnRootCID(async (path) => await ipfsRm(await getClient(), joinPath(path))),
        mkDir: returnRootCID(async (path) => await ipfsMkdir(await getClient(), joinPath(path))),
        cid: async () => {
            if (!initializedFolder)
                return null;
            return await getCID(await getClient(), mfsRoot)
        },
        close: async () => {
            debug("closing input writer. Deleting", mfsRoot)
            if (initializedFolder)
                await ipfsRm(await getClient(), mfsRoot)
        },
        pin: async cid => await ipfsPin(await getClient(), cid)
    }

    // const methodsWithRetry = mapObjIndexed(retryException, methods)

    return methods; //WithRetry
}


// Initializes a folder in `mfsRoot` with the given CID
async function initializeMFSFolder(client, initialRootCID) {

    const getRootCID = async () => await getCID(client, mfsRoot);

    let rootCid = await getRootCID();
    debug("existing root CID", rootCid);

    if (rootCid === null) {
        if (initialRootCID === null) {
            debug("Creating mfs root since it did not exist.");
            await ipfsMkdir(client, mfsRoot);
        } else {
            debug("Copying supplied rootCID", initialRootCID, "to MFS root.");
            await ipfsCp(client, initialRootCID, mfsRoot);
        }
        rootCid = await getRootCID();
        debug("new root CID", rootCid);
    } else {
        debug("Checking if supplied cid is the same as root cid");
        if (rootCid !== initialRootCID) {
            debug("CIDs are different. Removing existing  MFS root");
            await ipfsRm(client, mfsRoot);
            debug("Copying", rootCid, "to mfs root.");
            await ipfsCp(client, rootCid, mfsRoot);
        }
    }
}


const localIPFSAvailable = async () => {
    return false;
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
    debug("Copying from ", `/ipfs/${cid}`, "to", ipfsPath);
    return await client.files.cp(`/ipfs/${cid}`, ipfsPath);
}

const ipfsPin = async (client, cid) => {
    debug("Pinning", cid);
    return await client.pin.add(cid, { recursive: true });
}

export const getWebURL = (cid, name = null) => {
    const filename = name ? `?filename=${name}` : '';
    return `https://pollinations-ipfs-gateway.zencraft.studio/ipfs/${cid}${filename}`
};

export const getIPNSURL = (id) => {
    return ` https://pollinations-ipfs-gateway.zencraft.studio/ipfs/ipns/${id}`;
};

const stripSlashIPFS = cidString => {
    if (!cidString)
        throw new Error("CID is falsy");
    return cidString.replace("/ipfs/", "")
};

const firstLine = s => s.split("\n")[0];

export const stringCID = file => firstLine(stripSlashIPFS(file instanceof Object && "cid" in file ? file.cid.toString() : (CID.asCID(file) ? file.toString() : (file instanceof Buffer ? file.toString() : file))));

const _normalizeIPFS = ({ name, path, cid, type }) => ({ name, path, cid: stringCID(cid), type });

const ipfsLsCID = async (client, cid) => {
    cid = await optionallyResolveIPNS(client, cid);
    debug("calling ipfs ls with cid", cid);
    const result = (await toPromise(client.ls(stringCID(cid))))
        .filter(({ type, name }) => type !== "unknown" && name !== undefined)
        .map(_normalizeIPFS);
    debug("got ipfs ls result", result);
    return result;
}


const ipfsAdd = async (client, path, content, options = {}) => {
    debug("adding", path, "options", options);
    let cid = null;
    try {
        cid = stringCID(await client.add(content, options));
    } catch (e) {
        debug("could not add file", path, "becaus of", e.message, ". Maybe the content was deleted before it could be added?");
        return null;
    }

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

const ipfsGet = async (client, cid, { onlyLink = false }) => {

    const _debug = debug.extend(`ipfsGet(${cid})`);

    cid = await optionallyResolveIPNS(client, cid);

    const chunkArrays = await all(client.cat(cid));

    const chunks = chunkArrays.map(Buffer.from);

    _debug("Got all chunks. Total:", chunks.length);
    if (chunks.length === 0)
        return Buffer.from([]);

    const contentArray = chunks.length > 1 ? Buffer.concat(chunks) : chunks[0];

    // const contentArray = Buffer.concat(await toPromise(client.get(cid)));
    _debug("Received content length:", contentArray.length);
    // debug("Content type",contentArray)
    return contentArray;
};

const ipfsAddFile = async (client, ipfsPath, localPath) => {
    debug("Adding file", localPath, "to", ipfsPath);
    // get filename from path
    const filename = basename(localPath);
    const folder = dirname(localPath);
    await ipfsAdd(client, ipfsPath, globSource(folder, filename, { preserveMtime: true, preserveMode: true }))
}

async function optionallyResolveIPNS(client, cid) {
    debug("Trying to resolve CID", cid)
    if (cid.startsWith("/ipns"))
        cid = await ipfsResolve(client, cid);
    return cid;
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
    try {
        await client.files.rm(path, { force: true, recursive: true });
    } catch (e) {
        debug(`couldn't delete "${path}"  because it probably doesn't exist`, e)
    }
}

async function getCID(client, path = "/") {
    try {
        return stringCID(await client.files.stat(path));
    } catch (e) {
        debug("Couldn't get CID for path", path, ". Assuming it doesn't exist and returning null");
        return null;
    }
}

const ipfsResolve = async (client, path) =>
    stringCID(last(await toPromise(client.name.resolve(path, { nocache: true }))));


// test();