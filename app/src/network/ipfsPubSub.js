import awaitSleep from 'await-sleep';
import Debug from 'debug';
import { AbortController } from 'native-abort-controller';
import { Channel } from 'queueable';
import { getClient } from './ipfsConnector';
import { noop } from './utils';


const debug = Debug('ipfs:pubsub');


// frequency at which to send heartbeats vis pubsub
const HEARTBEAT_FREQUENCY = 12;


// create a publisher that sends periodic heartbeats as well as contentid updates
export function publisher(nodeID, suffix = "/output") {

    debug("Creating publisher for", nodeID, suffix);

    let lastPublishCID = null;

    const _publish = async cid => {
        const client = await getClient();
        await publish(client, nodeID, cid, suffix, nodeID);
        lastPublishCID = cid;
    };

    // const interval = setInterval(() => {
    //     if (lastPublishCID)
    //         _publish(lastPublishCID);
    // }, 5000);

    const sendHeartbeat = async () => {
        const client = await getClient();
        publishHeartbeat(client, suffix, nodeID);
    };

    const handle = setInterval(sendHeartbeat, HEARTBEAT_FREQUENCY * 1000);

    sendHeartbeat();

    const close = () => {
        debug("Closing publisher", handle);
        clearInterval(handle);
        // clearInterval(interval);
    };

    return {
        publish: _publish,
        close
    };
}

async function publishHeartbeat(client, suffix, nodeID) {

    if (nodeID === "ipns")
        return;

    // debug("publishing heartbeat to", nodeID, suffix);

    await client.pubsub.publish(nodeID + suffix, "HEARTBEAT");
}

async function publish(client, nodeID, rootCID, suffix = "/output") {

    debug("publish pubsub", nodeID + suffix, rootCID);

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

// Generate an async iterable by subscribing to CIDs from a specific node id and suffix
export function subscribeGenerator(nodeID, suffix = "/input") {

    const channel = new Channel();

    debug("Subscribing to pubsub events from", nodeID, suffix);

    const unsubscribe = subscribeCID(nodeID, suffix,
        cid => channel.push(cid)
    );
    return [channel, unsubscribe];
}


// Subscribe to a content ids from a nodeID and suffix. Callback is called with the content ids
// Also receives and logs heartbeats received from the publisher
export function subscribeCID(nodeID, suffix = "", callback, heartbeatDeadCallback = noop) {

    const { gotHeartbeat, closeHeartbeat } = heartbeatChecker(heartbeatDeadCallback);

    const unsubscribe = subscribeCallback(nodeID + suffix, message => {
        if (message === "HEARTBEAT") {
            gotHeartbeat();
        } else {
            callback(message);
        }
    });

    return () => {
        unsubscribe();
        closeHeartbeat();
    }
};

// if we don't receive a heartbeat from the publisher in 2 x HEARTBEAT_FREQUENCY seconds, 
// we assume the publisher is dead and call heartbeatDeadCallback
function heartbeatChecker(heartbeatStateCallback) {

    let lastHeartbeat = new Date().getTime();
    let heartbeatTimeout = null;

    function setHeartbeatTimeout() {
        heartbeatTimeout = setTimeout(() => {
            const timeSinceLastHeartbeat = (new Date().getTime() - lastHeartbeat) / 1000;
            debug("Heartbeat timeout. Time since last:", timeSinceLastHeartbeat);
            heartbeatStateCallback({ lastHeartbeat, alive: false });
        }, HEARTBEAT_FREQUENCY * 1.5 * 1000);
        // debug("Set heartbeat timeout. Waiting ", HEARTBEAT_FREQUENCY * 1.5, " seconds until next heartbeat");
    }

    const gotHeartbeat = () => {
        const time = new Date().getTime();
        debug("Heartbeat from pubsub. Time since last:", (time - lastHeartbeat) / 1000);
        lastHeartbeat = time;
        if (heartbeatTimeout)
            clearTimeout(heartbeatTimeout);
        heartbeatStateCallback({ alive: true });
        setHeartbeatTimeout();
    };

    const closeHeartbeat = () => {
        if (heartbeatTimeout)
            clearTimeout(heartbeatTimeout);
    };

    setHeartbeatTimeout();

    return { gotHeartbeat, closeHeartbeat }


}


// Subscribe to an ipfs topic with some rather ugly code to handle errors that probably don't even occur
function subscribeCallback(topic, callback) {
    const abort = new AbortController();
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
            const client = await getClient();
            try {
                abort.abort();
                debug("Executing subscribe", topic);
                await client.pubsub.subscribe(topic, (...args) => handler(...args), { onError, signal: abort.signal, timeout: "1h" });
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
    })();

    return () => {
        debug("subscribe abort was called");
        abort.abort();
    };
}


// Skips repeated calls to the same function with the same arguments
const skipRepeatCalls = f => {
    let lastValue = null;
    return (value) => {
        if (lastValue !== value) {
            f(value);
            lastValue = value;
        };
    }
}