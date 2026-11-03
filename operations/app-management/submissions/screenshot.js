const sharp = require("sharp");
const { downloadScreenshot, screenshotErrors } = require("./submission.js");

function toCatalogWebp(buffer) {
    return sharp(buffer)
        .resize(1280, 720, { fit: "cover", position: "top" })
        .webp({ quality: 80 })
        .toBuffer();
}

module.exports = { downloadScreenshot, screenshotErrors, toCatalogWebp };
