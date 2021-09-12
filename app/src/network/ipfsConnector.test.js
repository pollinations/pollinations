import Debug from "debug";
import {getClient, writer, reader} from "./ipfsConnector"
import assert from "assert";
const debug = Debug("ipfsConnector:test");

// RUN until getting create-react-app tests to work:
// watch "esbuild --bundle --platform=node --external:fsevents --external:electron  src/network/ipfsConnector.test.js | DEBUG=* node" --interval 1

// test that when we add a file the CID changes and when we remove it again the CID is the same as before
// both when starting from an existing CID or from a scratch
const testAddingAndRemovingFileYieldsSameCID = async () => {
    const client = await getClient();
    await testNestedAdd(client, null);
    await testNestedAdd(client, "QmXvVm72RDU4h9BS92R1UvFECK3JkQNWKMNcSExVvbkp2A");
    await testAddRemove(client, null, "/bla");
    await testAddRemove(client, "QmXvVm72RDU4h9BS92R1UvFECK3JkQNWKMNcSExVvbkp2A", "/input/bla");
}

testAddingAndRemovingFileYieldsSameCID();


// test that when we add a file the CID changes and when we remove it again the CID is the same as before
async function testAddRemove(client, startCID,filepath) {
    const { add, rm, cid, close } = await writer(client, startCID);
    const initialCid = await cid();
    assert(startCID === null || initialCid === startCID);
    debug("Initial CID: ", initialCid, ". Adding file to", filepath);
    const newCID = await add(filepath, "blubb");
    debug("New CID: ", newCID);
    assert(newCID !== initialCid);
    debug("Deleting /bla");
    const deletedCID = await rm(filepath);
    debug("Got deleted CID", deletedCID);
    assert(deletedCID === initialCid);
    await close();
}


// test adding a nested subdirectory
async function testNestedAdd(client, startCID, folder="/folder") {
    const { add, rm, cid, close, mkDir } = await writer(client, startCID);
    const initialCid = await cid();
    assert(startCID === null || initialCid === startCID);

    debug("Initial CID: ", initialCid, ". Adding folder", folder);
    
    const newCID = await mkDir(folder);
    debug("New CID", newCID);
    assert(newCID !== initialCid);

    const newCID2 = await add(folder + "/bla", "blubb");

    assert(newCID2 !== newCID !== initialCid);


    const shouldBeInitialCID = await rm(folder);
    debug("shouldBeInitial", shouldBeInitialCID);
    assert(shouldBeInitialCID === initialCid);
    await close();

}
