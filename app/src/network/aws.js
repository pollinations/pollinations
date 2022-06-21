import Debug from "debug";

const debug = Debug("Aws.js");
const API_URL = "https://worker-prod.pollinations.ai/pollen/"


export async function submitToAWS(values, ipfsWriter, notebook="pollinations/preset-envisioning") {
    debug ("onSubmit", values)  

    // in real life submit parameters do IPFS and return the folder hash
    const contentID = await UploadInputstoIPFS(values, ipfsWriter);

    // debug payload
    let payload = {
     notebook,
      "ipfs": contentID
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