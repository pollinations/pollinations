import Debug from "debug";
import React from "react";

const debug = Debug("Aws.js");
const API_URL = "https://worker-prod.pollinations.ai/pollen/"


export async function submitToAWS(values, ipfsWriter) {
    debug ("onSubmit", values)  

    // in real life submit parameters do IPFS and return the folder hash
    const ipfs_hash = await UploadInputstoIPFS(values, ipfsWriter);

    // debug payload
    let payload = {
      "notebook": "envisioning",
      "ipfs": ipfs_hash
    };
      
    try {
      const response = await fetch(
          API_URL, { 
          method: "POST",
          mode: 'cors',
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify(payload)
        }
      );
      const data = await response.json();
      debug("json response", data)
      return data.pollen_id
    } catch (error) {
      debug("fetch error", error)
      return error
    }
  }


async function UploadInputstoIPFS(values, { add, mkDir, cid}){
  debug("adding values to ipfs", values)
  
  await mkDir("/input")
  for (let key in values) {
    await add(`/input/${key}`, values[key])
  }

  return await cid()
}