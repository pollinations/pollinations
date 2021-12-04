
import Debug from "debug";
import awaitSleep from "await-sleep";
const debug = Debug("utils")

export const toPromise = async asyncGen => {
    let contents = [];
    try {
        for await (const content of asyncGen) {
            contents = [...contents, content];
        }
    } catch (e) {
        console.error("Exception", e);
        return [undefined];
    }
    return contents;
}

export const toPromise1 = async asyncGen => {
    debug("getting values of asyncGen");
    for await (const value of asyncGen) {
        debug("Got value",value)
        return value;
    }
    debug("No value found to convert to Promise");
    return null;
}

export const noop = () => null;

export const zip = (arr, ...arrs) => {
    return arr.map((val, i) => arrs.reduce((a, arr) => [...a, arr[i]], [val]));
  }

export const curry = (fn, ...oldArgs) => (...newArgs) => {
    const args = [...oldArgs, ...newArgs];
    return (args.length < fn.length) ? curry(fn, ...args) : fn(...args);
};


const shortenHash = (hash) => {
    if (typeof hash !== 'string') return "unknown hash type";
    return`${hash.slice(0,4)}...${hash.slice(-4)}`
};

export const displayContentID = contentID => contentID ? shortenHash(contentID.toString()) : "None";

export const callLogger = (f,name = null) => (...args) => {
    if (!name)
      name = f.name;
    const _debug = debug.extend(name);
    _debug("--- Calling ",name, "with input", ...args);
    _debug("--- In:", ...args);
    const output = f(...args);
    if (output instanceof Promise)
        output.then(out => _debug("--- Out:", name,":", out));
    else
        _debug("--- Out:", name,":", output);
    return output;
  }
  
  export const retryException = (f) => {
    return async (...args) => {
      let n = 5;
      while (n-- > 0) {
        try {
            return await f(...args);
        } catch (e) {
            debug(`retryException #${n}`, e);
            await awaitSleep(1000)
        }
      }
      throw new Error("Too many retries");
    }
}



export const AUTH = "QmFzaWMgY0c5c2JHbHVZWFJwYjI1ekxXWnliMjUwWlc1a09sWnJSazVIYVdZM1kxUjBVWGt6";

