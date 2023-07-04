import fs from 'fs';
import crypto from 'crypto';
// import memoize from 'lodash.memoize';

export const cacheGeneratedImages = (imageGeneratorFn, saveFolder = "/tmp/stableDiffusion_cache") => {
  // create folder if it doesn't exist

  if (!fs.existsSync(saveFolder)) {
    fs.mkdirSync(saveFolder);
  }


  const cachedFunc =  async  (prompt, extraParams, ...args) => {
    // const sanitizedPrompt = prompt.replace(/[^a-zA-Z0-9]/g, "_");
    // allow foreign language characters
    const sanitizedPrompt = prompt.replaceAll("/", "_").replaceAll(" ", "_")
      .replaceAll("?", "_").replaceAll("!", "_").replaceAll(":", "_")
      .replaceAll(";", "_").replaceAll("(", "_").replaceAll(")", "_")
      .replaceAll("’", "_").replaceAll("“", "_").replaceAll("”", "_")
      .replaceAll("‘", "_").replaceAll("…", "_").replaceAll("—", "_")
      .slice(0, 50)
      .toLowerCase();
    
    // calculate 4 byte hash of prompt

    const hash = crypto.createHash('md5').update(prompt + JSON.stringify(extraParams)).digest("hex").slice(0, 4);

    // create a filename from the prompt
    const path = saveFolder + "/" + sanitizedPrompt+"_" + hash + ".jpg";
    // if file exists return it
    if (fs.existsSync(path)) {
      console.log("file exists, returning it", path);
      // read file
      return fs.readFileSync(path);
    }

    // generate image
    const buffer = await imageGeneratorFn(prompt, extraParams, ...args);

    // write buffer to file
    console.log("writing file", path);
    fs.writeFileSync(path, buffer);

    return buffer;
  };

  return  memoize(cachedFunc, (prompt, extraParams) => prompt + "-" + JSON.stringify(extraParams));

};


const memoize = (fn, getKey) => {
  const cache = {};
  return (...args) => {
    const key = getKey(...args);

    if (cache[key]) {
      return cache[key];
    }

    const result = fn(...args);

    cache[key] = result;

    return result;
  };
};


// bash one-liner to rename all .png files in a folder to .jpg
// for f in *.png; do mv -- "$f" "${f%.png}.jpg"; done