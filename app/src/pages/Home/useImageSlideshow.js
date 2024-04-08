import { useEffect, useState, useCallback, useRef } from 'react';
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
  const [isWaiting, setIsWaiting] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [editedImage, setEditedImage] = useState(null);
  const intervalRef = useRef(null);


  const debouncedUpdateImage = useCallback(dynamicDebounce(async (newImage) => {
    setIsWaiting(false);
    setIsLoading(true); 
    const startTime = new Date().getTime();
    const loadedImage = await loadImage(newImage);
    setEditedImage({...loadedImage, generationTime: new Date().getTime() - startTime});
    setIsLoading(false);
  }), [setEditedImage, setIsWaiting]);

  const updateImage = useCallback((newImage) => {
    stop(true);
    setEditedImage(newImage);

    const serverLoad = getLastServerLoad();
    const dynamicDebounceTime = Math.min(20000, 1000 + 2000 * serverLoad);
    
    let countDown = Math.floor(dynamicDebounceTime / 1000); // Assuming dynamicDebounceTime is in milliseconds
    if (intervalRef.current)
      clearInterval(intervalRef.current);
    intervalRef.current = setInterval(() => {
      setIsWaiting(countDown);
      countDown -= 1;
      if (countDown < 0) {
        clearInterval(intervalRef.current);
      }
    }, 1000);

    debouncedUpdateImage(dynamicDebounceTime, newImage);

  }, [debouncedUpdateImage, stop, image]);

  image = editedImage || image;

  return { updateImage, isWaiting, image, isLoading };
}


const loadImage = async (newImage) => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.src = newImage.imageURL;
    img.onload = () => resolve({
      ...newImage, 
      loaded: true, 
    });
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

/**
 * Custom hook to manage a countdown timer.
 * @returns {{startCountdown: (time: number) => void, countdown: number}}
 */
function useCountdown() {
  const [countdown, setCountdown] = useState(0);
  const intervalRef = useRef();

  /**
   * Starts the countdown from the specified time, resetting any existing countdown.
   * @param {number} time - The time in seconds from which to start the countdown.
   */
  const startCountdown = (time) => {
    clearInterval(intervalRef.current); // Clear existing countdown
    setCountdown(time);
    intervalRef.current = setInterval(() => {
      setCountdown((prevCountdown) => {
        if (prevCountdown <= 1) {
          clearInterval(intervalRef.current);
          return 0;
        }
        return prevCountdown - 1;
      });
    }, 1000);
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => clearInterval(intervalRef.current);
  }, []);

  return { countdown, startCountdown };
}