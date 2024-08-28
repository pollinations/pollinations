import 'dotenv/config'

const measurementId = process.env.GA_MEASUREMENT_ID;
const apiSecret = process.env.GA_API_SECRET;



export async function sendToAnalytics(request, name, metadata) {
    const referrer = request.headers.referer || request.headers.referrer;
    const userAgent = request.headers['user-agent'];
    const language = request.headers['accept-language'];
    const clientIP = request.headers["x-real-ip"] || request.headers['x-forwarded-for'] || request.connection.remoteAddress;
    
    // Extracting query parameters
    const queryParams = request.query; 

    const response = await fetch(`https://www.google-analytics.com/mp/collect?measurement_id=${measurementId}&api_secret=${apiSecret}`, {
        method: "POST",
        body: JSON.stringify({
        client_id:clientIP,
        "events": [{
            "name": name,
            "params": { 
                ...metadata, 
                referrer,
                userAgent,
                language,
                queryParams
            }
        }]
        })
    });
    const responseText = await response.text();
    // console.log("Google Analytics response text:", responseText);
    // console.log("Google Analytics response status:", response.status);
}