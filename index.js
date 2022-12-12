import { runModel as runModelUncached } from '@pollinations/ipfs/ipfsWebClient.js';
import http from 'http';
import { parse } from 'url';
import urldecode from 'urldecode';

import memoize from 'lodash.memoize';
import fetch from 'node-fetch';
import { cache } from './cache.js';


const runModel = memoize(cache(runModelUncached), params => JSON.stringify(params))

const requestListener = async function (req, res) {

  const { pathname } = parse(req.url, true);

  console.log("path: ", pathname);

  if (!pathname.startsWith("/prompt")) {
    res.writeHead(404);
    res.end('404: Not Found');
    return
  }
  res.writeHead(200, { 'Content-Type': 'image/jpeg' });
  // const { showImage, finish } = gifCreator(res);

  // await showImage("https://i.imgur.com/lTAeMmN.jpg");

  const promptAndSeed = pathname.split("/prompt/")[1];
  
  const [promptRaw, seed] = promptAndSeed.split("/");

  const prompt = urldecode(promptRaw).replaceAll("_", " ");

  const url = await runModel( {
    prompts: prompt, 
    num_interpolation_steps: 1,  
    // seed: seed || 0
  }, "614871946825.dkr.ecr.us-east-1.amazonaws.com/pollinations/stable-diffusion-private")

  console.log("Showing image: ", url);
  // await showImage(url);

  // finish()


  // fetch the image and return it to the response
  const image = await fetch(url);
  const buffer = await image.buffer();
  res.write(buffer);

  console.log("finishing")
  res.end();

}


const server = http.createServer(requestListener);
server.listen(8080);


