import { useEffect } from "react";

export default function useAfterImagesLoaded(ref, callback, renderTrigger = null) {

    useEffect(() => {
        if (ref.current && ref.current.children.length > 0) {
            waitForImageLoad(ref.current)
                .then((loaded) => {
                    if (loaded) {
                        callback(ref.current)
                    }
                })
        }
    }, renderTrigger ? [renderTrigger] : []);
}

async function waitForImageLoad(container, timeoutMs = 10000) {
    const allLoaded = (arr) => arr.every(el => el === true)
    const selectImages = () => Array.from(container.querySelectorAll("img"))
    const imageLoaded = (img) => img.complete && img.naturalHeight !== 0
    const images = selectImages()

    let loadedArray = images.map(imageLoaded)
    if (allLoaded(loadedArray)) {
        // Already loaded
        return true
    }
    loadedArray = await Promise.all(selectImages().map(async (image, i) => {
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                console.error(`${timeoutMs}ms timeout exceeded. Not loaded: ${i}th image.`, image, image.complete)
                reject(false)
            }, timeoutMs)
            // If already loaded, resolve
            if (imageLoaded(image)) {
                clearTimeout(timeout)
                return resolve(true)
            }
            // If not already loaded, add listener on load, then resolve
            image.addEventListener("load", (e) => {
                if (imageLoaded(image)) {
                    clearTimeout(timeout)
                    return resolve(true)
                }
            })
        })
    }))
    return allLoaded(loadedArray)
}