import http from 'http';
import { submitToAWS } from '@pollinations/ipfs/aws.js';
import { writer } from '@pollinations/ipfs/ipfsConnector.js';
import { subscribeGenerator } from '@pollinations/ipfs/ipfsPubSub.js';
import { IPFSWebState } from '@pollinations/ipfs/ipfsWebClient.js';
import { parse }  from 'url';
import fetch from 'node-fetch';
import urldecode from 'urldecode';
import memoize from 'lodash.memoize';



const requestListener = async function (req, res) {


  const { pathname } = parse(req.url, true);

  console.log("path: ", pathname);

  if (!pathname.startsWith("/prompt")) {
    res.writeHead(404);
    res.end('404: Not Found');
    return
  }

  res.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=31536000' });
  
  const promptAndSeed = pathname.split("/prompt/")[1];
  
  const [promptRaw, seed] = promptAndSeed.split("/");


  const prompt = urldecode(promptRaw).replaceAll("_", " ");

  const url = await getImage(prompt, seed)

  // fetch the image from the url and return it as the response
  const imageResponse = await fetch(url);
  const buffer = await imageResponse.buffer();

  res.end(buffer);

  // res.writeHead(301, {
  //   Location: url
  // }).end();

}

const getImage = memoize(async (prompt,seed) => {
    
  console.log("!!!!submitted prompt", prompt)
  const inputWriter = writer();
  const response = await submitToAWS({prompt,num: 1}, inputWriter, "voodoohop/dalle-playground", false)

  console.log("got pollen id from aws", response)
  const { nodeID } = response

  const [cids, unsubscribe] = subscribeGenerator(nodeID, "/output");

  for await (const cid of cids) {
  
    console.log("!!!!received response",cid)
    const data = await IPFSWebState(cid);
    console.log("!!!!received response", data)
  
    if (data?.output?.done) {
        unsubscribe()
        console.log("unsubscribed")
        
        const outputEntries = Object.entries(data?.output)
        
        // find the first entry whose key ends with .png
        const [_filename, url] = outputEntries.find(([key]) => key.endsWith(".png"))
        
        return url
    }
  }

}, (prompt, seed) => prompt + seed)


const server = http.createServer(requestListener);
server.listen(8080);
