
export const toPromise = async asyncGen => {
    let contents = [];
    try {
        for await (const content of asyncGen) {
            contents = [...contents, content];
        }
    } catch (e) {
        console.log("Exception", e);
        return [undefined];
    }
    return contents;
}

export const toPromise1 = async asyncGen => (await toPromise(asyncGen))[0];

export const noop = () => null;

export const zip = (arr, ...arrs) => {
    return arr.map((val, i) => arrs.reduce((a, arr) => [...a, arr[i]], [val]));
  }

export const curry = (fn, ...oldArgs) => (...newArgs) => {
    const args = [...oldArgs, ...newArgs];
    return (args.length < fn.length) ? curry(fn, ...args) : fn(...args);
};

export const displayContentID = contentID => contentID ? contentID.toString().slice(-4) : "None";
