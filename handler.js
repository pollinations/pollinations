import awsModelRunner from '@pollinations/ipfs/awsModelRunner.js';
import urldecode from 'urldecode';

import memoize from 'lodash.memoize';
import { cache } from './cache.js';
import fetch from 'node-fetch';

'use strict';

// Serverless function

export const hello = async (pathname) => {
  
  console.log("path: ", pathname);

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
    text:prompt, 
    grid_size: 1,  
    intermediate_outputs: false,
    seed: seed || 0
  }, "pollinations/min-dalle", true)

  console.log("Showing image: ", url);
  // await showImage(url);

  // finish()


  // fetch the image and return it to the response
  const image = await fetch(url);
  const buffer = await image.buffer();


  console.log("finishing")

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



const runModel = memoize(awsModelRunner, params => JSON.stringify(params))

