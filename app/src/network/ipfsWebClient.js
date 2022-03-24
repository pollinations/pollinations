
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
            return parse(textContent);
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

export const getWriter = ipfs => {
    debug("getting input writer for cid", ipfs[".cid"]);
    const w = writer(ipfs[".cid"]);

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
    debug("Triggered dispatch. Inputs:", inputs, "cid before", await inputWriter.cid())

    // this is a bit hacky due to some wacky file naming we are doing
    // will clean this up later
    const writtenFiles = []

    for (let [key, val] of Object.entries(inputs)) {
        // check if value is a string and base64 encoded file and convert it to a separate file input
        if (typeof val === "string" && val.startsWith("data:")) {

            // Parse file details from data url
            debug("Found base64 encoded file", key);
            // const mimeType = val.split(";")[0].split(":")[1];
            const filename = val.split(";")[1].split("=")[1]
            const fileContent = val.split(",")[1]

            // convert fileContent to buffer
            const buffer = Buffer.from(fileContent, "base64")
            const path = "input/" + filename

            debug("Writing file", filename)
            await inputWriter.add(path, buffer)

            // We should not need to reference the absolute path here.
            // Will fix on the pollinator side later
            val = `/content/ipfs/input/${filename}`
            writtenFiles.push(path)
        }

        const path = "input/" + key
        if (!writtenFiles.includes(path))
            await inputWriter.add(path, JSON.stringify(val))
    }

    return await inputWriter.cid()
}

// only download json files, notebooks and files without extension (such as logs, text, etc)
function shouldImport(ext) {
    return ext.length === 0 || ext.toLowerCase() === ".json" || ext.toLowerCase() === ".ipynb" || ext.toLowerCase() === ".md";
}

