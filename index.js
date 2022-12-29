import http from 'http';

import memoize from 'lodash.memoize';
import { parse } from 'url';
import urldecode from 'urldecode';
import { cache } from './cache.js';

import { exec } from 'child_process';
import jimp from 'jimp';
import fetch from 'node-fetch';


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
  
  if (!promptAndSeed) {
    res.writeHead(404);
    res.end('404: Not Found');
    return
  }
  const [promptRaw, seedOverride] = promptAndSeed.split("/");

  const prompt = urldecode(promptRaw).replaceAll("_", " ");

  const response = await runModel(prompt);
  console.log("response: ", response)

  const base64Image = response["images"][0];

  // convert base64 image to buffer

  const buffer = Buffer.from(base64Image, 'base64');

  // add legend
  const legendText = "pollinations.ai";

  // use image.print of jimp to add text to the bottom of the image

  const imageWithLegend = await jimp.read(buffer);
  const font = await jimp.loadFont(jimp.FONT_SANS_32_BLACK);

  const textWidth = jimp.measureText(font, legendText);
  const textHeight = jimp.measureTextHeight(font, legendText, textWidth);

  const imageWidth = imageWithLegend.getWidth();
  const imageHeight = imageWithLegend.getHeight();

  const x = imageWidth - textWidth - 10;
  const y = imageHeight - 36;

  if (!seedOverride)
    imageWithLegend.print(font, x, y, legendText);
  
  const bufferWithLegend = await imageWithLegend.getBufferAsync(jimp.MIME_JPEG);

  res.write(bufferWithLegend);

  // res.write(buffer);

  console.log("finishing")
  res.end();

}

// dummy handler that  redirects all requests to the static image: https://i.imgur.com/emiRJ04.gif
const dummyListener = async function (req, res) {
  // return a 302 redirect to the static image
  res.writeHead(302, {
    'Location': 'https://i.imgur.com/DgRPBiJ.gif'
  });
  res.end();
}
  

const server = http.createServer(requestListener);
server.listen(8080);


// call rest api like this

// const body = {
//   "image": "replicate:pollinations/lemonade-preset",
//   "input": {
//       "image": await toBase64(image),
//       "styles": styles,
//       "num_images_per_style": num_images_per_style,
//       "strength": strength,
//       "gender": gender,
//       "ethnicity": ethnicity
//   }
// }

// const response = await fetch('https://rest.pollinations.ai/pollen', {
//   method: 'POST',
//   body: JSON.stringify(body),
//   headers: {
//       "Authorization": `Bearer ${document.querySelector('#token').value}`,
//       "Content-Type": "application/json"
//   }
// });

const callWebUI = async (prompt) => {

    // const body = {
    //   image: "614871946825.dkr.ecr.us-east-1.amazonaws.com/pollinations/pimped-diffusion",
    //   input: {
    //     prompt
    //   }
    // }

    const body = {
        "prompt": prompt,
        "steps": 30,
        "height": 384,
        "sampler_index": "Euler a",
        "negative_prompt": "empty, boring, blank space, black, dark, low quality, noisy, grainy, watermark, signature, logo, writing, text, person, people, human, baby, cute, young, simple, cartoon, face, uncanny valley, deformed, silly"
 
    }
  const response = await fetch('http://127.0.0.1:7862/sdapi/v1/txt2img', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: {
        "Content-Type": "application/json"
    }
  });

  return await response.json()
  
}


exec("./connect_reverse_ssh.sh", (error, stdout, stderr) => {
  if (error) {
      console.log(`error: ${error.message}`);
      return;
  }
  if (stderr) {
      console.log(`stderr: ${stderr}`);
      return;
  }
  console.log(`stdout: ${stdout}`);
})


const runModel = memoize(cache(callWebUI), params => JSON.stringify(params))
