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

  const promptRaw = pathname.split("/prompt/")[1];
  
  const prompt = urldecode(promptRaw).replaceAll("_", " ");

  const url = await getImage(prompt)

  // fetch the image from the url and return it as the response
  const imageResponse = await fetch(url);
  const buffer = await imageResponse.buffer();
  res.writeHead(200, { 'Content-Type': 'image/png' });
  res.end(buffer);

  // res.writeHead(301, {
  //   Location: url
  // }).end();

}

const getImage = memoize(async prompt => {
    
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
        
        return url

        break
    }
  }

})


const server = http.createServer(requestListener);
server.listen(8080);
