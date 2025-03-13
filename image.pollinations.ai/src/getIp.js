
// Function to get IP address
export function getIp(req) {
  // Prioritize standard proxy headers and add cloudflare-specific headers
  const ip = req.headers["x-bb-ip"] || 
             req.headers["x-nf-client-connection-ip"] || 
             req.headers["x-real-ip"] || 
             req.headers['x-forwarded-for'] || 
             req.headers['cf-connecting-ip'] ||
             (req.socket ? req.socket.remoteAddress : null);
  

  // console.log("Headers:", req.headers);

  
  if (!ip) return null;
  
  // Handle x-forwarded-for which can contain multiple IPs (client, proxy1, proxy2, ...)
  // The client IP is typically the first one in the list
  const cleanIp = ip.split(',')[0].trim();
  
  // Check if IPv4 or IPv6
  if (cleanIp.includes(':')) {
      // IPv6 address
      // For IPv6, the first 4 segments (64 bits) typically identify the network
      // This is usually the global routing prefix (48 bits) + subnet ID (16 bits)
      // We'll take the first 4 segments to identify the network while preserving privacy
      
      // Handle special IPv6 formats like ::1 or 2001::
      const segments = cleanIp.split(':');
      let normalizedSegments = [];
      
      // Handle :: notation (compressed zeros)
      if (cleanIp.includes('::')) {
          const parts = cleanIp.split('::');
          const leftPart = parts[0] ? parts[0].split(':') : [];
          const rightPart = parts[1] ? parts[1].split(':') : [];
          
          // Calculate how many zero segments are represented by ::
          const missingSegments = 8 - leftPart.length - rightPart.length;
          
          normalizedSegments = [
              ...leftPart,
              ...Array(missingSegments).fill('0'),
              ...rightPart
          ];
      } else {
          normalizedSegments = segments;
      }
      
      // Take the first 4 segments (64 bits) which typically represent the network prefix
      return normalizedSegments.slice(0, 4).join(':');
  } else {
      // IPv4 address - take first 3 segments as before
      const ipv4Segments = cleanIp.split('.').slice(0, 3).join('.');
      // if (ipv4Segments === "128.116")
      //     throw new Error('Pollinations cloud credits exceeded. Please try again later.');
      return ipv4Segments;
  }
}
