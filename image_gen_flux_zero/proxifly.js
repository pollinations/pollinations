// import Proxifly from 'proxifly';
import fetch from 'node-fetch';
import { HttpsProxyAgent } from 'https-proxy-agent';
import sleep from 'await-sleep';

// const proxifly = new Proxifly({ apiKey: 'your_api_key' });

// proxifly.getProxy({
//     countries: ['US', 'RU', 'CA', 'GB', 'FR', 'DE', 'JP', 'CN', 'IN', 'BR', 'AU', 'IT', 'ES', 'NL', 'SE', 'CH', 'NO', 'FI', 'DK', 'BE'],
//     protocol: ['http', 'socks4'],
//     quantity: 20,
//     https: false
// })
//     .then(result => console.log(result))
//     .catch(error => console.error('Error fetching proxies:', error));





// import { Client } from "@gradio/client";

// const client = await Client.connect("black-forest-labs/FLUX.1-schnell");
// const result = await client.predict("/infer", {
//     prompt: "Hello!!",
//     seed: 0,
//     randomize_seed: true,
//     width: 256,
//     height: 256,
//     num_inference_steps: 1,
// });

// console.log(result.data);

function getRandomProxyAgent() {
    const proxies = [
        { ip: "45.127.248.127", port: "5128", username: "uqyagbev", password: "kajhqlhyhuwj" },
        { ip: "64.64.118.149", port: "6732", username: "uqyagbev", password: "kajhqlhyhuwj" },
        { ip: "157.52.253.244", port: "6204", username: "uqyagbev", password: "kajhqlhyhuwj" },
        { ip: "167.160.180.203", port: "6754", username: "uqyagbev", password: "kajhqlhyhuwj" },
        { ip: "166.88.58.10", port: "5735", username: "uqyagbev", password: "kajhqlhyhuwj" },
        { ip: "173.0.9.70", port: "5653", username: "uqyagbev", password: "kajhqlhyhuwj" },
        { ip: "45.151.162.198", port: "6600", username: "uqyagbev", password: "kajhqlhyhuwj" },
        { ip: "204.44.69.89", port: "6342", username: "uqyagbev", password: "kajhqlhyhuwj" },
        { ip: "173.0.9.209", port: "5792", username: "uqyagbev", password: "kajhqlhyhuwj" },
        { ip: "206.41.172.74", port: "6634", username: "uqyagbev", password: "kajhqlhyhuwj" }
    ];

    const randomIndex = Math.floor(Math.random() * proxies.length);
    const selectedProxy = proxies[randomIndex];
    const proxyUrl = `http://${selectedProxy.username}:${selectedProxy.password}@${selectedProxy.ip}:${selectedProxy.port}`;
    return new HttpsProxyAgent(proxyUrl);
}


// Example usage
async function callInfer() {
    const agent = null;//getRandomProxyAgent();
    try {
        const initialResponse = await fetch('https://black-forest-labs-flux-1-schnell.hf.space/call/infer', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                data: [
                    "Hello!!",
                    123,
                    true,
                    256,
                    256,
                    1
                ]
            }),
            agent
        });
        const responseJson = await initialResponse.json();
        console.log(responseJson);
        const eventId = responseJson.event_id;
        console.log("eventId", eventId);

        while (true) {
            console.log("Checking for eventId", eventId);
            const finalResponse = await fetch(`https://black-forest-labs-flux-1-schnell.hf.space/call/infer/${eventId}`, {
                agent
            });
            const finalText = await finalResponse.text();
            console.log(finalText);
            await sleep(5000);
        }
    } catch (error) {
        console.error('Error:', error);
    }
}

callInfer();
