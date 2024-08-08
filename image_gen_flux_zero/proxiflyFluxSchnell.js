import fetch from 'node-fetch';
import HttpsProxyAgent from 'https-proxy-agent';
import sleep from 'await-sleep';
import fs from 'fs';
import path from 'path';
import http from 'http';

function getRandomProxyAgent() {
    const proxyFilePath = path.join('webshare_100_proxies.txt');
    const proxyList = fs.readFileSync(proxyFilePath, 'utf-8').split('\n').filter(Boolean);

    const proxies = proxyList.map(proxy => {
        const [ip, port, username, password] = proxy.split(':');
        return { ip, port, username, password };
    });

    const randomIndex = Math.floor(Math.random() * proxies.length);
    const selectedProxy = proxies[randomIndex];
    const proxyUrl = `http://${selectedProxy.username}:${selectedProxy.password}@${selectedProxy.ip}:${selectedProxy.port}`;
    console.log(`Using proxy: ${proxyUrl}`);
    return new HttpsProxyAgent(proxyUrl);
}

async function getImage({ prompt = "Hello!!", seed = 123, randomizeSeed = true, width = 768, height = 768, numInferenceSteps = 2 } = {}) {
    const agent = getRandomProxyAgent();
    try {
        console.log('Sending initial request to generate image');
        const initialResponse = await fetch('https://black-forest-labs-flux-1-schnell.hf.space/call/infer', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                data: [
                    prompt,
                    seed,
                    randomizeSeed,
                    width,
                    height,
                    numInferenceSteps
                ]
            }),
            agent
        });
        console.log('Initial request sent');
        const responseJson = await initialResponse.json();
        console.log('Initial response received:', responseJson);
        const eventId = responseJson.event_id;
        console.log("eventId", eventId);

        while (true) {
            console.log("Checking for eventId", eventId);
            const finalResponse = await fetch(`https://black-forest-labs-flux-1-schnell.hf.space/call/infer/${eventId}`, {
                agent
            });
            console.log('Final request sent for eventId:', eventId);
            const finalText = await finalResponse.text();
            console.log('Final response received:', finalText);

            if (finalText.startsWith('event:')) {
                const [event, data] = finalText.split('\ndata: ');
                const eventType = event.split(': ')[1];
                console.log("eventType", eventType);
                if (eventType === 'error') {
                    console.error('Error event received:', data);
                    break;
                } else if (eventType === 'complete') {
                    const finalData = JSON.parse(data);
                    console.log('Final URL:', finalData[0].url);

                    // Fetch the final URL with the same proxy and return the base64 image
                    console.log('Fetching final image from URL');
                    const finalUrlResponse = await fetch(finalData[0].url, { agent });
                    const buffer = await finalUrlResponse.buffer();
                    const base64Image = buffer.toString('base64');
                    console.log('Returning base64 image');
                    return base64Image;
                }
            }

            await sleep(5000);
        }
    } catch (error) {
        console.error('Error:', error);
        throw error;
    }
}

const server = http.createServer(async (req, res) => {
    console.log(`Received request: ${req.method} ${req.url}`);
    if (req.method === 'POST' && req.url === '/generate') {
        let body = '';
        req.on('data', chunk => {
            body += chunk.toString();
            console.log('Received chunk of data');
        });
        req.on('end', async () => {
            console.log('Request body fully received:', body);
            try {
                const params = JSON.parse(body);
                console.log('Parsed request parameters:', params);
                const base64Image = await getImage(params);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ image: base64Image }));
                console.log('Response sent with generated image');
            } catch (error) {
                console.error('Error processing request:', error);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: error.message }));
            }
        });
    } else {
        console.log('Request not found');
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Not Found' }));
    }
});

const PORT = process.env.PORT || 5556;
server.listen(PORT, () => {
    console.log(`Server is listening on port ${PORT}`);
});

export { getImage };
