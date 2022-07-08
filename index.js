import http from 'http';
import { submitToAWS } from '@pollinations/ipfs/aws.js';
import { writer } from '@pollinations/ipfs/ipfsConnector.js';
import { subscribeGenerator } from '@pollinations/ipfs/ipfsPubSub.js';
import { IPFSWebState } from '@pollinations/ipfs/ipfsWebClient.js';
import { parse }  from 'url';
import urldecode from 'urldecode';



const requestListener = async function (req, res) {


  const { path } = parse(req.url, true);

  console.log("path: ", path);

  if (!path.startsWith("/prompt")) {
    res.writeHead(404);
    res.end('404: Not Found');
    return
  }

  const promptRaw = path.split("/prompt/")[1];
  
  const prompt = urldecode(promptRaw).replaceAll("_", " ");

  
  console.log("!!!!submitted prompt", prompt)
  const inputWriter = writer();
  const response = await submitToAWS({prompt,num: 1}, inputWriter, "voodoohop/dalle-playground", true)

  console.log("submitted to aws", response)
  const { nodeID } = response

  const [cids, unsubscribe] = subscribeGenerator(nodeID, "/output");

  for await (const cid of cids) {
    console.log("!!!!received response",cid)
    const data = await IPFSWebState(cid);
    const done = JSON.parse(data?.output?.done)
    console.log("!!!!received response",done, data)
    //res.write(cid);
    if (done) {
        unsubscribe()
        console.log("unsubscribed")
        
        const outputEntries = Object.entries(data?.output)
        
        // find the first entry whose key ends with .png
        const [_filename, url] = outputEntries.find(([key]) => key.endsWith(".png"))
        
        res.writeHead(301, {
          Location: url
        }).end();
        break
    }
  }



}

const server = http.createServer(requestListener);
server.listen(8080);
