import { useEffect, useState, useCallback } from 'react';
import { debounce } from 'lodash';
import { useInterval } from 'usehooks-ts'

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
  }, [setLoadedImages]);
  
  
  const debouncedUpdateImage = useCallback(debounce(async (newImage) => {
    // console.log("debounced new image", newImage.prompt)
    await onNewImage(newImage, true);
    setIsLoading(false);
  }, 6000), [onNewImage]);

  const updateImage = useCallback((newImage) => {
    console.log("calling update image", newImage);
    
    // TODO: this is a bit hacky. we should probably separate slideshow logic from override image logic in the future
    const { imageURL, ...rest } = newImage
    setImage({ ...rest, imageURL: image.imageURL });

    setIsLoading(true);
    stop(true);
    debouncedUpdateImage(newImage);
  }, [stop, debouncedUpdateImage, image]); // Debounce time of 3000ms


  return { image, updateImage, isLoading, onNewImage };
}
