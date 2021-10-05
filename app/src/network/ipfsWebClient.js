
import {  getWebURL, writer } from "./ipfsConnector.js"
import { extname } from "path";

import Debug from "debug";
import { getIPFSState } from "./ipfsState.js";
import { parse } from "json5";

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
export const IPFSWebState = contentID => {
    debug("Getting state for CID", contentID)
    return getIPFSState(contentID, fetchAndMakeURL);
}

export const getInputWriter = async (rootCID) => {
    const input  = await getIPFSState(rootCID);
    debug("getting input writer for cid", input[".cid"]);
    return writer(input[".cid"]);
}

// Update /input of ipfs state with new inputs (from form probably)
export const updateInput = async (inputWriter, inputs) => {
    debug("updateInput", inputs);

    debug("Triggered dispatch. Inputs:", inputs, "cid before", await inputWriter.cid());
    for (let [key, val] of Object.entries(inputs)) {
        // check if value is a string and base64 encoded file and convert it to a separate file input
        if (typeof val === "string" && val.startsWith("data:")) {
            debug("Found base64 encoded file", key);
            const mimeType = val.split(";")[0].split(":")[1];
            const filename = key + "." + mimeType.split("/")[1];
            const fileContent = val.split(",")[1];
            // convert fileContent to buffer
            const buffer = Buffer.from(fileContent, "base64");
            debug("Writing file", filename);
            await inputWriter.add(filename, buffer);
            val = `input/${filename}`;
        }
        await inputWriter.add(key, JSON.stringify(val))
    };
    return await inputWriter.cid();
};

// only download json files, notebooks and files without extension (such as logs, text, etc)
function shouldImport(ext) {
    return ext.length === 0 || ext.toLowerCase() === ".json" || ext.toLowerCase() === ".ipynb" || ext.toLowerCase() === ".md";
}

