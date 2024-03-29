import { useEffect, useState, useCallback } from 'react';
import { useInterval } from 'usehooks-ts';
import { debounce } from 'lodash';
import { getLastServerLoad } from './useFeedLoader';

export function useImageSlideshow() {
  const [image, setImage] = useState({});
  const [loadingImages, setLoadingImages] = useState([]);
  const [isStopped, stop] = useState(false);



  const nextImage = useCallback(async () => {
    if (loadingImages.length > 0) {
      const [img, ...reducedLoadingImages] = loadingImages;
      setImage(img);
      try {
        const loadedImage = await loadImage(img);
        setImage(loadedImage);
      } catch (error) {
        console.error("Failed to load image", error);
      }
      setLoadingImages(reducedLoadingImages);
    }
  }, [loadingImages]); // Corrected by including loadingImages in the dependency array

  useInterval(() => {
    if (!isStopped) nextImage();
  }, 3000);

  const onNewImage = useCallback((newImage) => {
    setLoadingImages(images => [...images, newImage]);
  }, []);

  return { image, onNewImage, stop };
}

export function useImageEditor({ stop, image }) {
  const [isWaiting, setIsWaiting] = useState(false);
  const [editedImage, setEditedImage] = useState(null);
  


  const debouncedUpdateImage = useCallback(dynamicDebounce(async (newImage) => {
    await loadImage(newImage);
    setEditedImage(image => ({...image, imageURL: newImage.imageURL}))
    setIsWaiting(false);
  }), [setEditedImage, setIsWaiting]);

  const updateImage = useCallback((newImage) => {
    stop(true);
    setIsWaiting(true);
    setEditedImage(newImage);

    const serverLoad = getLastServerLoad();
    const dynamicDebounceTime = Math.min(20000, 1000 + 2000 * serverLoad);

    debouncedUpdateImage(dynamicDebounceTime, newImage);

  }, [debouncedUpdateImage, stop, image]);

  image = editedImage || image;

  return { updateImage, isWaiting, image };
}


const loadImage = async (newImage) => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.src = newImage.imageURL;
    img.onload = () => resolve({...newImage, loaded: true});
    img.onerror = (error) => reject(error);
  });
};


const dynamicDebounce = (func) => {
  let timerId;
  return (delay, ...args) => {
    clearTimeout(timerId);
    timerId = setTimeout(() => {
      func(...args);
    }, delay);
  };
};
