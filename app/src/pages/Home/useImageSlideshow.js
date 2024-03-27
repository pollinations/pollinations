import { useEffect, useState, useCallback } from 'react';
import { useInterval } from 'usehooks-ts'
import { getLastServerLoad } from './useFeedLoader';

// Assuming server load is a constant value of 5 for now

export function useImageSlideshow() {
  const [image, setImage] = useState({});
  const [isLoading, setIsLoading] = useState(false);
  const [loadedImages, setLoadedImages] = useState([]);
  const [isStopped, stop] = useState(false);

  const nextImage = useCallback(async () => {
    setLoadedImages(loadedImages => {
      console.log("imgs", loadedImages, isStopped)
      if (loadedImages.length > 0) {
        const [img, ...newLoadedImages] = loadedImages;
        setImage(img);
        return newLoadedImages;
      }
      return loadedImages;
    })
  }, [loadedImages, isStopped]);

  useInterval(() => {
    if (!isStopped)
      nextImage();
  }, 3000);

  const onNewImage = useCallback((newImage, emptyQueue=false) => {
    if (isStopped)
      return
    return new Promise((resolve, reject) => {
      console.log("loading new image", newImage.prompt, emptyQueue);
      const img = new Image();
      img.src = newImage.imageURL;
      img.onload = () => {
        console.log("loaded new image", newImage.prompt);
        setLoadedImages(images => [...images, newImage]);
        if (emptyQueue)
          setImage(newImage);
        resolve();
      };
      img.onerror = (error) => {
        console.error("Error loading image", newImage.prompt, error);
        reject(error);
      };
    });
  }, [setLoadedImages, isStopped]);

  const dynamicDebounce = (func) => {
    let timerId;
    return (delay, ...args) => {
      clearTimeout(timerId);
      timerId = setTimeout(() => {
        func(...args);
      }, delay);
    };
  };

  const debouncedUpdateImage = useCallback(dynamicDebounce(async (newImage) => {
    await onNewImage(newImage, true);
    setIsLoading(false);
  }), [onNewImage]);

  const updateImage = useCallback((newImage) => {
    console.log("calling update image", newImage);
    const { imageURL, ...rest } = newImage
    setImage({ ...rest, imageURL: image.imageURL });

    setIsLoading(true);
    stop(true);

    const dynamicDebounceTime = Math.min(20000, 1000 + 2000 * getLastServerLoad()); // Adjusting debounce time based on server load
    console.log("debounce time", dynamicDebounceTime);
    debouncedUpdateImage(dynamicDebounceTime, newImage);

  }, [stop, debouncedUpdateImage, image]);

  return { image, updateImage, isLoading, onNewImage };
}
