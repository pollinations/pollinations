/**
 * Generates an image URL based on provided parameters.
 * @param {Object} newImage - The image parameters.
 * @returns {string} - The constructed image URL.
 */
import { modelSupportsImageInput } from "../config/imageModels";

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

    if (newImage.image) {
        const imagesArray = Array.isArray(newImage.image)
            ? newImage.image
            : typeof newImage.image === "string"
              ? newImage.image.split(",").map((item) => item.trim())
              : [];

        if (imagesArray.length > 0 && modelSupportsImageInput(newImage.model)) {
            const encodedImages = imagesArray
                .filter(Boolean)
                .map((img) => encodeURIComponent(img))
                .join(",");
            if (encodedImages) {
                queryParams.push(`image=${encodedImages}`);
            }
        }
    }

    queryParams.push("referrer=p0ll1!");

    if (queryParams.length > 0) {
        imageURL += "?" + queryParams.join("&");
    }
    return imageURL;
}
