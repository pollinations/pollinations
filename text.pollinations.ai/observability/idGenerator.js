// ID generation utilities

// Generate unique ID with PLN suffix
export function generatePollinationsId() {
    const hexChars = "0123456789abcdef";
    let hexPart = "";
    for (let i = 0; i < 16; i++) {
        hexPart += hexChars[Math.floor(Math.random() * 16)];
    }
    return `${hexPart}-PLN`;
}

// Use cf-ray or generate new ID
export function getOrGenerateId(cfRay) {
    if (cfRay && cfRay.trim() !== "") {
        return cfRay;
    }
    return generatePollinationsId();
}
