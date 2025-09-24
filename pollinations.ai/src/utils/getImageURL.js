/**
 * Generates an image URL based on provided parameters.
 * @param {Object} newImage - The image parameters.
 * @returns {string} - The constructed image URL.
 */
export function getImageURL(newImage) {
    let imageURL = `https://pollinations.ai/p/${encodeURIComponent(newImage.prompt)}`;
    const queryParams = [];

    if (newImage.width && newImage.width !== 1024 && newImage.width !== "1024")
        queryParams.push(`width=${newImage.width}`);
    if (
        newImage.height &&
        newImage.height !== 1024 &&
        newImage.height !== "1024"
    )
        queryParams.push(`height=${newImage.height}`);
    if (newImage.seed && newImage.seed !== 42 && newImage.seed !== "42")
        queryParams.push(`seed=${newImage.seed}`);
    if (newImage.enhance) queryParams.push(`enhance=${newImage.enhance}`);
    if (newImage.nologo) queryParams.push(`nologo=${newImage.nologo}`);
    if (newImage.model) queryParams.push(`model=${newImage.model}`);

    const imageList = Array.isArray(newImage.image)
        ? newImage.image
        : typeof newImage.image === "string"
          ? [newImage.image]
          : [];

    const sanitizedImages = imageList
        .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
        .filter((entry) => entry && !entry.startsWith("data:"));

    if (sanitizedImages.length > 0) {
        const encoded = sanitizedImages.map((entry) => encodeURIComponent(entry));
        queryParams.push(`image=${encoded.join(",")}`);
    }

    if (queryParams.length > 0) {
        imageURL += "?" + queryParams.join("&");
    }
    return imageURL;
}
