import { useEffect, useState, useCallback, useRef } from 'react';
import { useInterval } from 'usehooks-ts';
import { getLastServerLoad } from './useFeedLoader';
import debug from 'debug';

const log = debug('useImageSlideshow');

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
  }, [loadingImages]);

  const urlParams = new URLSearchParams(window.location.search);
  const nsfwParam = urlParams.get('nsfw');
  const interval = nsfwParam === 'true' ? 100 : 3000;

  useInterval(() => {
    if (!isStopped) nextImage();
  }, interval);

  useEffect(() => {
    nextImage();
  }, [])

  const onNewImage = useCallback((newImage) => {
    setLoadingImages(images => [...images, newImage]);
  }, []);

  return { image, onNewImage, stop, isStopped };
}

export function useImageEditor({ stop, image }) {
  const [isLoading, setIsLoading] = useState(false);
  const [editedImage, setEditedImage] = useState(null);
  const abortControllerRef = useRef(null);

  const updateImage = useCallback(async (newImage) => {
    stop(true);
    setIsLoading(true);

    // Create new AbortController for this request
    abortControllerRef.current = new AbortController();

    try {
      console.log("Updating image with newImage:", newImage);
      const loadedImage = await loadImage(newImage);
      setEditedImage(loadedImage);
    } catch (error) {
      if (error.name === 'AbortError') {
        console.log('Image loading cancelled');
      } else {
        console.error('Error loading image:', error);
      }
    } finally {
      setIsLoading(false);
    }
  }, [stop]);

  const cancelLoading = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      setIsLoading(false);
    }
  }, []);

  image = editedImage || image;

  return { updateImage, cancelLoading, image, isLoading, setIsLoading };
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