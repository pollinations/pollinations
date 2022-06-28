import Debug from "debug";

const debug = Debug("Aws.js");
const API_URL_DEV = "https://worker-dev.pollinations.ai/pollen/"
const API_URL_PROD = "https://worker-prod.pollinations.ai/pollen/"

export async function submitToAWS(values, ipfsWriter, notebook, dev=true) {
    debug ("onSubmit", values)  

    const API_URL = dev ? API_URL_DEV : API_URL_PROD
    // in real life submit parameters do IPFS and return the folder hash
    debug("uploading inputs to ipfs")
    const contentID = await UploadInputstoIPFS(values, ipfsWriter);

    // debug payload
    let payload = {
     notebook,
      "ipfs": contentID
    };
    
    debug("Uploaded input to IPFS, sending payload to AWS", payload)
    
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
      return {nodeID: data.pollen_id, contentID}
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