
import Debug from "debug";
import { parse } from "json5";
import { extname } from "path";
import { getWebURL, writer } from "./ipfsConnector.js";
import { getIPFSState } from "./ipfsState.js";

const debug = Debug("ipfsWebClient")

// fetch json and texts files. convert media and other files to URLs pointing to the IPFS gateway
const fetchAndMakeURL = async ({ name, cid, text }) => {

    const ext = extname(name);
    const doImport = shouldImport(ext);
    debug("ext", ext, "extIsJSON", doImport);
    const webURL = getWebURL(cid, name);
    if (doImport) {
        const textContent = await text();

        try {
            const json = parse(textContent);
            if (typeof json === "object") 
                Object.defineProperty(json, ".cid", { value: cid });
            return json;
        } catch (_e) {
            debug("result was not json. returning raw.")
            return textContent;
        }

    } else {
        return webURL;
    }
}

// Return IPFS state. Converts all JSON/text content to objects and binary cids to URLs.
export const IPFSWebState = (contentID, skipCache = false) => {
    debug("Getting state for CID", contentID)
    return getIPFSState(contentID, fetchAndMakeURL, skipCache);
}

export const getWriter = cid => {
    debug("getting input writer for cid", cid);
    const w = writer(cid);

    // try to close the writer when window is closed
    const previousUnload = window.onbeforeunload;
    window.onbeforeunload = () => {
        previousUnload && previousUnload();
        w.close();
        return undefined;
    };

    return w;
}

// Update /input of ipfs state with new inputs (from form probably)
export const updateInput = async (inputWriter, inputs) => {

    debug("updateInput", inputs);
    debug("removing output")
    await inputWriter.rm("output")
    await inputWriter.rm("input")
    await inputWriter.mkDir("input")
    debug("Triggered dispatch. Inputs:", inputs, "cid before", await inputWriter.cid())

    // this is a bit hacky due to some wacky file naming we are doing
    // will clean this up later
    const writtenFiles = []

    for (const [key, val] of Object.entries(inputs)) {

        debug("processing input", key, val)
        const path = "input/" + key

        // If the key contains an ipfs url or has copy it directly into the folder
        if (typeof val === "object") {
            
            debug("found folder", key, val)
            
            const cid = val[".cid"]

            debug("cid", cid)

            if (cid) {
                await inputWriter.rm(`input/${key}`)
                await inputWriter.cp(`input/${key}`, cid)
            } else {
                await inputWriter.add(path, JSON.stringify(val))
            }
        } else {
            await inputWriter.add(path, JSON.stringify(val))
        }
            
    }

    const cid = await inputWriter.cid()
    debug("cid after adding inputs", cid)
    return cid
}

// only download json files, notebooks and files without extension (such as logs, text, etc)
function shouldImport(ext) {
    return ext.length === 0 || ext.toLowerCase() === ".json" || ext.toLowerCase() === ".ipynb" || ext.toLowerCase() === ".md";
}

