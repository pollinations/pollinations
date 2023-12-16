import { runModel as runModelUncached } from '@pollinations/ipfs/ipfsWebClient.js';
import urldecode from 'urldecode';

import memoize from 'lodash.memoize';
import fetch from 'node-fetch';

'use strict';

// Serverless function

export const hello = async (pathname) => {
  
  console.error("path: ", pathname);

  if (!pathname.startsWith("/prompt")) {
    return {
      statusCode: 404,
      body: '404: Not Found'
    }
  }

  // const { showImage, finish } = gifCreator(res);

  // await showImage("https://i.imgur.com/lTAeMmN.jpg");

  const promptAndSeed = pathname.split("/prompt/")[1];
  
  const [promptRaw, seed] = promptAndSeed.split("/");

  const prompt = urldecode(promptRaw).replaceAll("_", " ");

  const url = await runModel({
    prompts:prompt, 
    seed: seed || 0,
    num_interpolation_steps: 1,
  }, "pollinations/stable-diffusion-private")

  console.error("Showing image: ", url);
  // await showImage(url);

  // finish()


  // fetch the image and return it to the response
  const image = await fetch(url);
  const buffer = await image.buffer();


  console.error("finishing")

  return {
    statusCode: 200,
    body: buffer,
    headers: {
      "Content-Type": "image/jpeg"
    }
  };

  // Use this code if you don't use the http event with the LAMBDA-PROXY integration
  // return { message: 'Go Serverless v1.0! Your function executed successfully!', event };
};



const runModel = memoize(runModelUncached, params => JSON.stringify(params))

