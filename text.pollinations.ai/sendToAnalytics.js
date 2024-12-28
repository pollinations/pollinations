import 'dotenv/config';
import crypto from 'crypto';
import dotenv from 'dotenv';

dotenv.config();

const measurementId = process.env.GA_MEASUREMENT_ID;
const apiSecret = process.env.GA_API_SECRET;

function getClientId(request) {
    // Try to get existing GA client ID from cookies
    const cookies = request.headers?.cookie?.split(';').reduce((acc, cookie) => {
        const [key, value] = cookie.trim().split('=');
        acc[key] = value;
        return acc;
    }, {});
    
    return cookies?._ga?.split('.')?.[2] || crypto.randomUUID();
}

export async function sendToAnalytics(request, name, metadata) {
    try {
        if (!request || !name || !measurementId || !apiSecret) {
            console.log('Missing required parameters');
            return;
        }

        const clientId = getClientId(request);
        console.log('Analytics client ID:', clientId);

        const response = await fetch(`https://www.google-analytics.com/mp/collect?measurement_id=${measurementId}&api_secret=${apiSecret}`, {
            method: "POST",
            body: JSON.stringify({
                client_id: clientId,
                events: [{
                    name: name,
                    params: metadata || {}
                }]
            })
        });

        console.log('Analytics status:', response.status);
        return response.ok;
    } catch (error) {
        console.error('Analytics error:', error);
        return false;
    }
}
