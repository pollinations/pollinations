import { AbortController } from 'native-abort-controller';

import awaitSleep from 'await-sleep';
import Debug from 'debug';
import { getClient } from './ipfsConnector';

const debug = Debug('ipfs:pubsub');


// frequency at which to send heartbeats vis pubsub
const HEARTBEAT_FREQUENCY = 15;


// create a publisher that sends periodic heartbeats as well as contentid updates
export function publisher(nodeID=null, suffix = "/output") {

    debug("Creating publisher for", nodeID, suffix);

    const _publish = async cid => {
        const client = await getClient();
        await publish(client, nodeID, cid, suffix, nodeID);
    };

    const handle = setInterval(async () => {
        const client = await getClient();
        publishHeartbeat(client, suffix, nodeID);
    }, HEARTBEAT_FREQUENCY * 1000);

    const close = () => {
        clearInterval(handle);
    };

    return { publish: _publish, close };
}

async function publishHeartbeat(client, suffix, nodeID) {

    if (nodeID === "ipns") 
        return;
    
    debug("publishing heartbeat to", nodeID, suffix);

    await client.pubsub.publish(nodeID + suffix, "HEARTBEAT");
}

async function publish(client, nodeID, rootCID, suffix = "/output") {


    if (_lastContentID === rootCID) {
        debug("Skipping publish of rootCID since its the same as before", rootCID)
        return;
    }
    _lastContentID = rootCID;

    debug("publish pubsub", nodeID, rootCID);

    if (nodeID === "ipns")
        await experimentalIPNSPublish(client, rootCID);
    else
        await client.pubsub.publish(nodeID + suffix, rootCID)
}


let abortPublish = null;

async function experimentalIPNSPublish(client, rootCID) {
    debug("publishing to ipns...", rootCID);
    if (abortPublish)
        abortPublish.abort();
    abortPublish = new AbortController();
    await client.name.publish(rootCID, { signal: abortPublish.signal, allowOffline: false })
        .then(() => {
            debug("published...", rootCID);
            abortPublish = null;
        })
        .catch(e => {
            debug("exception on publish.", e);
        });
}

export async function subscribeGenerator(client, nodeID = null, suffix = "/input") {

    const channel = new Channel();
    const topic = nodeID + suffix;
   
    debug("Subscribing to pubsub events from", topic);

    const unsubscribe = subscribeCID(client, topic,
        cid => channel.push(cid)
    );
    return [channel, unsubscribe];
}

export async function subscribeCID(nodeID, callback) {
    const client = await getClient();
    let lastHeartbeatTime = new Date().getTime();

    return subscribeCallback(client, nodeID, message => {
        if (message === "HEARTBEAT") {
            const time = new Date().getTime();
            debug("Heartbeat from pubsub. Time since last:", (time - lastHeartbeatTime) / 1000);
            lastHeartbeatTime = time;
        } else {
            callback(message);
        }
    });
};

function subscribeCallback(client, nodeID, callback) {
    const abort = new AbortController();
    // let interval = null;
    (async () => {
        const onError = async (...errorArgs) => {
            debug("onError", ...errorArgs, "aborting");
            abort.abort();
            await awaitSleep(300);
            debug("resubscribing")
            await doSub();
        };

        const handler = ({ data }) => {
            const message = new TextDecoder().decode(data)
            callback(message);
        }

        const doSub = async () => {
            try {
                abort.abort();
                debug("Executing subscribe", nodeID);
                await client.pubsub.subscribe(nodeID, (...args) => handler(...args), { onError, signal: abort.signal, timeout: "1h" });
            } catch (e) {
                debug("subscribe error", e, e.name);
                if (e.name === "DOMException") {
                    debug("subscription was aborted. returning");
                    return;
                }

                if (e.message?.startsWith("Already subscribed"))
                    return;
                await awaitSleep(300);
                await doSub();
            }
        };
        doSub();
        // if (interval)
        //     clearInterval(interval);
        // interval = setInterval(doSub, 30000);
    })();

    return () => {
        debug("subscribe abort was called");
        abort.abort();
        // if (interval)
        //     clearInterval(interval);
    };
}
