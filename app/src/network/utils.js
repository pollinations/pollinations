
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
