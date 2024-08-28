export function getIp(req) {
  const ip = req.headers["x-bb-ip"] || req.headers["x-nf-client-connection-ip"] || req.headers["x-real-ip"] || req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  if (!ip) return null;
  const ipSegments = ip.split('.').slice(0, 3).join('.');
  return ipSegments;
}
