import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';

const CLOUDFLARE_ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID;
const CLOUDFLARE_API_TOKEN = process.env.CLOUDFLARE_API_TOKEN;

if (!CLOUDFLARE_ACCOUNT_ID || !CLOUDFLARE_API_TOKEN) {
    console.error('Please set CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN environment variables');
    process.exit(1);
}

const url = `https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/ai/run/@cf/black-forest-labs/flux-1-schnell`;

const main = async () => {
    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${CLOUDFLARE_API_TOKEN}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                prompt: "my cat loves me"
            })
        });

        const data = await response.json();
        console.log('Response keys:', Object.keys(data));
        
        if (data.result && data.result.image) {
            const imageBuffer = Buffer.from(data.result.image, 'base64');
            const outputPath = path.join(process.cwd(), 'output.png');
            fs.writeFileSync(outputPath, imageBuffer);
            console.log(`Image saved to: ${outputPath}`);
        }

        console.log('\nFull response:', JSON.stringify(data, null, 2));
    } catch (error) {
        console.error('Error:', error);
    }
}

main();